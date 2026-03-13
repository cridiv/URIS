# Synthesis Agent

Orchestrates synthetic data generation using SDV GaussianCopula. Enforces compliance constraints, validates privacy and correlation on every attempt, and retries with a reduced budget if checks fail.

## What it does

1. Asks Nova for a synthesis strategy (augmentation budget, columns to preserve, reasoning).
2. **Overrides** Nova's output with mandatory compliance rules — blocked columns are always excluded.
3. If this is a retry triggered by the Validation Agent, applies the rejection adjustments before running.
4. Runs `run_synthesis()` from `utils/synthesizer.py`.
5. Runs privacy and correlation checks on the result.
6. If both checks pass, returns the augmented dataset.
7. If either check fails, reduces the budget by 30% and retries (up to `max_retries`).
8. If all retries are exhausted, returns the original dataset unchanged with `status: fallback`.

---

## Functions

### `prepare_synthesis_input(evaluation, compliance, plan, task_type, target_column, rejection_context) → dict`

Builds the JSON payload sent to Nova before each attempt.

- Includes planner objective, constraints, risk tolerance, and synthesis task context.
- Extracts ADFI, balance, imbalance severity, critical gaps, and recommended focus from the evaluation.
- Extracts blocked columns, recommended actions, and privacy risk score from the compliance report.
- If `rejection_context` is provided (validation retry), injects a `previous_attempt` block so Nova knows what failed and what to change.

---

### `_enforce_compliance(strategy_decision, compliance) → dict`

Applies mandatory compliance rules on top of Nova's strategy decision.

- Sets `columns_to_exclude` to the blocked columns list regardless of what Nova suggested.
- Sets `columns_to_extract_first` to the compliance-recommended `extract_then_drop` actions.
- Nova's suggestions are advisory; compliance is non-negotiable.

---

### `_apply_rejection_adjustments(strategy_decision, rejection_context, current_budget) → dict`

Applied only when this is a retry after a Validation rejection.

- Overrides `augmentation_budget` with the Validation Agent's recommended budget, if provided.
- Overrides `priority_preserve_columns` with the Validation Agent's recommended columns, if provided.

---

### `run_synthesis_agent(dataset_path, evaluation, compliance, plan, task_type, target_column, max_retries, rejection_context) → dict`

Main entry point called by the orchestrator.

1. Auto-detects identifier columns (e.g. `PassengerId`) and removes them from the reference DataFrame used for privacy checks — they are never synthesized.
2. Runs up to `max_retries` attempts, each time:
   - Asking Nova for a strategy decision.
   - Enforcing planner context, compliance, and rejection adjustments.
   - Running synthesis via `run_synthesis()`.
   - Running `run_privacy_check()` with `small_dataset=True` if the dataset has fewer than 5 000 rows.
   - Running `run_correlation_check()`.
3. Returns `status: success` on the first attempt where both checks pass.
4. Returns `status: fallback` after all retries, with the original dataset and a warning.

#### Return statuses

| Status | Meaning |
|--------|---------|
| `success` | Both privacy and correlation checks passed. |
| `fallback` | All retries exhausted — original dataset returned unchanged. |

---

## Privacy check behaviour

The agent passes `small_dataset=True` when the dataset has fewer than 5 000 rows. In small dataset mode:
- The exact match check is skipped entirely (too few features for a meaningful comparison).
- Distance thresholds (DCR / NNDR) are set to 0, so the nearest-neighbour check always passes.
