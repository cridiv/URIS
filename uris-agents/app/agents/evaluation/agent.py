import json
import re
from typing import Dict, Any, Optional
from ...utils.bedrock import invoke_nova
from .prompt import EVALUATION_SYSTEM_PROMPT
from ...utils.profiler import profile_dataset


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
    
    # Try to fix common JSON issues
    cleaned = _fix_json_string(cleaned)

    try:
        parsed = json.loads(cleaned)

        required = {"schema_summary", "quality_scores", "critical_gaps", "confidence", "reasoning_steps", "adfi", "recommended_focus"}
        if not required.issubset(parsed.keys()):
            missing = required - set(parsed.keys())
            raise ValueError(f"Missing keys in output: {missing}")

        # Compute ADFI deterministically — do not trust Nova's value
        scores = parsed["quality_scores"]
        null_rates = [col["missing_pct"] for col in parsed["schema_summary"]["columns"]]
        avg_null = sum(null_rates) / len(null_rates) if null_rates else 0.0
        weighted_completeness = max(0.0, 1.0 - (avg_null * 2))

        # Handle None values in quality scores with safe defaults
        balance_score = scores.get("balance") if scores.get("balance") is not None else 1.0
        distribution_score = scores.get("distribution_quality") if scores.get("distribution_quality") is not None else 0.5
        consistency_score = scores.get("consistency") if scores.get("consistency") is not None else 0.5
        uniqueness_score = scores.get("uniqueness") if scores.get("uniqueness") is not None else 0.5

        parsed["adfi"] = round(
            0.30 * weighted_completeness +
            0.25 * balance_score +
            0.20 * distribution_score +
            0.15 * consistency_score +
            0.10 * uniqueness_score,
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