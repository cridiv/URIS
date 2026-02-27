# Agents — Orchestrator

The `orchestrator.py` module is the single entry point for the full URIS pipeline. It calls each agent in order, passes results between them, and handles all failure branches.

## Pipeline Order

```
Evaluation → Planner → Compliance → Synthesis → Validation
```

If Validation rejects the synthesized dataset, the orchestrator re-runs Synthesis once with the rejection context, then re-validates the new output.

---

## `run_pipeline(dataset_path, task_type, user_goal, target_column)`

**Main entry point.** Runs the entire pipeline end-to-end.

| Step | What it does |
|------|-------------|
| **1. Evaluation** | Profiles the dataset and assesses ML readiness. Stops early if this fails. |
| **2. Planner** | Receives the evaluation and the user goal, returns an ordered task list. The evaluation task is filtered out since it already ran. |
| **3. Compliance** | Identifies PII columns and blocked columns. Stops early if this fails. |
| **Synthesis skip check** | If the planner's task list contains no synthesis task, returns immediately with `status: success_no_synthesis`. |
| **4. Synthesis** | Runs the Synthesis Agent with up to 3 retries. If all retries are exhausted (`status: fallback`), returns early with `status: synthesis_failed`. |
| **5. Validation** | Runs statistical checks (KS, chi-squared, balance, completeness) and asks Nova for a verdict. |
| **6. Closed-loop retry** | If Validation rejects, the orchestrator re-runs Synthesis with the rejection context, then re-validates. |
| **7. Save** | Saves the augmented dataset to `tmp_uploads/augmented_<uuid>.csv` and returns the full result. |

### Return statuses

| Status | Meaning |
|--------|---------|
| `success` | Validation accepted the augmented dataset. |
| `success_with_warnings` | Pipeline completed but validation did not accept. |
| `success_no_synthesis` | Planner determined synthesis was not needed. |
| `synthesis_failed` | All synthesis retries were exhausted. |
| `error` | An unexpected exception occurred at any stage. |
