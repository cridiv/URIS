from typing import Optional
from .evaluation.agent import run_evaluation
from .planner.planner import run_planner

def run_pipeline(
    dataset_path: str,
    task_type: str,
    user_goal: str,
    target_column: Optional[str] = None,
) -> dict:
    """
    Full URIS pipeline entry point.
    Profiler → Evaluation Agent → Planner Agent
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

    # Step 2: Feed evaluation output into planner
    evaluation = evaluation_result["evaluation"]

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

    return {
        "status": "success",
        "profile": evaluation_result["profile"],
        "evaluation": evaluation,
        "plan": planner_result["plan"],
    }