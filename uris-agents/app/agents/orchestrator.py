# agents/orchestrator.py

from typing import Optional
from .evaluation.agent import run_evaluation
from .planner.agent import run_planner
from .compliance.agent import run_compliance


def run_pipeline(
    dataset_path: str,
    task_type: str,
    user_goal: str,
    target_column: Optional[str] = None,
) -> dict:
    """
    Full URIS pipeline entry point.
    Profiler → Evaluation → Planner → Compliance
    """

    # Step 1: Run evaluation (internally calls profiler)
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
            "raw_nova_output": evaluation_result.get("raw_nova_output")
        }

    evaluation = evaluation_result["evaluation"]

    # Step 2: Feed evaluation into planner
    planner_result = run_planner(
        dataset_summary=evaluation,
        user_goal=user_goal,
    )

    if planner_result["status"] == "error":
        return {
            "status": "error",
            "stage": "planner",
            "message": planner_result["message"],
            "raw_output": planner_result.get("raw_output")
        }

    # Filter evaluation tasks from plan — evaluation already ran
    plan = planner_result["plan"]
    plan["ordered_tasks"] = [
        t for t in plan["ordered_tasks"]
        if t["agent"] != "evaluation"
    ]
    for i, task in enumerate(plan["ordered_tasks"], start=1):
        task["priority"] = i

    # Step 3: Run compliance
    compliance_result = run_compliance(
        dataset_path=dataset_path,
        evaluation=evaluation,
    )

    if compliance_result["status"] == "error":
        return {
            "status": "error",
            "stage": "compliance",
            "message": compliance_result["message"],
            "raw_nova_output": compliance_result.get("raw_nova_output")
        }

    compliance = compliance_result["compliance"]

    # Enforce blocked_columns against the plan
    # Any synthesis task touching a blocked column gets pulled out
    blocked = set(compliance["blocked_columns"])

    if blocked:
        plan["ordered_tasks"] = [
            t for t in plan["ordered_tasks"]
            if not (
                t["agent"] == "synthesis" and
                any(col.lower() in t["task"].lower() for col in blocked)
            )
        ]
        # Re-number after filtering
        for i, task in enumerate(plan["ordered_tasks"], start=1):
            task["priority"] = i

    return {
        "status": "success",
        "profile": evaluation_result["profile"],
        "evaluation": evaluation,
        "plan": plan,
        "compliance": compliance,
        "structure_hints": compliance_result["structure_hints"],
        "blocked_columns": list(blocked),
    }