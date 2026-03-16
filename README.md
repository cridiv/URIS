# URIS: Universal Relational Intelligence System

A comprehensive multi-agent orchestration platform for dataset analysis, data quality assessment, compliance validation, and intelligent data synthesis.

## System Overview

URIS is a three-tier architecture system designed to analyze datasets through specialized agent pipelines, providing comprehensive insights into data structure, quality metrics, privacy compliance, and synthetic data generation capabilities.

### Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                    Frontend (Next.js 14)                        │
│  - Dataset Upload & Management (Datasets.tsx)                  │
│  - Orchestration Dashboard (Agent.tsx)                          │
│  - Real-time Results Visualization (AgentResult.tsx)           │
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
│     Agents Pipeline (Python FastAPI - External Service)         │
│  - Planner Agent: Dataset structure analysis                   │
│  - Evaluator Agent: Data quality metrics                       │
│  - Compliance Agent: Privacy & compliance validation           │
│  - Synthesizer Agent: Synthetic data generation                │
│  - Validator Agent: Results validation                         │
└─────────────────────────────────────────────────────────────────┘
```

## Features

### Dataset Management
- **Upload & Storage**: CSV file uploads with AWS S3 backend storage
- **Data Profiling**: Automatic column analysis (type, cardinality, missing values)
- **Metadata Tracking**: Row counts, file sizes, column specifications
- **Version History**: Track multiple uploads and run results

### Orchestration & Analysis
- **Multi-Agent Pipeline**: Coordinated analysis through specialized agents
- **Intelligent Routing**: Data flows through planner → evaluator → compliance → synthesizer → validator
- **Real-time Monitoring**: Track orchestration status and progress
- **Result Storage**: Comprehensive pipeline results stored in PostgreSQL

### Quality & Compliance Metrics
- **ADFI Score** (Assay Data Fidelity Index): Overall data quality metric
- **Completeness**: Percentage of non-null values per column
- **Uniqueness**: Cardinality analysis and duplication detection
- **Balance**: Distribution uniformity across categorical values
- **Privacy Risk**: Sensitivity scoring for personally identifiable information
- **Compliance Validation**: Standards adherence checking

### Data Visualization & Analysis
- **Results Dashboard**: ADFI scores, quality metrics, compliance status
- **Pipeline Viewer**: Interactive JSON exploration of orchestration output
- **Historical Analysis**: Compare results across multiple runs
- **Metric Trends**: Track quality improvements/degradation over time

## Technology Stack

### Frontend
- **Framework**: Next.js 14 (React + TypeScript)
- **Styling**: TailwindCSS with custom component system
- **State Management**: React Hooks (useState, useEffect, useContext)
- **API Client**: Fetch API with error handling
- **Build**: Next.js built-in build system

### Backend
- **Framework**: NestJS (TypeScript)
- **Database**: PostgreSQL with PrismaORM
- **Storage**: AWS S3 (configured via environment variables)
- **HTTP Client**: Axios for agents microservice calls
- **Build**: NestJS CLI + TypeScript compiler

### Data Processing
- **Agents Microservice**: Python FastAPI (external service at localhost:8000)
- **Data Format**: CSV input, JSON pipeline results
- **Storage Format**: Prisma JSONB columns for complex result objects

## Project Structure

```
uris-agents/                    # Python FastAPI agents microservice
├── agents/
│   ├── compliance/            # Privacy & compliance validation
│   ├── evaluation/            # Data quality metrics
│   ├── planner/               # Dataset structure analysis
│   ├── synthesis/             # Synthetic data generation
│   └── validation/            # Results validation
├── utils/
│   ├── bedrock.py            # AWS Bedrock integration
│   ├── correlation_checker.py # Feature correlation analysis
│   ├── privacy_checker.py    # PII detection
│   ├── profiler.py           # Column profiling
│   └── synthesizer.py        # Synthetic data generation
└── main.py                    # FastAPI application entry

uris-backend/                   # NestJS REST API
├── src/
│   ├── agents/               # Agent orchestration service
│   │   ├── agents.controller.ts   # API endpoints
│   │   ├── agents.service.ts      # Business logic
│   │   └── agents.module.ts       # Module registration
│   ├── dataset/              # Dataset management
│   │   ├── dataset.controller.ts
│   │   ├── dataset.service.ts
│   │   └── dataset.module.ts
│   ├── aws/                  # AWS S3 integration
│   │   ├── s3.service.ts
│   │   └── s3.storage.ts
│   ├── prisma/              # Database service
│   ├── app.module.ts        # Root module
│   └── main.ts              # Entry point
├── prisma/
│   └── schema.prisma        # Database schema
└── package.json

