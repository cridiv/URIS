import json
import re
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


def run_planner(dataset_summary: dict, user_goal: str) -> dict:
    """
    Execute Planner Agent:
    1. Build user message from evaluation output and user goal
    2. Invoke Nova 2 Lite
    3. Clean & parse JSON output
    """
    user_message = f"""\
Dataset Summary:
{json.dumps(dataset_summary, indent=2)}

User Goal:
{user_goal}

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

        return {"status": "success", "plan": plan}

    except (json.JSONDecodeError, ValueError) as e:
        return {
            "status": "error",
            "message": str(e),
            "raw_output": raw_output
        }