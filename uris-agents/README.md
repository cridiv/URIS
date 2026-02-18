# URIS Agents

Python microservice powering the URIS (Unified Reasoning Intelligence System) multi-agent pipeline.

## Stack
- FastAPI + Uvicorn
- Amazon Nova 2 Lite via AWS Bedrock
- Pandas, NumPy, Chardet

## Setup
```bash
python -m venv venv
source venv/bin/activate  # Windows: venv\Scripts\activate
pip install fastapi uvicorn boto3 python-dotenv pandas numpy chardet
```

Create `.env`:
```
AWS_ACCESS_KEY_ID=your_key
AWS_SECRET_ACCESS_KEY=your_secret
AWS_REGION=us-east-1
```

Run:
```bash
uvicorn app.main:app --reload --port 8000
```

## Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/analyze` | Upload CSV/JSON + goal → profile + plan |
| POST | `/profile` | Upload file → dataset summary only |
| POST | `/plan` | JSON summary + goal → plan only |
| GET | `/health` | Health check |

## Agents
- **Planner** — decomposes user goal into ordered data quality tasks using Nova 2 Lite
- Evaluation, Compliance, Synthesis, Validation *(in progress)*
```

---