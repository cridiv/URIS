import json
import re
import pandas as pd
from typing import Dict, Any, Optional
from ...utils.bedrock import invoke_nova
from .prompt import SYNTHESIS_SYSTEM_PROMPT
from ...utils.synthesizer import run_synthesis
from ...utils.privacy_checker import run_privacy_check
from ...utils.correlation_checker import run_correlation_check


def prepare_synthesis_input(
    evaluation: Dict,
    compliance: Dict,
    task_type: str,
    target_column: Optional[str] = None,
) -> Dict:
    """
    Build clean payload for Nova from already-unwrapped evaluation
    and compliance dicts. Both should be the inner result dicts,
    not the full agent response wrappers.
    """
    quality_scores = evaluation.get("quality_scores", {})
    balance = quality_scores.get("balance", 1.0)

    return {
        "task_type": task_type,
        "target_column": target_column,
        "evaluation_summary": {
            "adfi": evaluation.get("adfi"),
            "balance": balance,
            "imbalance_severity": (
                "high" if balance < 0.4 else
                "medium" if balance < 0.7 else
                "low"
            ),
            "critical_gaps": evaluation.get("critical_gaps", []),
            "recommended_focus": evaluation.get("recommended_focus"),
        },
        "compliance_summary": {
            "blocked_columns": compliance.get("blocked_columns", []),
            "recommended_actions": compliance.get("recommended_actions", []),
            "privacy_risk_score": compliance.get("privacy_risk_score", 0.0),
        }
    }


def _enforce_compliance(strategy_decision: Dict, compliance: Dict) -> Dict:
    """
    Regardless of what Nova returned, always enforce compliance output.
    Nova is advisory — compliance is mandatory.
    """
    blocked = compliance.get("blocked_columns", [])
    recommended_actions = compliance.get("recommended_actions", [])

    # Extract-then-drop actions from compliance
    extractions = [
        a for a in recommended_actions
        if a.get("action") == "extract_then_drop"
    ]

    # Always override with compliance values — never trust Nova alone
    strategy_decision["columns_to_exclude"] = blocked
    strategy_decision["columns_to_extract_first"] = extractions

    return strategy_decision


def run_synthesis_agent(
    dataset_path: str,
    evaluation: Dict,
    compliance: Dict,
    task_type: str,
    target_column: Optional[str] = None,
    max_retries: int = 3,
) -> Dict[str, Any]:
    trace = []
    starting_budget = 600
    current_budget = starting_budget
    raw_df = pd.read_csv(dataset_path)

    # Pre-compute what synthesizer will drop so checkers use matching columns
    from ...utils.synthesizer import get_identifier_columns
    blocked_columns = compliance.get("blocked_columns", [])
    identifier_cols = get_identifier_columns(raw_df)
    cols_to_remove = list(set(identifier_cols + blocked_columns))

    # This is what the checkers should compare against — not the raw CSV
    original_df = raw_df.drop(
        columns=[c for c in cols_to_remove if c in raw_df.columns]
    )

    trace.append(f"Identifier columns removed from reference: {identifier_cols}")
    trace.append(f"Blocked columns removed from reference: {blocked_columns}")

    # Build Nova input once — same for all attempts
    input_payload = prepare_synthesis_input(
        evaluation=evaluation,
        compliance=compliance,
        task_type=task_type,
        target_column=target_column,
    )

    strategy_decision = None
    synth_output = None
    privacy_result = None
    correlation_result = None

    for attempt in range(1, max_retries + 1):
        trace.append(f"Attempt {attempt}/{max_retries} — budget={current_budget}")

        # ── 1. Get strategy from Nova ─────────────────────────────
        user_message = f"""\
Attempt: {attempt}/{max_retries}
Suggested augmentation budget: {current_budget}

Evaluation + Compliance:
{json.dumps(input_payload, indent=2)}

Decide synthesis parameters now.
"""
        raw_output = invoke_nova(SYNTHESIS_SYSTEM_PROMPT, user_message)
        cleaned = re.sub(r'^```(?:json)?\s*|\s*```$', '', raw_output, flags=re.MULTILINE).strip()

        try:
            strategy_decision = json.loads(cleaned)
            trace.append("Nova strategy decision parsed successfully")
        except Exception as e:
            trace.append(f"Nova JSON parse failed: {str(e)} — using compliance defaults")
            strategy_decision = {
                "augmentation_budget": current_budget,
                "priority_preserve_columns": [],
                "reasoning": ["Fallback due to Nova parse error"],
                "confidence": 0.0
            }

        # ── 2. Enforce compliance — always override Nova ──────────
        strategy_decision = _enforce_compliance(strategy_decision, compliance)
        strategy_decision["augmentation_budget"] = current_budget
        trace.append(f"Compliance enforced — blocked: {strategy_decision['columns_to_exclude']}, extractions: {len(strategy_decision['columns_to_extract_first'])}")

        # ── 3. Run synthesis ──────────────────────────────────────
        synth_output = run_synthesis(dataset_path, strategy_decision)

        if synth_output["status"] == "error":
            trace.append(f"Synthesis error: {synth_output.get('error')}")
            current_budget = max(200, int(current_budget * 0.7))
            continue

        augmented_df = synth_output["dataframe"]
        rows_generated = synth_output["synthesis_report"].get("rows_generated", 0)
        trace.append(f"Synthesis complete — {rows_generated} rows generated")

        # ── 4. Privacy check ──────────────────────────────────────
        # Use original_df with matching columns — not raw_df
        privacy_result = run_privacy_check(
            real_df=original_df,
            synth_df=augmented_df,
            blocked_columns=[],  # already removed from both dfs
            small_dataset=len(original_df) < 5000,
        )
        trace.append(f"Privacy check: {privacy_result['status']}")

        # ── 5. Correlation check ──────────────────────────────────
        correlation_result = run_correlation_check(
            real_df=original_df,
            synth_df=augmented_df,
            blocked_columns=[],  # already removed from both dfs
        )
        trace.append(f"Correlation check: {correlation_result['status']}")

        # ── 6. Accept or retry ────────────────────────────────────
        if (privacy_result["overall_pass"] and
                correlation_result["status"] in ["pass", "skip"]):
            trace.append("All checks passed — synthesis complete")
            return {
                "status": "success",
                "attempt": attempt,
                "strategy_used": strategy_decision,
                "synthesis_report": synth_output["synthesis_report"],
                "imputation_report": synth_output.get("imputation_report", {}),
                "extractions_applied": synth_output.get("extractions_applied", []),
                "privacy_report": privacy_result,
                "correlation_report": correlation_result,
                "final_dataframe": augmented_df,
                "augmented_rows": rows_generated,
                "trace": trace,
            }

        trace.append("Checks failed — reducing budget and retrying")
        current_budget = max(200, int(current_budget * 0.7))

    # ── 7. All retries exhausted — return original unchanged ──────
    trace.append("All retries exhausted — returning original dataset unchanged")
    return {
        "status": "fallback",
        "attempt": max_retries,
        "strategy_used": strategy_decision,
        "synthesis_report": synth_output.get("synthesis_report", {}) if synth_output else {},
        "imputation_report": synth_output.get("imputation_report", {}) if synth_output else {},
        "privacy_report": privacy_result,
        "correlation_report": correlation_result,
        "final_dataframe": original_df,
        "augmented_rows": 0,
        "trace": trace,
        "warning": "All synthesis attempts failed checks — original dataset returned unchanged"
    }