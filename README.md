[![URIS Presentation Demo](https://img.youtube.com/vi/HrdMXX7r1v4/maxresdefault.jpg)](https://www.youtube.com/watch?v=HrdMXX7r1v4)
# URIS: Unified Reasoning Intelligence System

> **Autonomous Data Intelligence, Powered by Amazon Nova 2 Lite**

URIS is a multi-agent orchestration platform that autonomously diagnoses, fixes, and validates datasets for AI readiness. Five specialized agents work in sequence — and sometimes in opposition — to deliver clean, compliant, AI-ready data with a complete audit trail.

Unlike orchestration pipelines where agents simply execute steps in order, URIS agents evaluate each other's outputs, reject failing strategies, and force the Planner to revise its approach. That distinction — between executing and reasoning — is the core of what URIS is.

🔗 **Live Demo**: [uris-nu.vercel.app](https://uris-nu.vercel.app)  
📦 **Backend API**: [uris.onrender.com](https://uris.onrender.com)  
🤖 **Agents Service**: [uris-agent.onrender.com](https://uris-agent.onrender.com)

---

## What Makes URIS Different

Traditional data pipelines hand you output and move on. They don't push back. They don't catch their own mistakes.

URIS agents do.

When the Synthesis Agent generates data that fails privacy checks, the Validation Agent rejects it — not because it was programmed to handle that specific failure, but because it evaluated the output against constraints and made a judgment. The Planner then revises the strategy and tries a structurally different approach. This rejection-revision cycle is what makes URIS autonomous rather than automated.

---

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                    Frontend (Next.js 14)                        │
│  - Dataset Upload & Management (Datasets.tsx)                  │
│  - Orchestration Dashboard (Agent.tsx)                          │
│  - Real-time Pipeline Visualization (AgentResult.tsx)          │
│  - Pipeline Analysis Viewer (AgentAnalysis.tsx)                │
│  - Dataset Metadata Browser (DatasetOverview.tsx)              │
└─────────────────────────────────────────────────────────────────┘
                              ↓
                         HTTP REST API
                              ↓
┌─────────────────────────────────────────────────────────────────┐
│              Backend (NestJS + PrismaORM + PostgreSQL)          │
│  - Dataset Management & Profiling                              │
│  - Agent Run Orchestration                                     │
│  - Results Storage & Retrieval                                 │
│  - AWS S3 File Management                                      │
└─────────────────────────────────────────────────────────────────┘
                              ↓
                    Agents Microservice
                              ↓
┌─────────────────────────────────────────────────────────────────┐
│          Agents Pipeline (Python FastAPI)                       │
│                                                                 │
│  Planner → Evaluator → Compliance → Synthesizer → Validator    │
│      ↑___________________ Revision Loop ___________________↑   │
│                                                                 │
│  Powered by Amazon Nova 2 Lite via AWS Bedrock                 │
└─────────────────────────────────────────────────────────────────┘
```

---

## The Agent Pipeline

Each agent has a single, well-defined job. The intelligence emerges from how they interact.

### Planner Agent
Receives the dataset and decomposes the task — identifying the target AI use case, defining constraints (balance targets, privacy thresholds, variance limits), and routing work to downstream agents. Critically, the Planner re-runs when the Validation Agent rejects a strategy, generating a structurally different approach rather than retrying the same one.

### Evaluation Agent
Calculates the **Autonomous Data Fitness Index (ADFI)** — a single score measuring how AI-ready a dataset is across five dimensions: completeness, uniqueness, balance, distribution quality, and consistency. Also identifies critical gaps with severity ratings.

```
ADFI = w₁(Completeness) + w₂(Uniqueness) + w₃(Balance) − w₄(PrivacyRisk) − w₅(CorrelationDrift)
```

| Score | Interpretation |
|-------|---------------|
| > 0.9 | AI-ready |
| 0.7 – 0.9 | Usable, improvements recommended |
| < 0.7 | Significant work required |

### Compliance Agent
Runs **before any data is modified**. Scans every column for PII patterns, assesses GDPR and CCPA exposure, calculates re-identification risk, and enforces user-defined policy rules. Can block the entire pipeline if a proposed transformation increases privacy risk.

Privacy risk scoring combines PII detection, identifier cardinality analysis, and sensitivity flagging:

| Score | Risk Level |
|-------|-----------|
| < 0.3 | Low |
| 0.3 – 0.7 | Medium |
| > 0.7 | High |

### Synthesis Agent
Generates statistically similar synthetic samples to fix class imbalances and fill sparse columns. Preserves column relationships and distributions. Selects synthesis strategy based on dataset characteristics — GaussianCopula for numeric-heavy datasets, CTGAN for categorical-heavy ones. Proposes multiple strategies when the first fails.

### Validation Agent
Compares pre and post-augmentation metrics. Measures distribution similarity, exact match rates, and correlation drift. **Can reject synthesis output entirely** if quality degrades or constraints are violated. Triggers strategy revision with structured reasoning explaining what failed and why.

---

## The Compliance Policy Engine

Users define compliance rules through a visual policy rule builder. Rules compile into executable policy directives:

```
POLICY gdpr_standard {
  DROP direct_identifiers IF pii_type IS direct_identifier;
  GENERALISE pii_columns IF pii_type IS quasi_identifier;
  MASK financial_columns IF pii_type IS financial;
}
```

Available actions: `BLOCK` · `MASK` · `FLAG` · `GENERALISE` · `DROP`

Available conditions: `pii_type IS direct_identifier` · `pii_type IS quasi_identifier` · `pii_type IS financial` · `pii_type IS health` · `reid_risk > 0.3`

Policies attach to evaluation runs and are enforced by the Compliance Agent before synthesis begins.

---

## Key Engineering Decisions

**Why structured JSON agent communication.**
The naive approach passes full agent output directly to the next agent. On a medium dataset, the Evaluation Agent alone produces enough output to bloat context significantly by the time the Validator runs — causing the model to contradict its earlier reasoning. URIS extracts a compact typed handoff object at each step, containing only the fields the next agent actually needs. This eliminated an entire class of hallucinations caused by context overflow.

**Why GaussianCopula first, CTGAN on failure.**
GaussianCopula is faster and generalizes well on numeric-heavy datasets. For categorical-heavy datasets like Titanic, it memorizes rather than generalizes — producing exact row matches that violate privacy thresholds. The Validator catches this and the Planner revises to CTGAN, which handles categorical distributions better at the cost of longer synthesis time. The architecture attempts the cheaper strategy first and escalates on failure.

**Why the correlation baseline recomputes after imputation.**
Computing correlation drift against the original schema after imputation and column drops produces invalid comparisons — the matrices have different shapes. URIS recomputes the baseline correlation matrix after every transformation step, ensuring drift is measured against what the data actually looked like at that point in the pipeline, not at upload.

**Why a custom policy DSL over hardcoded rules.**
Hardcoded compliance rules make the system brittle — every new regulation or internal policy requires a code change. The policy rule builder compiles user-defined directives into executable policy objects that the Compliance Agent enforces. The same engine that enforces GDPR today can enforce a custom internal data governance policy tomorrow without touching agent code.

**Why Amazon Nova 2 Lite for all agent reasoning.**
Constraint-aware strategy revision requires a model that can hold multiple competing objectives simultaneously, evaluate an output against those constraints, and generate a structurally different alternative when the first approach fails. That is not prompt chaining. That is reasoning. Nova 2 Lite's extended thinking capabilities are what make the rejection-revision cycle possible — not just the happy path.

---

## Technology Stack

### Frontend
- **Framework**: Next.js 14 (React + TypeScript)
- **Styling**: TailwindCSS
- **State Management**: React Hooks
- **Deployment**: Vercel

### Backend
- **Framework**: NestJS (TypeScript)
- **Database**: PostgreSQL with PrismaORM
- **Storage**: AWS S3
- **Deployment**: Render

### Agents Microservice
- **Framework**: Python FastAPI
- **LLM**: Amazon Nova 2 Lite via AWS Bedrock (`bedrock.py`)
- **Synthesis**: SDV (Synthetic Data Vault) — GaussianCopula + CTGAN
- **Privacy**: Custom PII detection (`privacy_checker.py`)
- **Correlation**: Feature drift analysis (`correlation_checker.py`)
- **Deployment**: Render

---

## Project Structure

```
uris-agents/                    # Python FastAPI agents microservice
├── agents/
│   ├── compliance/            # PII detection & policy enforcement
│   ├── evaluation/            # ADFI scoring & quality metrics
│   ├── planner/               # Task decomposition & routing
│   ├── synthesis/             # Synthetic data generation
│   └── validation/            # Output approval & rejection
├── utils/
│   ├── bedrock.py            # AWS Bedrock / Nova 2 Lite integration
│   ├── correlation_checker.py # Feature correlation drift analysis
│   ├── privacy_checker.py    # PII detection & risk scoring
│   ├── profiler.py           # Column profiling & cardinality
│   └── synthesizer.py        # SDV synthesis strategies
└── main.py                    # FastAPI application entry

uris-backend/                   # NestJS REST API
├── src/
│   ├── agents/               # Agent orchestration service
│   │   ├── agents.controller.ts
│   │   ├── agents.service.ts
│   │   └── agents.module.ts
│   ├── dataset/              # Dataset management
│   ├── aws/                  # S3 integration
│   └── prisma/               # Database service
└── prisma/schema.prisma       # Database schema

uris-frontend/                  # Next.js React application
├── app/
│   ├── Agents/               # Orchestration dashboard
│   │   ├── Agent.tsx
│   │   └── components/
│   │       ├── AgentResult.tsx       # Metrics & scores panel
│   │       ├── AgentAnalysis.tsx     # Pipeline JSON viewer
│   │       ├── DatasetOverview.tsx   # Metadata sidebar
│   │       └── DatasetStatusBar.tsx  # Header bar
│   └── Datasets/             # Dataset management & upload
└── package.json
```

---

## Data Flow

### Upload → Analyze → Download

```
1. User uploads CSV
        ↓
   Backend stores to S3 + creates database entry
        ↓
2. User triggers analysis
        ↓
   POST /agents/{datasetId}/orchestrate
        ↓
   Agents microservice runs pipeline:
   Planner → Evaluator → Compliance → Synthesizer → Validator
        ↓
   If Validator rejects → Planner revises → Synthesizer reruns
        ↓
3. Results stored in PostgreSQL (JSONB)
        ↓
   Frontend renders: ADFI score, metrics, compliance status,
   agent reasoning traces, audit log
        ↓
4. User downloads AI-ready synthetic dataset
```

### Agent Communication Protocol

Agents pass compact typed handoff objects — not full outputs:

```json
{
  "task_id": "run-cmmrx9wj",
  "agent": "Validation",
  "status": "rejected",
  "confidence": 0.95,
  "risk_score": 0.82,
  "reasoning": "712 exact row matches found. Privacy threshold violated.",
  "recommendation": "Switch to CTGAN. Reduce augmentation budget to 300 rows."
}
```

---

## API Reference

### `GET /agents/:datasetId`
Returns dataset metadata and full run history.

```typescript
{
  dataset: { id, name, rowCount, columnCount, sizeBytes, profileMeta, status },
  runs: [{ id, status, adfiScore, privacy_risk_score, result, createdAt }]
}
```

### `POST /agents/:datasetId/orchestrate`
Triggers a new pipeline run. Returns run record and full pipeline output.

```typescript
{
  run: { id, status, adfiScore, privacy_risk_score, createdAt, completedAt },
  pipeline: {
    adfiScore: 0.921,
    evaluation: { completeness, uniqueness, balance },
    compliance: { privacy_risk, pii_detected, sensitivity_score },
    synthesis: { strategy, rows_generated, attempt_count },
    validation: { passed, checks_total, checks_passed }
  }
}
```

### `GET /agents/:datasetId/runs/:runId`
Returns a specific run with complete pipeline output.

---

## Database Schema

```prisma
model Dataset {
  id          String   @id
  name        String
  rowCount    Int
  columnCount Int
  sizeBytes   BigInt
  profileMeta Json     // Column types, cardinality, null counts
  status      String   // active | archived
  s3Path      String
  createdAt   DateTime
  runs        Run[]
}

model Run {
  id               String    @id
  datasetId        String
  status           String    // pending | running | completed | failed
  adfiScore        Float
  privacy_risk_score Float
  result           Json      // Complete pipeline output
  createdAt        DateTime
  completedAt      DateTime?
  dataset          Dataset
}
```

---

## Setup & Installation

### Prerequisites
- Node.js 18+
- Python 3.10+
- PostgreSQL 14+
- AWS account with S3 bucket and Bedrock access (Nova 2 Lite)

### Environment Variables

**Backend (`uris-backend/.env`)**
```env
DATABASE_URL=postgresql://user:password@localhost:5432/uris_db
AWS_ACCESS_KEY_ID=your-key
AWS_SECRET_ACCESS_KEY=your-secret
AWS_S3_BUCKET=your-bucket
AWS_REGION=us-east-1
AGENTS_MICROSERVICE_URL=
PORT=5000
```

**Frontend (`uris-frontend/.env.local`)**
```env
NEXT_PUBLIC_API_URL=
```

### Run Locally

```bash
# Agents microservice
cd uris-agents
pip install -r requirements.txt
python -m uvicorn main:app --reload --port 8000

# Backend
cd uris-backend
npm install
npx prisma migrate dev
npm run start:dev

# Frontend
cd uris-frontend
npm install
npm run dev
```

---

## Performance

| Dataset Size | Pipeline Time |
|---|---|
| < 1MB | 5 – 15 seconds |
| 1MB – 100MB | 15 – 60 seconds |
| > 100MB | 60 – 300 seconds |

| Database Operation | Typical Latency |
|---|---|
| GetDatasetRuns | < 100ms |
| GetRunResult | < 50ms |
| CreateRun | < 30ms |

---


## Built With

- [Amazon Nova 2 Lite](https://aws.amazon.com/bedrock/nova/) — Agent reasoning via AWS Bedrock
- [SDV — Synthetic Data Vault](https://sdv.dev/) — GaussianCopula & CTGAN synthesis
- [NestJS](https://nestjs.com/) — Backend framework
- [Next.js 14](https://nextjs.org/) — Frontend framework
- [Prisma](https://www.prisma.io/) — Database ORM
- [FastAPI](https://fastapi.tiangolo.com/) — Agents microservice

---

*Amazon Nova AI Hackathon 2026 · #AmazonNova · Built by Ademola Deremi*
