# Validation Agent

Verifies the quality of the synthesized dataset by running deterministic statistical checks and asking Amazon Bedrock Nova Lite for a final verdict. If Nova's verdict conflicts with the hard rules, the deterministic result always wins.

## What it does

1. Runs four statistical checks in code: KS test, chi-squared test, class balance comparison, and completeness comparison.
2. Passes the check results, the original evaluation, and the synthesis report to Nova.
3. Parses Nova's verdict (`accept` / `reject`) and applies deterministic override rules.
4. Returns the verdict to the orchestrator. If the verdict is `reject`, the orchestrator re-runs Synthesis with the rejection context.

---

## Functions

### `run_validation(original_df, augmented_df, evaluation, synthesis_report, target_column, blocked_columns) → dict`

Main entry point called by the orchestrator.

1. Calls `run_validation_checks()` from `utils/validator.py` to compute all metrics.
2. Builds a user message containing the evaluation, synthesis report, and validation metrics.
3. Invokes Nova and strips markdown code fences from the response.
4. Validates required keys: `verdict`, `confidence`, `adfi_before`, `adfi_after`, `adfi_delta`, `checks_passed`, `checks_failed`, `rejection_reasons`, `synthesis_adjustments`, `passing_metrics`, `reasoning_steps`.
5. Calls `_enforce_verdict_rules()` to apply hard overrides.
6. Returns `{"status": "success", "verdict": ..., "validation": <parsed>, "validation_metrics": <metrics>}` or `{"status": "error", ...}`.

---

### `_enforce_verdict_rules(parsed, metrics) → dict`

Applies deterministic override rules after Nova responds.

**Hard reject conditions** (force verdict to `reject` regardless of Nova):
- Class balance degraded by more than 0.05 after synthesis.
- 30% or more of numeric columns failed the KS test.
- New missing values were introduced in any column.
- Zero rows were added by synthesis.

**Hard accept condition** (prevent Nova from over-rejecting):
- If none of the hard reject conditions triggered and `overall_passed` is `True`, the verdict is forced to `accept`.

When a hard reject overrides Nova's `accept`, the confidence is capped at 0.4 and the override reasons are added to `checks_failed`.

---

## Key output fields

| Field | Description |
|-------|-------------|
| `verdict` | `accept` or `reject` — deterministically enforced. |
| `confidence` | Nova's confidence in the verdict, adjusted by override rules. |
| `rejection_reasons` | Structured list of reasons with metric, severity, and actionable fix. |
| `synthesis_adjustments` | Recommended parameter changes for the next synthesis attempt. |
| `adfi_delta` | Change in AI Data Fitness Index before and after synthesis. |
