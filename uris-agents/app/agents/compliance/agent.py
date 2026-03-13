import json
import re
from typing import Any, Dict, Optional
from ...utils.bedrock import invoke_nova
from ...utils.structure_extractor import extract_structure_hints
from .prompt import COMPLIANCE_SYSTEM_PROMPT


def _planner_policy_context(plan: Optional[Dict[str, Any]]) -> Dict[str, Any]:
    if not plan:
        return {}
    return plan.get("policy_context", {}) or {}


def _apply_policy_overrides(parsed: dict, plan: Optional[Dict[str, Any]]) -> dict:
    """
    Apply planner-owned policy directives on top of Nova's compliance output.
    Planner directives are authoritative — they override Nova's decisions.

    Column-scope directives (target starts with "col:") are applied as follows:
      MASK       → pseudonymise via tokenisation; column survives in output
      BLOCK/DROP → hard remove from dataset
      GENERALISE → reduce precision (action hint for synthesizer)
      FLAG       → annotate only; no structural change
    """
    policy_context = _planner_policy_context(plan)
    if not policy_context:
        return parsed

    directives = policy_context.get("resolved_directives", [])
    if not directives:
        return parsed

    masked_columns  = list(parsed.get("masked_columns", []))
    blocked_columns = list(parsed.get("blocked_columns", []))

    # Mutable index of recommended_actions keyed by column name
    action_index: Dict[str, dict] = {
        a["column"]: a for a in parsed.get("recommended_actions", [])
    }

    def _apply_verb(col_name: str, verb: str, source: str, scope_label: str) -> None:
        """Apply a single VERB to col_name, mutating masked_columns / blocked_columns."""
        if verb == "MASK":
            if col_name in blocked_columns:
                blocked_columns.remove(col_name)
            if col_name not in masked_columns:
                masked_columns.append(col_name)
            action_index[col_name] = {
                "column": col_name,
                "action": "mask",
                "reason": f"Policy directive ({source}): MASK — {scope_label} tokenisation",
                "extraction_detail": None,
            }
        elif verb in ("BLOCK", "DROP"):
            if col_name in masked_columns:
                masked_columns.remove(col_name)
            if col_name not in blocked_columns:
                blocked_columns.append(col_name)
            action_index[col_name] = {
                "column": col_name,
                "action": "drop",
                "reason": f"Policy directive ({source}): {verb} — {scope_label}",
                "extraction_detail": None,
            }
        elif verb == "GENERALISE":
            action_index[col_name] = {
                "column": col_name,
                "action": "generalize",
                "reason": f"Policy directive ({source}): GENERALISE — {scope_label} precision reduction",
                "extraction_detail": None,
            }
        elif verb == "FLAG":
            if col_name not in action_index:
                action_index[col_name] = {
                    "column": col_name,
                    "action": "keep",
                    "reason": f"Policy directive ({source}): FLAG — {scope_label} marked for review",
                    "extraction_detail": None,
                }

    for directive in directives:
        target = directive.get("target", "")
        verb   = directive.get("verb", "")
        scope  = directive.get("scope", "column")
        source = directive.get("source", "policy")

        if scope == "column" and target.startswith("col:"):
            # ── Column-scope: explicit col:<name> ─────────────────
            _apply_verb(target[4:], verb, source, "column-scope")

        elif scope == "dataset":
            # ── Dataset-scope: apply verb to all columns matching a PII type ──
            # Determine which PII type(s) this directive targets.
            condition  = directive.get("condition", "")
            target_types: set = set()

            # Parse condition string: "pii_type IS direct_identifier"
            if condition:
                m = re.match(r'pii_type\s+IS\s+(\S+)', condition, re.IGNORECASE)
                if m:
                    target_types.add(m.group(1).lower())

            # Also derive from the target name as a fallback
            t_lower = target.lower()
            if "direct_identifier" in t_lower or t_lower == "direct":
                target_types.add("direct_identifier")
            elif "quasi_identifier" in t_lower or t_lower == "quasi":
                target_types.add("quasi_identifier")
            elif "sensitive" in t_lower:
                target_types.add("sensitive_attribute")
            elif "pii" in t_lower:
                # Generic "pii" target → all PII types
                target_types.update(["direct_identifier", "quasi_identifier", "sensitive_attribute"])

            if not target_types:
                continue  # Unrecognised scope target — skip safely

            # Collect every column whose PII type matches
            matching_cols = [
                f["column"] for f in parsed.get("pii_findings", [])
                if f.get("pii_type", "").lower() in target_types
            ]

            for col_name in matching_cols:
                _apply_verb(col_name, verb, source, "dataset-scope")

    parsed["blocked_columns"]     = blocked_columns
    parsed["masked_columns"]      = masked_columns
    parsed["recommended_actions"] = list(action_index.values())
    return parsed


def _fix_json_string(s: str) -> str:
    """
    Attempt to fix common JSON issues:
    - Unquoted property names: key: "value" → "key": "value"
    - Remove trailing commas before closing braces/brackets
    """
    # Remove trailing commas before closing braces/brackets
    s = re.sub(r',(\s*[}\]])', r'\1', s)
    
    # Try to fix unquoted keys: matches patterns like word: or word:
    # This regex looks for words followed by a colon, but not already quoted
    s = re.sub(r'([{,]\s*)([a-zA-Z_][a-zA-Z0-9_]*)(\s*:)', r'\1"\2"\3', s)
    
    return s


