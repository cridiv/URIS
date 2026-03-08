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
    event_emitter: Optional[Any] = None,
    enable_validation: bool = False,
) -> Dict[str, Any]:
    """
    Full URIS pipeline:
    Evaluation -> Planner -> Compliance -> Synthesis -> Validation
    If validation rejects, retry synthesis+validation up to 2 additional times.
    
    event_emitter: Optional AgentEventEmitter instance for real-time streaming
    """

    trace = []

    try:
        # ── 1. Evaluation ─────────────────────────────────────────
        trace.append("Starting Evaluation...")
        if event_emitter:
            event_emitter.emit_start("evaluation")
        
        evaluation_result = run_evaluation(
            dataset_path=dataset_path,
            task_type=task_type,
            target_column=target_column,
        )

        if evaluation_result["status"] == "error":
            if event_emitter:
                event_emitter.emit_complete("evaluation", {"status": "error", "message": evaluation_result["message"]})
            return {
                "status": "error",
                "stage": "evaluation",
                "message": evaluation_result["message"],
                "trace": trace
            }

        evaluation = evaluation_result["evaluation"]
        trace.append("Evaluation complete")
        
        # Emit reasoning steps if available
        if event_emitter and isinstance(evaluation, dict) and "reasoning_steps" in evaluation:
            for step in evaluation.get("reasoning_steps", []):
                event_emitter.emit_data("evaluation", message=step)
        
        if event_emitter:
            event_emitter.emit_complete("evaluation", evaluation)

        # ── 2. Planner ────────────────────────────────────────────
        trace.append("Running Planner...")
        if event_emitter:
            event_emitter.emit_start("planner")
            event_emitter.emit_data("planner", phase="planning", message="Analyzing evaluation output and forming task queue...")
        
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

        # Emit reasoning steps if available
        if event_emitter and isinstance(plan, dict) and "reasoning" in plan:
            for step in plan.get("reasoning", []):
                event_emitter.emit_data("planner", message=step)

        if event_emitter:
            event_emitter.emit_complete("planner", plan)

        # ── 3. Compliance (conditionally run based on plan) ──────
        should_run_compliance = any(
            t["agent"] == "compliance" and not t.get("skip", False)
            for t in plan["ordered_tasks"]
        )
        
        if should_run_compliance:
            trace.append("Running Compliance...")
            if event_emitter:
                event_emitter.emit_start("compliance")
                event_emitter.emit_data("compliance", phase="scanning", message="Scanning all columns for PII patterns...")
            
            compliance_result = run_compliance(
                dataset_path=dataset_path,
                evaluation=evaluation,
            )

            if compliance_result["status"] == "error":
                if event_emitter:
                    event_emitter.emit_complete("compliance", {"status": "error", "message": compliance_result["message"]})
                return {
                    "status": "error",
                    "stage": "compliance",
                    "message": compliance_result["message"],
                    "trace": trace
                }

            compliance = compliance_result["compliance"]
            blocked_columns = compliance["blocked_columns"]
            trace.append("Compliance complete")
            
            # Emit reasoning steps if available
            if event_emitter and isinstance(compliance, dict) and "reasoning_steps" in compliance:
                for step in compliance.get("reasoning_steps", []):
                    event_emitter.emit_data("compliance", message=step)
            
            if event_emitter:
                event_emitter.emit_complete("compliance", compliance)
        else:
            trace.append("Compliance skipped — no PII risk detected by planner")
            compliance = {
                "status": "skipped",
                "blocked_columns": [],
                "pii_detected": False,
                "reason": "Planner determined no compliance check needed"
            }
            blocked_columns = []
            if event_emitter:
                event_emitter.emit_start("compliance")
                event_emitter.emit_data("compliance", message="No PII risk detected — skipping compliance check")
                event_emitter.emit_complete("compliance", compliance)

        # Skip synthesis if not needed
        needs_synthesis = any(
            t["agent"] == "synthesis" and not t.get("skip", False)
            for t in plan["ordered_tasks"]
        )
        if not needs_synthesis:
            trace.append("Synthesis skipped — dataset already meets quality requirements")
            if event_emitter:
                event_emitter.emit_start("synthesis")
                event_emitter.emit_data("synthesis", message="Dataset is balanced and complete — no synthesis needed")
                event_emitter.emit_complete("synthesis", {"status": "skipped", "reason": "No synthesis needed based on evaluation"})
            return {
                "status": "success_no_synthesis",
                "trace": trace,
                "evaluation": evaluation,
                "plan": plan,
                "compliance": compliance,
                "blocked_columns": blocked_columns,
                "original_dataset_path": dataset_path,
            }

        # Read CSV with explicit comma delimiter (most common for URIS datasets)
        try:
            original_df = pd.read_csv(dataset_path, sep=",")
        except Exception:
            # Fallback to auto-detection if comma fails
            original_df = pd.read_csv(dataset_path)

        synthesis_result = None
        validation_result = None
        augmented_df = original_df
        synthesis_failed = False

        if not enable_validation:
            trace.append("Starting Synthesis Agent...")
            if event_emitter:
                event_emitter.emit_start("synthesis")
                event_emitter.emit_data(
                    "synthesis",
                    phase="strategy",
                    message="Selecting synthesis strategy...",
                )

            synthesis_result = run_synthesis_agent(
                dataset_path=dataset_path,
                evaluation=evaluation,
                compliance=compliance,
                task_type=task_type,
                target_column=target_column,
                max_retries=3,
                event_emitter=event_emitter,
            )
            trace.append(f"Synthesis Agent finished: {synthesis_result['status']}")

            if event_emitter:
                synthesis_clean_for_event = {
                    k: v for k, v in synthesis_result.items() if k != "final_dataframe"
                }
                event_emitter.emit_complete("synthesis", synthesis_clean_for_event)

            synthesis_failed = synthesis_result.get("status") == "fallback"
            augmented_df = original_df if synthesis_failed else synthesis_result["final_dataframe"]
        else:
            # ── 4/5. Synthesis + Validation loop ──────────────────────
            max_validation_retries = 2
            max_validation_attempts = 1 + max_validation_retries
            validation_attempt = 0
            rejection_context = None

            while validation_attempt < max_validation_attempts:
                validation_attempt += 1
                trace.append(f"Starting Synthesis Agent (validation attempt {validation_attempt}/{max_validation_attempts})...")

                if event_emitter:
                    event_emitter.emit_start("synthesis")
                    event_emitter.emit_data(
                        "synthesis",
                        phase="strategy",
                        message=(
                            f"Selecting synthesis strategy (validation attempt {validation_attempt}/{max_validation_attempts})..."
                        ),
                        payload={
                            "validation_attempt": validation_attempt,
                            "max_validation_attempts": max_validation_attempts,
                        },
                    )

                synthesis_result = run_synthesis_agent(
                    dataset_path=dataset_path,
                    evaluation=evaluation,
                    compliance=compliance,
                    task_type=task_type,
                    target_column=target_column,
                    max_retries=3,
                    rejection_context=rejection_context,
                    event_emitter=event_emitter,
                )
                trace.append(f"Synthesis Agent finished: {synthesis_result['status']}")

                if event_emitter:
                    synthesis_clean_for_event = {
                        k: v for k, v in synthesis_result.items() if k != "final_dataframe"
                    }
                    synthesis_clean_for_event["validation_attempt"] = validation_attempt
                    synthesis_clean_for_event["max_validation_attempts"] = max_validation_attempts
                    event_emitter.emit_complete("synthesis", synthesis_clean_for_event)

                synthesis_failed = synthesis_result.get("status") == "fallback"
                if synthesis_failed:
                    trace.append("Synthesis failed — using original dataset, pipeline failed")
                    augmented_df = original_df
                    break

                augmented_df = synthesis_result["final_dataframe"]

                trace.append(f"Starting Validation Agent (attempt {validation_attempt}/{max_validation_attempts})...")
                if event_emitter:
                    event_emitter.emit_start("validation")

                validation_result = run_validation(
                    original_df=original_df,
                    augmented_df=augmented_df,
                    evaluation=evaluation,
                    synthesis_report=synthesis_result.get("synthesis_report", {}),
                    target_column=target_column,
                    blocked_columns=blocked_columns,
                )

                if event_emitter and validation_result:
                    validation_payload = {
                        k: v for k, v in validation_result.items() if k != "raw_nova_output"
                    }
                    validation_payload["attempt"] = validation_attempt
                    validation_payload["max_attempts"] = max_validation_attempts
                    event_emitter.emit_complete("validation", validation_payload)

                trace.append(f"Validation verdict: {validation_result.get('verdict', 'error')}")

                if validation_result.get("status") != "success":
                    trace.append(f"Validation agent error: {validation_result.get('message', 'unknown error')}")
                    break

                verdict = validation_result.get("verdict")
                if verdict == "accept":
                    trace.append("Validation accepted synthesis — pipeline complete")
                    break

                if validation_attempt >= max_validation_attempts:
                    trace.append("Validation rejected synthesis on final allowed attempt")
                    break

                trace.append("Validation rejected synthesis — retrying with rejection context")
                if event_emitter:
                    event_emitter.emit_data(
                        "validation",
                        phase="retry",
                        message="Validation rejected synthesis; preparing next synthesis attempt",
                        payload={
                            "attempt": validation_attempt,
                            "max_attempts": max_validation_attempts,
                            "verdict": verdict,
                            "rejection_reasons": (
                                (validation_result.get("validation") or {}).get("rejection_reasons", [])
                                if isinstance(validation_result.get("validation"), dict)
                                else []
                            ),
                        },
                    )

                rejection_context = {
                    "previous_attempt_failed": True,
                    "rejection_reasons": (
                        (validation_result.get("validation") or {}).get("rejection_reasons", [])
                        if isinstance(validation_result.get("validation"), dict)
                        else []
                    ),
                    "synthesis_adjustments": (
                        (validation_result.get("validation") or {}).get("synthesis_adjustments", {})
                        if isinstance(validation_result.get("validation"), dict)
                        else {}
                    ),
                    "previous_budget": synthesis_result.get("augmented_rows", 0),
                    "previous_verdict_confidence": validation_result.get("confidence", 0.0),
                }

        # ── 6. Save augmented dataset ─────────────────────────────
        augmented_id = uuid.uuid4().hex
        augmented_path = f"tmp_uploads/augmented_{augmented_id}.csv"
        augmented_df.to_csv(augmented_path, index=False)

        # Clean non-serializable fields
        synthesis_clean = {
            k: v for k, v in synthesis_result.items()
            if k != "final_dataframe"
        }

        # Handle response based on whether synthesis succeeded
        if synthesis_failed:
            # Synthesis failed - return early with fallback status
            return {
                "status": "synthesis_failed",
                "trace": trace,
                "evaluation": evaluation,
                "plan": plan,
                "compliance": compliance,
                "synthesis": {
                    "result": synthesis_clean,
                    "augmented_rows": 0,
                    "augmented_dataset_path": augmented_path,
                },
                "blocked_columns": blocked_columns,
                "warning": "Synthesis exhausted all retries — original dataset unchanged"
            }

        # Synthesis succeeded - include validation results only when requested
        if not enable_validation:
            return {
                "status": "success",
                "trace": trace,
                "evaluation": evaluation,
                "plan": plan,
                "compliance": compliance,
                "synthesis": {
                    "result": synthesis_clean,
                    "augmented_rows": synthesis_result.get("augmented_rows", 0),
                    "augmented_dataset_path": augmented_path,
                },
                "blocked_columns": blocked_columns,
            }

        # Synthesis succeeded - include validation results
        final_verdict = validation_result.get("verdict") if isinstance(validation_result, dict) else None
        if final_verdict != "accept":
            return {
                "status": "failed_validation",
                "trace": trace,
                "evaluation": evaluation,
                "plan": plan,
                "compliance": compliance,
                "synthesis": {
                    "result": synthesis_clean,
                    "augmented_rows": synthesis_result.get("augmented_rows", 0),
                    "augmented_dataset_path": augmented_path,
                },
                "validation": {
                    k: v for k, v in (validation_result or {}).items()
                    if k != "raw_nova_output"
                },
                "blocked_columns": blocked_columns,
                "message": "Validation rejected synthesis after 3 attempts",
            }

        validation_clean = {
            k: v for k, v in validation_result.items()
            if k != "raw_nova_output"
        }

        final_status = "success"

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
        import traceback
        return {
            "status": "error",
            "stage": "unexpected",
            "message": str(e),
            "trace": trace,
            "traceback": traceback.format_exc()
        }