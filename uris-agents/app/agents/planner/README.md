# Planner Agent

Translates the Evaluation Agent's quality assessment and the user's ML goal into a concrete, ordered task plan for the rest of the pipeline.

## What it does

1. Receives the full evaluation JSON and the user's goal string.
2. Sends both to Amazon Bedrock Nova Lite.
3. Parses the response into a structured plan with an ordered task list.
4. The orchestrator then filters out the `evaluation` task (already complete) and re-numbers priorities.

> **Scope:** The Planner only decides *data preparation* tasks. It does not recommend ML models, hyperparameters, or feature engineering.

---

## Functions

### `run_planner(dataset_summary, user_goal) → dict`

Main entry point called by the orchestrator.

1. Builds a user message from the evaluation JSON and the user goal.
2. Invokes Nova and strips markdown code fences from the response.
3. Validates required keys: `objective`, `target_column`, `constraints`, `risk_tolerance`, `ordered_tasks`, `revision_triggers`, `reasoning`, `adfi_baseline_estimate`.
4. Returns `{"status": "success", "plan": <parsed>}` or `{"status": "error", ...}`.

---

## Key output fields

| Field | Description |
|-------|-------------|
| `objective` | High-level goal statement derived from the user's input. |
| `ordered_tasks` | List of agents to run, each with a `priority`, `agent` name, and `rationale`. |
| `constraints` | Hard limits to enforce throughout the pipeline. |
| `risk_tolerance` | `low` / `medium` / `high` — affects how aggressively synthesis targets balance. |
| `revision_triggers` | Conditions that would require the plan to be reconsidered. |
| `adfi_baseline_estimate` | Expected ADFI range after all tasks complete. |