uris-frontend/                  # Next.js React application
├── app/
│   ├── Agents/              # Orchestration dashboard
│   │   ├── Agent.tsx        # Main orchestration page
│   │   └── components/
│   │       ├── AgentResult.tsx      # Results panel
│   │       ├── AgentAnalysis.tsx    # Pipeline viewer
│   │       ├── DatasetOverview.tsx  # Metadata sidebar
│   │       └── DatasetStatusBar.tsx # Header
│   ├── Datasets/            # Dataset management
│   │   ├── Datasets.tsx     # Upload & analysis start
│   │   └── components/
│   ├── layout.tsx           # Root layout
│   └── page.tsx             # Home page
└── package.json
```

## Data Flow: Complete Orchestration Journey

### 1. Dataset Upload (Datasets.tsx)
```
User selects CSV file → Upload to backend → S3 storage → Database entry
                                    ↓
                        Return dataset metadata
                                    ↓
                        Display in datasets list
```

### 2. Orchestration Initiation (Datasets.tsx → Agent.tsx)
```
User clicks "Analyze" button
        ↓
POST /agents/{datasetId}/orchestrate
        ↓
Backend creates pending run record
        ↓
Extract run.id from response
        ↓
Navigate to /Agents?datasetId=...&runId=...
```

### 3. Backend Orchestration (agents.service.ts)
```
orchestrateAgents() receives datasetId
        ↓
1. Create run record in database
        ↓
2. Call agents microservice: POST https://uris-agent.onrender.com/pipeline/run
        ↓
3. Receive pipeline results JSON
        ↓
4. Parse metrics:
   - adfiScore (ADFI Index)
   - privacy_risk_score
   - evaluation metrics (completeness, uniqueness, balance)
   - compliance results
   - synthetic data specifications
        ↓
5. Update run record with results & status
        ↓
6. Return { run: {...}, pipeline: {...} }
```

### 4. Frontend Results Display (Agent.tsx)
```
Component loads with ?datasetId=...&runId=...
        ↓
Fetch dataset: GET /agents/{datasetId}
        ↓
Receives: { dataset: {...}, runs: [...] }
        ↓
Load selected run with metrics
        ↓
Render child components:

