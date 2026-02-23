import json
import re
from ...utils.bedrock import invoke_nova
from .prompt import PLANNER_SYSTEM_PROMPT


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