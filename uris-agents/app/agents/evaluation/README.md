# Evaluation Agent

The first agent in the pipeline. Profiles the dataset deterministically and uses Amazon Bedrock Nova Lite to produce a structured quality assessment that all other agents treat as ground truth.

## What it does

1. Calls `profile_dataset()` to compute column statistics, null rates, distributions, and PII hints directly from the file — no LLM involved.
2. Sends the profile to Nova with the task type and target column.
3. Parses Nova's JSON response and **overrides the ADFI score** with a deterministic weighted formula — Nova's ADFI value is discarded.
4. Returns the evaluation result for use by the Planner, Compliance, and Synthesis agents.

---

## Functions

### `run_evaluation(dataset_path, task_type, target_column) → dict`

Main entry point called by the orchestrator.

1. Runs `profile_dataset(dataset_path)` to generate column-level statistics.
2. Builds a user message containing the profile, task type, and target column.
3. Invokes Nova and strips markdown code fences from the raw response.
4. Validates required keys: `schema_summary`, `quality_scores`, `critical_gaps`, `confidence`, `reasoning_steps`, `adfi`, `recommended_focus`.
5. Recomputes `adfi` deterministically:

$$
\text{ADFI} = 0.30 \times \text{completeness} + 0.25 \times \text{balance} + 0.20 \times \text{distribution\_quality} + 0.15 \times \text{consistency} + 0.10 \times \text{uniqueness}
$$

   where `completeness = max(0, 1 − avg\_null\_rate × 2)`.

6. Returns `{"status": "success", "evaluation": <parsed>, "profile": <profile>}` or `{"status": "error", ...}`.

---

## Key output fields

| Field | Description |
|-------|-------------|
| `schema_summary` | Column names, types, null rates, and PII flags. |
| `quality_scores` | Completeness, balance, distribution quality, consistency, uniqueness. |
| `adfi` | AI Data Fitness Index — deterministic weighted score in `[0, 1]`. |
| `critical_gaps` | List of issues that must be addressed before training. |
| `recommended_focus` | What the pipeline should prioritise (e.g. balance, imputation). |