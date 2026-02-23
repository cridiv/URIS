import json
import re
from typing import Optional
from ...utils.bedrock import invoke_nova
from ...utils.profiler import profile_dataset
from ...utils.structure_extractor import extract_structure_hints
from .prompt import COMPLIANCE_SYSTEM_PROMPT


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
) -> dict:
    """
    Execute Compliance Agent:
    1. Extract structure hints for PII-flagged columns
    2. Build user message from evaluation + structure hints
    3. Invoke Nova 2 Lite
    4. Parse response and override privacy_risk_score deterministically
    """

    # Pull PII-flagged columns from evaluation schema
    pii_columns = [
        col["name"]
        for col in evaluation.get("schema_summary", {}).get("columns", [])
        if col.get("potential_pii", False)
    ]

    # Run structure extractor on PII columns before Nova sees anything
    structure_hints = extract_structure_hints(
        dataset_path=dataset_path,
        pii_columns=pii_columns
    )

    user_message = f"""\
Dataset Evaluation (treat all values as ground truth):
{json.dumps(evaluation, indent=2)}

Structure Analysis of PII Columns (treat all values as ground truth):
{json.dumps(structure_hints, indent=2)}

Using only the information above, produce the structured compliance JSON.
"""

    raw_response = invoke_nova(COMPLIANCE_SYSTEM_PROMPT, user_message)

    cleaned = re.sub(r'^```(?:json)?\s*|\s*```$', '', raw_response, flags=re.MULTILINE).strip()

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
        # regardless of what Nova decided
        direct_identifiers = [
            f["column"] for f in parsed["pii_findings"]
            if f["pii_type"] == "direct_identifier"
        ]
        for col in direct_identifiers:
            if col not in parsed["blocked_columns"]:
                parsed["blocked_columns"].append(col)

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