┌────────────────────────────────────────────────────┐
│          DatasetStatusBar (Header)                 │
│  Dataset: titanic | Run: run-a1f2c3d4 | Status: ✓ │
│  ADFI: 87.3% | Privacy Risk: Low                   │
└────────────────────────────────────────────────────┘
│                                                    │
│ ┌──────────────────┐  ┌────────────────────────┐  │
│ │ DatasetOverview  │  │   AgentResult Panel    │  │
│ │ (Left Sidebar)   │  │   (Right Results)      │  │
│ │                  │  │                        │  │
│ │ Columns:         │  │ ✓ ADFI: 87.3%         │  │
│ │ - PassengerId    │  │ • Completeness: 94%   │  │
│ │ - Name (string)  │  │ • Uniqueness: 92%     │  │
│ │ - Age (numeric)  │  │ • Balance: 85%        │  │
│ │ - Fare (numeric) │  │ • Privacy Risk: Low   │  │
│ │                  │  │ • Records: 891        │  │
│ │ Run History:     │  │ • Null Count: 54      │  │
│ │ [run-a1f2c3d4]✓  │  │                        │  │
│ │  run-9b8d7c6e ✓  │  │                        │  │
│ └──────────────────┘  └────────────────────────┘  │
│                                                    │
│ ┌──────────────────────────────────────────────┐  │
│ │      AgentAnalysis (Center - Pipeline JSON)  │  │
│ │ {                                             │  │
│ │   "adfiScore": 87.3,                          │  │
│ │   "evaluation": {                             │  │
│ │     "completeness": 0.94,                     │  │
│ │     "uniqueness": 0.92,                       │  │
│ │     "balance": 0.85                           │  │
│ │   },                                          │  │
│ │   "compliance": {...}                         │  │
│ │ }                                             │  │
│ └──────────────────────────────────────────────┘  │
└────────────────────────────────────────────────────┘
```

## Component Documentation

### Frontend Components

#### **Agent.tsx** (Main Orchestration Page)
- **Purpose**: Orchestration dashboard hub
- **Location**: [app/Agents/Agent.tsx](uris-frontend/app/Agents/Agent.tsx)
- **Key Features**:
  - Fetches dataset metadata from `/agents/{datasetId}`
  - Fetches agent run history from `/agents/{datasetId}`
  - Manages selected run state
  - Coordinates child component updates
- **Props Passed**: `dataset`, `currentRun`, `runs`, `loading`
- **Data Dependencies**: Uses URL params `datasetId` and `runId`

#### **AgentResult.tsx** (Results Panel)
- **Purpose**: Display numerical analysis results and metrics
- **Location**: [app/Agents/components/AgentResult.tsx](uris-frontend/app/Agents/components/AgentResult.tsx)
- **Key Features**:
  - Renders ADFI score with percentage bar
  - Shows quality metrics (completeness, uniqueness, balance)
  - Displays privacy risk level
  - Shows data statistics (row count, null count, file size)
  - Calculates ADFI delta vs. previous runs
- **Metrics Extracted From**:
  - `pipeline.evaluation` - quality metrics
  - `pipeline.compliance` - privacy & compliance scores
  - `run` record - timestamps and status

#### **AgentAnalysis.tsx** (Pipeline Viewer)
- **Purpose**: Display raw pipeline JSON output
- **Location**: [app/Agents/components/AgentAnalysis.tsx](uris-frontend/app/Agents/components/AgentAnalysis.tsx)
- **Key Features**:
  - Pretty-prints JSON with 2-space indentation
  - Allows inspection of complete orchestration output
  - Handles both `run.result` and nested `run.result.pipeline_result`
- **Data Structure**: Displays complete agents microservice response

#### **DatasetOverview.tsx** (Metadata Sidebar)
- **Purpose**: Show dataset info and run history for comparison
- **Location**: [app/Agents/components/DatasetOverview.tsx](uris-frontend/app/Agents/components/DatasetOverview.tsx)
- **Key Features**:
  - Displays profiled columns with type & stats
  - Lists run history (last 10 runs)
  - Shows ADFI score for each run
  - Allows selecting different runs for comparison
  - Calculates ADFI delta vs. most recent run

#### **DatasetStatusBar.tsx** (Header)
- **Purpose**: Top bar showing dataset and run status
- **Location**: [app/Agents/components/DatasetStatusBar.tsx](uris-frontend/app/Agents/components/DatasetStatusBar.tsx)
- **Key Features**:
  - Displays dataset name (from URL or API)
  - Shows run ID prefix
  - Indicates orchestration status
  - Displays key metrics (ADFI, compliance)
  - Shows last updated timestamp

#### **Datasets.tsx** (Dataset Browser & Upload)
- **Purpose**: Dataset management and orchestration trigger
- **Location**: [app/Datasets/Datasets.tsx](uris-frontend/app/Datasets/Datasets.tsx)
- **Key Features**:
  - Lists all uploaded datasets
  - CSV file upload with S3 backend
  - "Analyze" button triggers orchestration
  - Navigates to /Agents on successful orchestration
- **Orchestration Flow**:
  ```typescript
  handleAnalyze(datasetId) {
    POST /agents/{datasetId}/orchestrate
    Extract run.id from response
    Navigate to /Agents?datasetId={id}&runId={runId}
  }
  ```

### Backend Services

#### **agents.controller.ts** (API Endpoints)
- **Location**: [src/agents/agents.controller.ts](uris-backend/src/agents/agents.controller.ts)
- **Endpoints**:
  ```
  GET  /agents/:datasetId
       → Returns { dataset: {...}, runs: [...] }
       → Used to fetch dataset and run history
       
  POST /agents/:datasetId/orchestrate
       → Body: empty or { }
       → Returns { run: {...}, pipeline: {...} }
       → Triggers new orchestration
       
  GET  /agents/:datasetId/runs/:runId
       → Returns { run: {...}, pipeline: {...} }
       → Fetches specific run result
  ```

#### **agents.service.ts** (Business Logic)
- **Location**: [src/agents/agents.service.ts](uris-backend/src/agents/agents.service.ts)
- **Key Methods**:

  **orchestrateAgents(datasetId)**
  - Creates pending run record
  - Calls agents microservice at `https://uris-agent.onrender.com/pipeline/run`
  - Parses response for metrics (ADFI, privacy risk, evaluation scores)
  - Updates run with results and completion status
  - Returns combined run and pipeline results
  
  **getDatasetRuns(datasetId)**
  - Fetches dataset metadata from database
  - Retrieves last 10 runs for dataset
  - Returns: `{ dataset: {...}, runs: [...] }`
  - Dataset fields: id, name, rowCount, columnCount, sizeBytes, profileMeta, status
  
  **getRunResult(runId)**
  - Fetches specific run with complete pipeline results
  - Returns: `{ run: {...}, pipeline: {...} }`

