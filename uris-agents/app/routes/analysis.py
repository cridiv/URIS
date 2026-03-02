from fastapi import APIRouter, UploadFile, File, Form
from pydantic import BaseModel
from ..agents.planner.agent import run_planner
from ..utils.profiler import profile_dataset
import shutil
import os
import uuid

router = APIRouter(prefix="/analysis", tags=["analysis"])

UPLOAD_DIR = "tmp_uploads"
os.makedirs(UPLOAD_DIR, exist_ok=True)


class PlanRequest(BaseModel):
    dataset_summary: dict
    user_goal: str


@router.post("/plan")
def plan(request: PlanRequest):
    result = run_planner(request.dataset_summary, request.user_goal)
    return result


# Profile only — useful for previewing dataset before planning
@router.post("/profile")
async def profile(file: UploadFile = File(...)):
    tmp_path = f"{UPLOAD_DIR}/{uuid.uuid4()}_{file.filename}"
    with open(tmp_path, "wb") as buffer:
        shutil.copyfileobj(file.file, buffer)
    try:
        summary = profile_dataset(tmp_path)
        return {"status": "success", "dataset_summary": summary}
    finally:
        if os.path.exists(tmp_path):
            os.remove(tmp_path)


# Upload + profile + plan in one shot
@router.post("/analyze")
async def analyze(file: UploadFile = File(...), user_goal: str = Form(...)):
    tmp_path = f"{UPLOAD_DIR}/{uuid.uuid4()}_{file.filename}"
    with open(tmp_path, "wb") as buffer:
        shutil.copyfileobj(file.file, buffer)
    try:
        summary = profile_dataset(tmp_path)
        plan_result = run_planner(summary, user_goal)
        return {
            "status": "success",
            "dataset_summary": summary,
            "plan": plan_result,
        }
    finally:
        if os.path.exists(tmp_path):
            os.remove(tmp_path)