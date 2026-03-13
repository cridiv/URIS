import os
import uuid
import shutil
import json
import numpy as np
from fastapi import APIRouter, UploadFile, File, Form, HTTPException, BackgroundTasks, Header
from fastapi.responses import JSONResponse, FileResponse
from pydantic import BaseModel
from typing import Optional
from ..agents.orchestrator import run_pipeline
from ..utils.event_emitter import AgentEventEmitter

router = APIRouter(prefix="/pipeline", tags=["pipeline"])

UPLOAD_DIR = "tmp_uploads"
os.makedirs(UPLOAD_DIR, exist_ok=True)

ALLOWED_EXTENSIONS = {".csv", ".json"}


def cleanup_file(path: str):
    """Background task to remove temp files after response."""
    if os.path.exists(path):
        os.remove(path)


def clean_for_json(obj):
    """Recursively convert NaN/inf and numpy types to JSON-safe Python types."""
    if isinstance(obj, dict):
        return {k: clean_for_json(v) for k, v in obj.items()}
    elif isinstance(obj, list):
        return [clean_for_json(item) for item in obj]
    elif isinstance(obj, np.bool_):
        return bool(obj)
    elif isinstance(obj, bool):
        return obj
    elif isinstance(obj, float):
        if np.isnan(obj) or np.isinf(obj):
            return None
        return obj
    elif isinstance(obj, np.integer):
        return int(obj)
    elif isinstance(obj, np.floating):
        if np.isnan(obj) or np.isinf(obj):
            return None
        return float(obj)
    return obj


# ── Policy-first endpoint ─────────────────────────────────────────────────────
# Called by the NestJS PolicyService when the user clicks "Run Pipeline"
# from the policy page. Receives policy_config as a JSON body field
# alongside the file upload.
#
# The policy_config shape (from NestJS policy.service.ts):
# {
#   "resolved_directives": [{ verb, target, scope, condition, source, priority }],
#   "frameworks_attached": [{ id, name, jurisdiction }],
#   "custom_policies_attached": [{ id, name, description }]
# }
#
# This gets threaded through to run_pipeline → planner agent (orchestration)
# → compliance/synthesis via planner-owned delegation context.


@router.post("/run")
async def run_uris_pipeline(
    background_tasks: BackgroundTasks,
    file: UploadFile = File(...),
    task_type: str = Form(...),
    user_goal: str = Form(...),
    target_column: str = Form(None),
    validate_synthesis: bool = Form(False),
    # policy_config arrives as a JSON string in the multipart form.
    # NestJS serialises it before sending; we parse it here.
    policy_config: Optional[str] = Form(None),
    x_dataset_id: str = Header(None),
    x_run_id: str = Header(None),
    x_backend_url: str = Header(None),
):
    print(f"\n[Pipeline] Starting pipeline run...")
    print(f"[Pipeline] Dataset ID:  {x_dataset_id}")
    print(f"[Pipeline] Run ID:      {x_run_id}")
    print(f"[Pipeline] Backend URL: {x_backend_url}")
    print(f"[Pipeline] File:        {file.filename}")
    print(f"[Pipeline] Policy:      {'attached' if policy_config else 'none'}\n")

    ext = os.path.splitext(file.filename)[-1].lower()
    if ext not in ALLOWED_EXTENSIONS:
        raise HTTPException(400, detail=f"Only CSV/JSON allowed, got {ext}")

    # Parse policy_config JSON string → dict (or None if not provided)
    parsed_policy: Optional[dict] = None
    if policy_config:
        try:
            parsed_policy = json.loads(policy_config)
            directive_count = len(parsed_policy.get("resolved_directives", []))
            print(f"[Pipeline] Policy config loaded — {directive_count} resolved directives")
        except json.JSONDecodeError as e:
            raise HTTPException(400, detail=f"Invalid policy_config JSON: {str(e)}")

    file_id   = uuid.uuid4().hex
    temp_path = os.path.join(UPLOAD_DIR, f"{file_id}{ext}")

    emitter = None
    if x_dataset_id and x_run_id and x_backend_url:
        print(f"[Pipeline] ✅ Event emitter initialized")
        emitter = AgentEventEmitter(
            backend_url=x_backend_url,
            dataset_id=x_dataset_id,
            run_id=x_run_id,
        )
    else:
        print(f"[Pipeline] ⚠️  Event emitter NOT initialized (missing headers)")

    try:
        with open(temp_path, "wb") as buffer:
            shutil.copyfileobj(file.file, buffer)

        result = run_pipeline(
            dataset_path=temp_path,
            task_type=task_type,
            user_goal=user_goal,
            target_column=target_column or None,
            event_emitter=emitter,
            enable_validation=validate_synthesis,
            policy_config=parsed_policy,   # ← threaded through; None if no policy
        )

    except Exception as e:
        raise HTTPException(500, detail=f"Pipeline error: {str(e)}")

    finally:
        if os.path.exists(temp_path):
            background_tasks.add_task(cleanup_file, temp_path)

    if result["status"].startswith("error"):
        raise HTTPException(
            status_code=422,
            detail=clean_for_json({
                "stage":   result.get("stage"),
                "message": result.get("message"),
                "trace":   result.get("trace", []),
            }),
        )

    if result.get("synthesis", {}).get("augmented_dataset_path"):
        augmented_path = result["synthesis"]["augmented_dataset_path"]
        return JSONResponse(content=clean_for_json({
            "pipeline_result": result,
            "download_url":    f"/pipeline/download/{os.path.basename(augmented_path)}",
            "message":         "Pipeline complete — synthetic data generated",
        }))

    return JSONResponse(content=clean_for_json(result))


@router.get("/download/{filename}")
async def download_augmented_file(filename: str, background_tasks: BackgroundTasks):
    file_path = os.path.join(UPLOAD_DIR, filename)
    if not os.path.exists(file_path):
        raise HTTPException(404, detail="File not found or expired")

    background_tasks.add_task(cleanup_file, file_path)

    return FileResponse(
        file_path,
        media_type="text/csv",
        filename="uris_augmented_dataset.csv",
        headers={"X-Accel-Redirect": file_path},
    )