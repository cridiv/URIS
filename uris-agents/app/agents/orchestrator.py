import uuid
from typing import Optional, Dict, Any
import pandas as pd
from .evaluation.agent import run_evaluation
from .planner.agent import run_planner
from .compliance.agent import run_compliance
from .synthesis.agent import run_synthesis_agent
from .validation.agent import run_validation


def run_pipeline(
    dataset_path: str,
    task_type: str,
    user_goal: str,
    target_column: Optional[str] = None,
) -> Dict[str, Any]:
    """
    Full URIS pipeline:
    Evaluation → Planner → Compliance → Synthesis → Validation
    If validation rejects, synthesis retries once with rejection context.
    """

    trace = []

    try:
        # ── 1. Evaluation ─────────────────────────────────────────
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

        # ── 2. Planner ────────────────────────────────────────────
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

        # Filter evaluation tasks — already ran
        plan["ordered_tasks"] = [
            t for t in plan["ordered_tasks"]
            if t["agent"] != "evaluation"
        ]
        for i, task in enumerate(plan["ordered_tasks"], start=1):
            task["priority"] = i

        # ── 3. Compliance ─────────────────────────────────────────
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
        blocked_columns = compliance["blocked_columns"]
        trace.append("Compliance complete")

        # Skip synthesis if not needed
        needs_synthesis = any(
            t["agent"] == "synthesis" for t in plan["ordered_tasks"]
        )
        if not needs_synthesis:
            trace.append("No synthesis tasks in plan — skipping synthesis")
            return {
                "status": "success_no_synthesis",
                "trace": trace,
                "evaluation": evaluation,
                "plan": plan,
                "compliance": compliance,
                "blocked_columns": blocked_columns,
                "original_dataset_path": dataset_path,
            }

        # ── 4. Synthesis ──────────────────────────────────────────
        trace.append("Starting Synthesis Agent...")
        synthesis_result = run_synthesis_agent(
            dataset_path=dataset_path,
            evaluation=evaluation,
            compliance=compliance,
            task_type=task_type,
            target_column=target_column,
            max_retries=3,
        )
        trace.append(f"Synthesis Agent finished: {synthesis_result['status']}")

        # If synthesis completely failed — return early
        if synthesis_result["status"] == "fallback":
            synthesis_clean = {
                k: v for k, v in synthesis_result.items()
                if k != "final_dataframe"
            }
            return {
                "status": "synthesis_failed",
                "trace": trace,
                "evaluation": evaluation,
                "plan": plan,
                "compliance": compliance,
                "synthesis": synthesis_clean,
                "blocked_columns": blocked_columns,
                "warning": "Synthesis exhausted all retries — original dataset unchanged"
            }

        augmented_df = synthesis_result["final_dataframe"]
        original_df = pd.read_csv(dataset_path)

        # ── 5. Validation ─────────────────────────────────────────
        trace.append("Starting Validation Agent...")
        validation_result = run_validation(
            original_df=original_df,
            augmented_df=augmented_df,
            evaluation=evaluation,
            synthesis_report=synthesis_result.get("synthesis_report", {}),
            target_column=target_column,
            blocked_columns=blocked_columns,
        )
        trace.append(f"Validation verdict: {validation_result.get('verdict', 'error')}")

        if validation_result["status"] == "error":
            trace.append(f"Validation agent error: {validation_result['message']}")

        # ── 6. Closed-loop retry if validation rejects ────────────
        if (
            validation_result.get("status") == "success" and
            validation_result.get("verdict") == "reject"
        ):
            trace.append("Validation rejected synthesis — retrying with rejection context")

            rejection_context = {
                "previous_attempt_failed": True,
                "rejection_reasons": validation_result["validation"].get("rejection_reasons", []),
                "synthesis_adjustments": validation_result["validation"].get("synthesis_adjustments", {}),
                "previous_budget": synthesis_result.get("augmented_rows", 0),
                "previous_verdict_confidence": validation_result.get("confidence", 0.0),
            }

            trace.append("Re-running Synthesis Agent with rejection context...")
            synthesis_result = run_synthesis_agent(
                dataset_path=dataset_path,
                evaluation=evaluation,
                compliance=compliance,
                task_type=task_type,
                target_column=target_column,
                max_retries=3,
                rejection_context=rejection_context,
            )
            trace.append(f"Synthesis retry finished: {synthesis_result['status']}")

            if synthesis_result["status"] != "fallback":
                augmented_df = synthesis_result["final_dataframe"]

                # Re-run validation on the new augmented dataset
                trace.append("Re-running Validation Agent...")
                validation_result = run_validation(
                    original_df=original_df,
                    augmented_df=augmented_df,
                    evaluation=evaluation,
                    synthesis_report=synthesis_result.get("synthesis_report", {}),
                    target_column=target_column,
                    blocked_columns=blocked_columns,
                )
                trace.append(f"Final validation verdict: {validation_result.get('verdict', 'error')}")
            else:
                trace.append("Synthesis retry also failed — using original dataset")
                augmented_df = original_df

        # ── 7. Save augmented dataset ─────────────────────────────
        augmented_id = uuid.uuid4().hex
        augmented_path = f"tmp_uploads/augmented_{augmented_id}.csv"
        augmented_df.to_csv(augmented_path, index=False)

        # Clean non-serializable fields
        synthesis_clean = {
            k: v for k, v in synthesis_result.items()
            if k != "final_dataframe"
        }
        validation_clean = {
            k: v for k, v in validation_result.items()
            if k != "raw_nova_output"
        }

        final_status = (
            "success"
            if validation_result.get("verdict") == "accept"
            else "success_with_warnings"
        )

        return {
            "status": final_status,
            "trace": trace,
            "evaluation": evaluation,
            "plan": plan,
            "compliance": compliance,
            "synthesis": {
                "result": synthesis_clean,
                "augmented_rows": synthesis_result.get("augmented_rows", 0),
                "augmented_dataset_path": augmented_path,
            },
            "validation": validation_clean,
            "blocked_columns": blocked_columns,
        }

    except Exception as e:
        return {
            "status": "error",
            "stage": "unexpected",
            "message": str(e),
            "trace": trace
        }