#### **dataset.service.ts** (Dataset Management)
- **Location**: [src/dataset/dataset.service.ts](uris-backend/src/dataset/dataset.service.ts)
- **Key Methods**:
  - `uploadDataset()` - Handle CSV upload to S3 and database
  - `profileDataset()` - Analyze column structure and cardinality
  - `getDatasets()` - List all uploaded datasets
  - `getDataset()` - Fetch specific dataset metadata

#### **s3.service.ts** (AWS Integration)
- **Location**: [src/aws/s3.service.ts](uris-backend/src/aws/s3.service.ts)
- **Key Methods**:
  - `uploadFile()` - Store file to S3 bucket
  - `getFile()` - Retrieve file from S3
  - `deleteFile()` - Remove file from S3

## API Contract Specifications

### Response Format: `/agents/{datasetId}`

```typescript
{
  "dataset": {
    "id": "uuid-string",
    "name": "titanic_clean",
    "rowCount": 891,
    "columnCount": 4,
    "sizeBytes": 65432,
    "profileMeta": {
      "columns": [
        {
          "name": "PassengerId",
          "type": "integer",
          "cardinality": 891,
          "nullCount": 0
        },
        // ... more columns
      ]
    },
    "status": "active",
    "createdAt": "2026-03-03T10:30:00Z"
  },
  "runs": [
    {
      "id": "run-uuid-1",
      "datasetId": "dataset-uuid",
      "status": "completed",
      "adfiScore": 87.3,
      "privacy_risk_score": 0.25,
      "result": {
        "adfiScore": 87.3,
        "evaluation": {
          "completeness": 0.94,
          "uniqueness": 0.92,
          "balance": 0.85
        },
        "compliance": {
          "privacy_risk": "low",
          // ... more compliance data
        }
      },
      "createdAt": "2026-03-03T11:00:00Z",
      "completedAt": "2026-03-03T11:05:30Z"
    }
    // ... more runs
  ]
}
```

### Response Format: `POST /agents/{datasetId}/orchestrate`

```typescript
{
  "run": {
    "id": "run-uuid-new",
    "datasetId": "dataset-uuid",
    "status": "completed",
    "adfiScore": 87.3,
    "privacy_risk_score": 0.25,
    "createdAt": "2026-03-03T11:00:00Z",
    "completedAt": "2026-03-03T11:05:30Z"
  },
  "pipeline": {
    "adfiScore": 87.3,
    "evaluation": {
      "completeness": 0.94,
      "uniqueness": 0.92,
      "balance": 0.85
    },
    "compliance": {
      "privacy_risk": "low",
      "pii_detected": ["name_col"],
      "sensitivity_score": 0.3
    },
    "synthesis": {
      "feasibility": 0.89,
      "estimated_rows": 891
    },
    "validation": {
      "passed": true,
      "checks_total": 15,
      "checks_passed": 15
    }
  }
}
```

## Database Schema

### Key Tables (Prisma)

**Dataset**
```
- id (String, @id)
- name (String)
- rowCount (Int)
- columnCount (Int)
- sizeBytes (BigInt)
- profileMeta (Json) - Column metadata
- status (String) - 'active', 'archived', etc.
- s3Path (String) - S3 object key
- createdAt (DateTime)
- updatedAt (DateTime)
- runs (Run[]) - Relationship to runs
```

**Run**
```
- id (String, @id)
- datasetId (String, @fk)
- status (String) - 'pending', 'running', 'completed', 'failed'
- adfiScore (Float)
- privacy_risk_score (Float)
- result (Json) - Complete pipeline output
- createdAt (DateTime)
- completedAt (DateTime)
- dataset (Dataset) - Relationship to dataset
```

## Setup & Installation

### Prerequisites
- Node.js 18+ with npm
- Python 3.10+ with pip
- PostgreSQL 14+
- AWS account with S3 bucket
- Docker (optional for database)

### Environment Configuration

**Backend (.env)**
```
DATABASE_URL=postgresql://user:password@localhost:5432/uris_db
AWS_ACCESS_KEY_ID=your-aws-key
AWS_SECRET_ACCESS_KEY=your-aws-secret
AWS_S3_BUCKET=your-bucket-name
AWS_REGION=us-east-1
AGENTS_MICROSERVICE_URL=https://uris-agent.onrender.com
NODE_ENV=development
PORT=5000
```

