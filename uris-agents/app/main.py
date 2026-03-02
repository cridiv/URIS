from fastapi import FastAPI
from .routes.pipeline import router as pipeline_router
from .routes.analysis import router as analysis_router

app = FastAPI(title="URIS API")
app.include_router(pipeline_router)
app.include_router(analysis_router)
