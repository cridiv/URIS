from fastapi import FastAPI
from .routes.pipeline import router as pipeline_router

app = FastAPI(title="URIS API")
app.include_router(pipeline_router)