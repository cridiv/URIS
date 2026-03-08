import json
import re
import numpy as np
import pandas as pd
from typing import Dict, Any, Optional
from ...utils.bedrock import invoke_nova
from ...utils.validator import run_validation_checks
from .prompt import VALIDATION_SYSTEM_PROMPT


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


def _clean_for_json(obj):
    """Recursively convert numpy types to JSON-serializable Python types."""
    if isinstance(obj, dict):
        return {k: _clean_for_json(v) for k, v in obj.items()}
    elif isinstance(obj, list):
        return [_clean_for_json(item) for item in obj]
    elif isinstance(obj, np.bool_):
        return bool(obj)
    elif isinstance(obj, bool):
        return obj
    elif isinstance(obj, float):
        if np.isnan(obj) or np.isinf(obj):
            return None
        return obj
    elif isinstance(obj, np.integer):
        return int(obj)
    elif isinstance(obj, np.floating):
        if np.isnan(obj) or np.isinf(obj):
            return None
        return float(obj)
    return obj


def run_validation(
    original_df: pd.DataFrame,
    augmented_df: pd.DataFrame,
    evaluation: Dict,
    synthesis_report: Dict,
    target_column: Optional[str],
    blocked_columns: list,
) -> Dict[str, Any]:
    """
    Execute Validation Agent:
    1. Run statistical checks in code (KS, chi-squared, balance, completeness)
    2. Pass results to Nova for verdict and actionable rejection reasons
    3. Parse and validate Nova's response
    """

    # ── 1. Run all checks in code ─────────────────────────────────
    adfi_before = evaluation.get("adfi", 0.0)

    validation_metrics = run_validation_checks(
        original_df=original_df,
        augmented_df=augmented_df,
        target_column=target_column,
        blocked_columns=blocked_columns,
        adfi_before=adfi_before,
    )

    # ── 2. Build Nova user message ────────────────────────────────
    user_message = f"""\
Original Evaluation (pre-synthesis):
{json.dumps(_clean_for_json(evaluation), indent=2)}

Synthesis Report:
{json.dumps(_clean_for_json(synthesis_report), indent=2)}

Pre/Post Validation Metrics (treat all values as ground truth):
{json.dumps(_clean_for_json(validation_metrics), indent=2)}

Render your verdict now.
"""

    raw_response = invoke_nova(VALIDATION_SYSTEM_PROMPT, user_message)
    cleaned = re.sub(r'^```(?:json)?\s*|\s*```$', '', raw_response, flags=re.MULTILINE).strip()
    
    # Try to fix common JSON issues
    cleaned = _fix_json_string(cleaned)

    # ── 3. Parse and validate ─────────────────────────────────────
    try:
        parsed = json.loads(cleaned)

        required = {
            "verdict",
            "confidence",
            "adfi_before",
            "adfi_after",
            "adfi_delta",
            "checks_passed",
            "checks_failed",
            "rejection_reasons",
            "synthesis_adjustments",
            "passing_metrics",
            "reasoning_steps"
        }
        if not required.issubset(parsed.keys()):
            missing = required - set(parsed.keys())
            raise ValueError(f"Missing keys in validation output: {missing}")

        # Enforce verdict rules deterministically — do not trust Nova alone
        parsed = _enforce_verdict_rules(parsed, validation_metrics)

        return {
            "status": "success",
            "verdict": parsed["verdict"],
            "confidence": parsed["confidence"],
            "validation": parsed,
            "validation_metrics": validation_metrics,
            "raw_nova_output": raw_response,
        }

    except (json.JSONDecodeError, ValueError) as e:
        return {
            "status": "error",
            "message": str(e),
            "raw_nova_output": raw_response,
            "cleaned_text": cleaned,
        }


def _enforce_verdict_rules(parsed: Dict, metrics: Dict) -> Dict:
    """
    Enforce verdict rules deterministically after Nova responds.
    Nova's reasoning is valuable but its verdict can be wrong.
    If the metrics clearly indicate rejection, override to reject.
    If the metrics clearly indicate accept, do not let Nova over-reject.
    """
    balance = metrics.get("balance", {})
    ks = metrics.get("ks_tests", {})
    completeness = metrics.get("completeness", {})
    rows_added = metrics.get("rows_added", 0)

    # Hard rejection conditions
    hard_reject = False
    override_reasons = []

    # Balance degraded by more than 0.05
    if balance.get("available") and balance.get("delta", 0) < -0.05:
        hard_reject = True
        override_reasons.append(
            f"Balance degraded by {abs(balance['delta']):.3f} — exceeds 0.05 threshold"
        )

    # 30% or more of numeric columns failed KS test
    ks_per_col = ks.get("per_column", {})
    testable_cols = [c for c, r in ks_per_col.items() if not r.get("skipped")]
    failed_ks = [c for c in testable_cols if not ks_per_col[c].get("passed", True)]
    if testable_cols and len(failed_ks) / len(testable_cols) >= 0.30:
        hard_reject = True
        override_reasons.append(
            f"{len(failed_ks)}/{len(testable_cols)} numeric columns failed KS test: {failed_ks}"
        )

    # New missing values introduced
    if completeness.get("degraded_columns"):
        hard_reject = True
        override_reasons.append(
            f"New missing values introduced in: {completeness['degraded_columns']}"
        )

    # No rows added
    if rows_added == 0:
        hard_reject = True
        override_reasons.append("No rows were added — synthesis produced empty output")

    # Override Nova if needed
    if hard_reject and parsed["verdict"] == "accept":
        parsed["verdict"] = "reject"
        parsed["confidence"] = round(min(parsed["confidence"], 0.4), 3)
        parsed["checks_failed"] = list(
            set(parsed.get("checks_failed", []) + override_reasons)
        )
        if not parsed.get("rejection_reasons"):
            parsed["rejection_reasons"] = [
                {
                    "metric": "deterministic_override",
                    "severity": "high",
                    "explanation": reason,
                    "actionable_fix": "Review synthesis parameters and retry",
                    "before": None,
                    "after": None,
                    "threshold": None,
                }
                for reason in override_reasons
            ]

    # Hard accept — if all checks passed, do not let Nova over-reject
    if not hard_reject and parsed["verdict"] == "reject":
        if metrics.get("overall_passed"):
            parsed["verdict"] = "accept"
            parsed["confidence"] = round(max(parsed["confidence"], 0.6), 3)
            parsed["rejection_reasons"] = []
            parsed["synthesis_adjustments"] = None

    return parsed