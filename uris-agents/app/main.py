from fastapi import FastAPI, UploadFile, File, Form
from pydantic import BaseModel
from app.agents.planner import run_planner
from app.utils.profiler import profile_dataset
import shutil
import os
import uuid

app = FastAPI(title="URIS Agent Service")

UPLOAD_DIR = "tmp_uploads"
os.makedirs(UPLOAD_DIR, exist_ok=True)


class PlanRequest(BaseModel):
    dataset_summary: dict
    user_goal: str


@app.post("/plan")
def plan(request: PlanRequest):
    result = run_planner(request.dataset_summary, request.user_goal)
    return result


# Profile only — useful for previewing dataset before planning
@app.post("/profile")
async def profile(file: UploadFile = File(...)):
    tmp_path = f"{UPLOAD_DIR}/{uuid.uuid4()}_{file.filename}"
    with open(tmp_path, "wb") as buffer:
        shutil.copyfileobj(file.file, buffer)
    try:
        summary = profile_dataset(tmp_path)
        return {"status": "success", "dataset_summary": summary}
    finally:
        os.remove(tmp_path)  # clean up


# Upload + profile + plan in one shot — this is the main flow
@app.post("/analyze")
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
            "plan": plan_result.get("plan")
        }
    finally:
        os.remove(tmp_path)


@app.get("/health")
def health():
    return {"status": "ok"}