**Frontend (.env.local)**
```
NEXT_PUBLIC_API_URL=https://uris.onrender.com
```

### Installation Steps

```bash
# 1. Backend setup
cd uris-backend
npm install
npx prisma migrate dev
npm run start:dev

# 2. Frontend setup (new terminal)
cd uris-frontend
npm install
npm run dev

# 3. Agents microservice (new terminal)
cd uris-agents
pip install -r requirements.txt
python -m uvicorn main:app --reload --port 8000
```

### Access Points
- **Frontend**: https://uris-nu.vercel.app
- **Backend API**: https://uris.onrender.com
- **Agents Service**: https://uris-agent.onrender.com

## Key Metrics Explained

### ADFI Score (Assay Data Fidelity Index)
- **Range**: 0-100%
- **Calculation**: Weighted combination of quality metrics
- **Components**:
  - Completeness: How many values are non-null
  - Uniqueness: How diverse the values are (low cardinality ≠ diverse)
  - Balance: Distribution uniformity across categories
- **Interpretation**: Higher = better data quality for analysis

### Privacy Risk Score
- **Range**: 0.0-1.0 (0% to 100%)
- **Assessment**: Presence of PII, cardinality of identifiers
- **Flags**: Name columns, ID columns, email patterns
- **Risk Levels**: Low (<0.3), Medium (0.3-0.7), High (>0.7)

### Quality Metrics
- **Completeness** (0-1): Fraction of non-null values
- **Uniqueness** (0-1): Cardinality ÷ Row Count
- **Balance** (0-1): Distribution evenness (1.0 = perfectly uniform)

## Error Handling & Troubleshooting

### Common Issues

**Backend Build Fails**
- Check Node.js version: `node --version` (require v18+)
- Clear cache: `rm -r node_modules package-lock.json && npm install`
- Verify DATABASE_URL connection

**Orchestration Timeout**
- Ensure agents microservice is running: `curl https://uris-agent.onrender.com/docs`
- Check agents logs for errors
- Increase timeout in agents.service.ts if needed

**S3 Upload Fails**
- Verify AWS credentials in .env
- Check S3 bucket exists and is accessible
- Verify IAM permissions for PutObject, GetObject

**Frontend Can't Connect to Backend**
- Verify NEXT_PUBLIC_API_URL is correct
- Check backend is running: `curl https://uris.onrender.com/health`
- Check CORS configuration in backend

## Development Workflow

### Adding New Metrics
1. Update agents microservice to calculate metric
2. Modify pipeline response schema
3. Update Run type in Prisma schema
4. Create display component in frontend
5. Add metric extraction in AgentResult.tsx

### Extending Agents
1. Create new agent in `uris-agents/agents/{agent_name}/`
2. Update orchestrator.py to route data to agent
3. Register in agents microservice
4. Update backend to call new agent endpoint
5. Add UI to display results

### Database Migrations
```bash
cd uris-backend
npx prisma migrate dev --name "add_new_field"
```

## Production Deployment

### Considerations
- Use managed database (RDS)
- Store AWS credentials in secrets manager
- Enable request logging and monitoring
- Implement rate limiting on orchestrate endpoint
- Use CDN for frontend assets
- Set up health check endpoints

## Contributing

### Code Quality
- Run TypeScript compiler: `npm run build`
- Run linter: `npm run lint`
- Format code: `npm run format`
- Run tests: `npm test`

### Testing
- Backend: Jest test suite in `src/**/*.spec.ts`
- Frontend: React Testing Library in components
- E2E: Playwright tests for orchestration flow

## Performance Metrics

### Typical Orchestration Time
- Small datasets (<1MB): 5-15 seconds
- Medium datasets (1-100MB): 15-60 seconds
- Large datasets (>100MB): 60-300 seconds

### Database Query Times
- GetDatasetRuns: <100ms
- GetRunResult: <50ms
- CreateRun: <30ms

## Support & Documentation

- Backend API docs: https://uris.onrender.com/api/docs
- Agents microservice docs: https://uris-agent.onrender.com/docs
- Prisma studio: `npx prisma studio`
- Frontend type definitions: `uris-frontend/app/types/`

---

**Last Updated**: March 3, 2026  
**System Version**: 1.0.0  
**Status**: Production Ready
