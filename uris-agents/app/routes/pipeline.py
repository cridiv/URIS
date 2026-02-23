import os
import uuid
import shutil
from fastapi import APIRouter, UploadFile, File, Form, HTTPException
from fastapi.responses import JSONResponse
from ..agents.orchestrator import run_pipeline

router = APIRouter(prefix="/routes/pipeline", tags=["pipeline"])

UPLOAD_DIR = "tmp_uploads"
os.makedirs(UPLOAD_DIR, exist_ok=True)

ALLOWED_EXTENSIONS = {".csv", ".json"}

@router.post("/evaluate")
async def run_pipeline_endpoint(
    file: UploadFile = File(...),
    task_type: str = Form(...),
    user_goal: str = Form(...),
    target_column: str = Form(None),
):
    
    # Validate file type
    ext = os.path.splitext(file.filename)[-1].lower()
    if ext not in ALLOWED_EXTENSIONS:
        raise HTTPException(
            status_code=400,
            detail=f"Unsupported file type '{ext}'. Only CSV and JSON are accepted."
        )

    # Save upload to temp path with unique name to avoid collisions
    file_id = uuid.uuid4().hex
    temp_path = os.path.join(UPLOAD_DIR, f"{file_id}{ext}")

    try:
        with open(temp_path, "wb") as buffer:
            shutil.copyfileobj(file.file, buffer)

        result = run_pipeline(
            dataset_path=temp_path,
            task_type=task_type,
            user_goal=user_goal,
            target_column=target_column or None,
        )

    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Pipeline error: {str(e)}")

    finally:
        # Always clean up the temp file regardless of success or failure
        if os.path.exists(temp_path):
            os.remove(temp_path)

    if result["status"] == "error":
        raise HTTPException(
            status_code=422,
            detail={
                "stage": result.get("stage"),
                "message": result.get("message"),
            }
        )

    return JSONResponse(content=result)