def _compute_privacy_risk_score(pii_findings: list, re_id_risk: dict) -> float:
    """
    Compute privacy_risk_score deterministically — do not trust Nova's value.
    """
    score = 0.0

    for finding in pii_findings:
        if finding["pii_type"] == "direct_identifier":
            score += 0.3
            break  # Only add once regardless of how many direct identifiers

    quasi_count = sum(
        1 for f in pii_findings
        if f["pii_type"] == "quasi_identifier"
    )
    score += quasi_count * 0.15

    if re_id_risk.get("score", 0.0) > 0.5:
        score += 0.2

    return round(min(score, 1.0), 3)


def run_compliance(
    dataset_path: str,
    evaluation: dict,
    plan: Optional[Dict[str, Any]] = None,
) -> dict:
    """
    Execute Compliance Agent:
    1. Extract structure hints for PII-flagged columns
    2. Build user message from evaluation + planner directives + structure hints
    3. Invoke Nova 2 Lite
    4. Override privacy_risk_score deterministically
    5. Apply planner policy directives on top of Nova's output
    """

    policy_context = _planner_policy_context(plan)

    # Pull PII-flagged columns from evaluation schema
    pii_columns = [
        col["name"]
        for col in evaluation.get("schema_summary", {}).get("columns", [])
        if col.get("potential_pii", False)
    ]
    pii_columns = sorted(set(pii_columns + policy_context.get("column_targets", [])))

    compliance_task = next(
        (task for task in plan.get("ordered_tasks", []) if task.get("agent") == "compliance"),
        None,
    ) if plan else None

    # Run structure extractor on PII columns before Nova sees anything
    structure_hints = extract_structure_hints(
        dataset_path=dataset_path,
        pii_columns=pii_columns
    )

    user_message = f"""\
Dataset Evaluation (treat all values as ground truth):
{json.dumps(evaluation, indent=2)}

Planner Delegation Context (treat all values as ground truth):
{json.dumps({
    "objective": plan.get("objective") if plan else None,
    "constraints": plan.get("constraints", []) if plan else [],
    "risk_tolerance": plan.get("risk_tolerance") if plan else None,
    "compliance_task": compliance_task,
    "policy_context": policy_context,
}, indent=2)}

Structure Analysis of PII Columns (treat all values as ground truth):
{json.dumps(structure_hints, indent=2)}

Using only the information above, produce the structured compliance JSON.
"""

    raw_response = invoke_nova(COMPLIANCE_SYSTEM_PROMPT, user_message)

    cleaned = re.sub(r'^```(?:json)?\s*|\s*```$', '', raw_response, flags=re.MULTILINE).strip()
    
    # Try to fix common JSON issues
    cleaned = _fix_json_string(cleaned)

    try:
        parsed = json.loads(cleaned)

        required = {
            "pii_findings",
            "regulatory_exposure",
            "re_identification_risk",
            "privacy_risk_score",
            "blocked_columns",
            "recommended_actions",
            "confidence",
            "reasoning_steps"
        }
        if not required.issubset(parsed.keys()):
            missing = required - set(parsed.keys())
            raise ValueError(f"Missing keys in compliance output: {missing}")

        # Override Nova's privacy_risk_score with deterministic calculation
        parsed["privacy_risk_score"] = _compute_privacy_risk_score(
            pii_findings=parsed["pii_findings"],
            re_id_risk=parsed["re_identification_risk"]
        )

        # Enforce blocked_columns — every direct identifier must be blocked
        # (this may be overridden below if a MASK policy exists for the column)
        direct_identifiers = [
            f["column"] for f in parsed["pii_findings"]
            if f["pii_type"] == "direct_identifier"
        ]
        for col in direct_identifiers:
            if col not in parsed["blocked_columns"]:
                parsed["blocked_columns"].append(col)

        # Ensure masked_columns key exists before applying overrides
        parsed.setdefault("masked_columns", [])

        # Log pre-override state
        print(f"[Compliance] Nova output — blocked: {parsed['blocked_columns']}, masked: {parsed['masked_columns']}")
        print(f"[Compliance] PII findings: {[(f['column'], f['pii_type']) for f in parsed.get('pii_findings', [])]}")
        if policy_context:
            directives = policy_context.get("resolved_directives", [])
            print(f"[Compliance] Planner policy context received — {len(directives)} directives:")
            for d in directives:
                print(f"             {d.get('verb')} {d.get('target')} (scope={d.get('scope')}, condition={d.get('condition')})")
        else:
            print("[Compliance] No planner policy context attached — skipping overrides")

        # Apply planner policy directives — these are authoritative and override
        # Nova's decisions as well as the direct-identifier enforcement above.
        parsed = _apply_policy_overrides(parsed, plan)

        print(f"[Compliance] Post-override — blocked: {parsed['blocked_columns']}, masked: {parsed['masked_columns']}")

        return {
            "status": "success",
            "compliance": parsed,
            "pii_columns_scanned": pii_columns,
            "structure_hints": structure_hints,
            "raw_nova_output": raw_response
        }

    except (json.JSONDecodeError, ValueError) as e:
        return {
            "status": "error",
            "message": str(e),
            "raw_nova_output": raw_response,
            "cleaned_text": cleaned
        }