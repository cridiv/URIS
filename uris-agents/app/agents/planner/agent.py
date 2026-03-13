import json
import re
from typing import Any, Dict, Optional
from ...utils.bedrock import invoke_nova
from .prompt import PLANNER_SYSTEM_PROMPT


def _fix_json_string(s: str) -> str:
    """
    Attempt to fix common JSON issues:
    - Unquoted property names: key: "value" → "key": "value"
    - Single quotes to double quotes in some cases
    - Remove trailing commas before closing braces/brackets
    """
    # Remove trailing commas before closing braces/brackets
    s = re.sub(r',(\s*[}\]])', r'\1', s)
    
    # Try to fix unquoted keys: matches patterns like word: or word:
    # This regex looks for words followed by a colon, but not already quoted
    s = re.sub(r'([{,]\s*)([a-zA-Z_][a-zA-Z0-9_]*)(\s*:)', r'\1"\2"\3', s)
    
    return s


def _normalize_policy_context(policy_config: Optional[Dict[str, Any]]) -> Dict[str, Any]:
    policy_config = policy_config or {}

    frameworks = []
    for framework in policy_config.get("frameworks_attached", []):
        framework_id = framework.get("id") or framework.get("name")
        if framework_id:
            frameworks.append(framework_id)

    custom_policies = []
    for policy in policy_config.get("custom_policies_attached", []):
        policy_name = policy.get("name") or policy.get("id")
        if policy_name:
            custom_policies.append(policy_name)

    resolved_directives = []
    column_targets = []
    dataset_scope_directives = []

    for directive in policy_config.get("resolved_directives", []):
        normalized = {
            "verb": directive.get("verb"),
            "target": directive.get("target"),
            "scope": directive.get("scope", "column"),
            "condition": directive.get("condition"),
            "source": directive.get("source"),
            "priority": directive.get("priority"),
        }
        resolved_directives.append(normalized)

        target = normalized.get("target") or ""
        if normalized["scope"] == "column" and target.startswith("col:"):
            column_targets.append(target[4:])
        elif normalized["scope"] == "dataset":
            dataset_scope_directives.append(normalized)

    return {
        "has_policy": bool(resolved_directives or frameworks or custom_policies),
        "frameworks_active": frameworks,
        "custom_policies_active": custom_policies,
        "resolved_directives": resolved_directives,
        "column_targets": sorted(set(column_targets)),
        "dataset_scope_directives": dataset_scope_directives,
        "directive_count": len(resolved_directives),
    }


def run_planner(
    dataset_summary: Dict[str, Any],
    user_goal: str,
    policy_config: Optional[Dict[str, Any]] = None,
) -> dict:
    """
    Execute Planner Agent:
    1. Build user message from evaluation output, user goal, and attached policy context
    2. Invoke Nova 2 Lite
    3. Clean & parse JSON output
    4. Stamp deterministic downstream delegation context onto the plan
    """
    policy_context = _normalize_policy_context(policy_config)

    user_message = f"""\
Dataset Summary:
{json.dumps(dataset_summary, indent=2)}

User Goal:
{user_goal}

Policy Context:
{json.dumps(policy_context, indent=2)}

Produce the structured plan now.
"""

    raw_output = invoke_nova(PLANNER_SYSTEM_PROMPT, user_message)

    cleaned = re.sub(r'^```(?:json)?\s*|\s*```$', '', raw_output, flags=re.MULTILINE).strip()
    
    # Try to fix common JSON issues
    cleaned = _fix_json_string(cleaned)

    try:
        plan = json.loads(cleaned)

        required = {"objective", "target_column", "constraints", "risk_tolerance", "ordered_tasks", "revision_triggers", "reasoning", "adfi_baseline_estimate"}
        if not required.issubset(plan.keys()):
            missing = required - set(plan.keys())
            raise ValueError(f"Missing keys in planner output: {missing}")

        plan["policy_context"] = policy_context

        return {"status": "success", "plan": plan}

    except (json.JSONDecodeError, ValueError) as e:
        return {
            "status": "error",
            "message": str(e),
            "raw_output": raw_output
        }