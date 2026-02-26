import os
import shutil
import uuid
from typing import Optional, Dict, Any
from .evaluation.agent import run_evaluation
from .planner.agent import run_planner
from .compliance.agent import run_compliance
from .synthesis.agent import run_synthesis_agent


def run_pipeline(
    dataset_path: str,
    task_type: str,
    user_goal: str,
    target_column: Optional[str] = None,
) -> Dict[str, Any]:
    """
    Full URIS pipeline: Evaluation → Planner → Compliance → Synthesis (if needed)
    Returns augmented dataset path (if synthesis ran) + all intermediate results
    """

    trace = []
    temp_files_to_clean = []

    try:
        # ── 1. Evaluation ────────────────────────────────────────
        trace.append("Starting Evaluation...")
        evaluation_result = run_evaluation(
            dataset_path=dataset_path,
            task_type=task_type,
            target_column=target_column,
        )

        if evaluation_result["status"] == "error":
            return {
                "status": "error",
                "stage": "evaluation",
                "message": evaluation_result["message"],
                "trace": trace
            }

        evaluation = evaluation_result["evaluation"]
        trace.append("Evaluation complete")

        # ── 2. Planner ───────────────────────────────────────────
        trace.append("Running Planner...")
        planner_result = run_planner(
            dataset_summary=evaluation,
            user_goal=user_goal,
        )

        if planner_result["status"] == "error":
            return {
                "status": "error",
                "stage": "planner",
                "message": planner_result["message"],
                "trace": trace
            }

        plan = planner_result["plan"]
        trace.append("Planner complete")

        # Filter out evaluation (already done) and re-prioritize
        plan["ordered_tasks"] = [
            t for t in plan["ordered_tasks"]
            if t["agent"] != "evaluation"
        ]
        for i, task in enumerate(plan["ordered_tasks"], start=1):
            task["priority"] = i

        # ── 3. Compliance ────────────────────────────────────────
        trace.append("Running Compliance...")
        compliance_result = run_compliance(
            dataset_path=dataset_path,
            evaluation=evaluation,
        )

        if compliance_result["status"] == "error":
            return {
                "status": "error",
                "stage": "compliance",
                "message": compliance_result["message"],
                "trace": trace
            }

        compliance = compliance_result["compliance"]
        trace.append("Compliance complete")

        # Block synthesis if high privacy risk or no synthesis in plan
        needs_synthesis = any(t["agent"] == "synthesis" for t in plan["ordered_tasks"])

        if not needs_synthesis:
            trace.append("No synthesis tasks in plan → skipping synthesis")
            return {
                "status": "success_no_synthesis",
                "trace": trace,
                "evaluation": evaluation,
                "plan": plan,
                "compliance": compliance,
                "blocked_columns": compliance["blocked_columns"],
                "original_dataset_path": dataset_path,
            }

        # ── 4. Synthesis ─────────────────────────────────────────
        trace.append("Starting Synthesis Agent...")
        synthesis_result = run_synthesis_agent(
            dataset_path=dataset_path,
            evaluation=evaluation,
            compliance=compliance,
            task_type=task_type,
            target_column=target_column,
            max_retries=3
        )

        trace.append(f"Synthesis Agent finished: {synthesis_result['status']}")

        if synthesis_result["status"] == "success":
            # Save augmented dataset to a temp file for download / further use
            augmented_id = uuid.uuid4().hex
            augmented_path = f"tmp_uploads/augmented_{augmented_id}.csv"
            synthesis_result["final_dataframe"].to_csv(augmented_path, index=False)
            temp_files_to_clean.append(augmented_path)  # optional cleanup later

            # Remove DataFrame from result before JSON serialization
            synthesis_result_clean = {k: v for k, v in synthesis_result.items() if k != "final_dataframe"}

            return {
                "status": "success",
                "trace": trace,
                "evaluation": evaluation,
                "plan": plan,
                "compliance": compliance,
                "synthesis": {
                    "result": synthesis_result_clean,
                    "augmented_rows": synthesis_result["augmented_rows"],
                    "augmented_dataset_path": augmented_path,
                },
                "blocked_columns": compliance["blocked_columns"],
            }

        else:
            # Partial or failed synthesis → return what we have + warning
            # Remove non-serializable DataFrame if present
            synthesis_result_clean = {k: v for k, v in synthesis_result.items() if k != "final_dataframe"}
            
            return {
                "status": "partial_synthesis",
                "trace": trace,
                "evaluation": evaluation,
                "plan": plan,
                "compliance": compliance,
                "synthesis": synthesis_result_clean,
                "warning": "Synthesis ran but some checks failed",
            }

    except Exception as e:
        return {
            "status": "error",
            "stage": "unexpected",
            "message": str(e),
            "trace": trace
        }