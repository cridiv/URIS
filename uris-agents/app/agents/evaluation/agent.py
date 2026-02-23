import json
import re
from typing import Dict, Any, Optional
from ...utils.bedrock import invoke_nova
from .prompt import EVALUATION_SYSTEM_PROMPT
from ...utils.profiler import profile_dataset

def run_evaluation(
    dataset_path: str,
    task_type: str,
    target_column: Optional[str] = None,
) -> Dict[str, Any]:
    """
    Execute Evaluation Agent:
    1. Profile dataset directly
    2. Invoke Nova 2 Lite with profile as ground truth
    3. Clean & parse JSON output
    """
    profile = profile_dataset(dataset_path)

    user_message = f"""\
Task type: {task_type}
Target column: {target_column or 'not specified'}

Pre-computed Dataset Profile (treat all values as ground truth):
{json.dumps(profile, indent=2)}

Using only the values in the profile above, analyze the dataset and return the structured evaluation JSON.
"""

    raw_response = invoke_nova(EVALUATION_SYSTEM_PROMPT, user_message)

    cleaned = re.sub(r'^```(?:json)?\s*|\s*```$', '', raw_response, flags=re.MULTILINE).strip()

    try:
        parsed = json.loads(cleaned)

        required = {"schema_summary", "quality_scores", "critical_gaps", "confidence", "reasoning_steps", "adfi", "recommended_focus"}
        if not required.issubset(parsed.keys()):
            missing = required - set(parsed.keys())
            raise ValueError(f"Missing keys in output: {missing}")

        # Compute ADFI deterministically — do not trust Nova's value
        scores = parsed["quality_scores"]
        null_rates = [col["missing_pct"] for col in parsed["schema_summary"]["columns"]]
        avg_null = sum(null_rates) / len(null_rates)
        weighted_completeness = max(0.0, 1.0 - (avg_null * 2))

        parsed["adfi"] = round(
            0.30 * weighted_completeness +
            0.25 * (scores["balance"] if scores["balance"] is not None else 1.0) +
            0.20 * scores["distribution_quality"] +
            0.15 * scores["consistency"] +
            0.10 * scores["uniqueness"],
            3
        )
        parsed["quality_scores"]["completeness"] = round(weighted_completeness, 3)

        return {
            "status": "success",
            "evaluation": parsed,
            "profile": profile,
            "raw_nova_output": raw_response
        }

    except (json.JSONDecodeError, ValueError) as e:
        return {
            "status": "error",
            "message": str(e),
            "raw_nova_output": raw_response,
            "cleaned_text": cleaned
        }