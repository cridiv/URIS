# Real-time Agent Reasoning with WebSockets

## Overview

This implementation enables real-time streaming of agent reasoning from the Python backend through the NestJS backend to the React frontend using WebSockets. As agents run during orchestration, you can watch their reasoning, thinking, and results live.

## Architecture

```
Python Agents (uris-agents)
        ↓ (HTTP POST events)
NestJS Backend (uris-backend)
        ↓ (WebSocket broadcast)
React Frontend (uris-frontend)
```

### Data Flow

1. **Python agents emit events** → NestJS `/agents/:datasetId/runs/:runId/events` endpoint
2. **NestJS processes events** → Broadcasts via WebSocket to connected clients
3. **Frontend receives events** → Updates AgentAnalysis UI in real-time

## Setup

### 1. Backend (NestJS)

#### Install WebSocket Dependencies
```bash
cd uris-backend
npm install @nestjs/websockets socket.io
```

#### Files Added/Modified
- **NEW**: `src/agents/agents.gateway.ts` - WebSocket gateway for handling connections and broadcasting
- **UPDATED**: `src/agents/agents.module.ts` - Added AgentsGateway provider
- **UPDATED**: `src/agents/agents.controller.ts` - Added `/events` endpoint to receive events from Python

#### Configuration
Add to `.env` (optional):
```
BACKEND_URL=https://uris.onrender.com
```

The backend will automatically construct callback URLs for the Python service.

### 2. Frontend (React)

#### Install WebSocket Client
```bash
cd uris-frontend
npm install socket.io-client
```

#### Files Modified
- **UPDATED**: `app/Agents/components/AgentAnalysis.tsx`
  - Now connects to WebSocket at mount
  - Subscribes to real-time agent events for current run
  - Renders live reasoning as it streams in

### 3. Python Backend (uris-agents)

#### Files Added
- **NEW**: `app/utils/event_emitter.py` - `AgentEventEmitter` class for HTTP event posting

#### Files Modified
- **UPDATED**: `app/routes/pipeline.py`
  - Accepts headers: `X-Dataset-Id`, `X-Run-Id`, `X-Backend-Url`
  - Creates `AgentEventEmitter` instance
  - Passes emitter to orchestrator

- **UPDATED**: `app/agents/orchestrator.py`
  - Accepts optional `event_emitter` parameter
  - Emits events at each agent stage:
    - `agent_start` - Agent begins execution
    - `agent_data` - Reasoning messages during execution
    - `agent_complete` - Agent finishes with results

## Event Format

Events are JSON objects with this structure:

```typescript
interface AgentReasoningEvent {
  type: 'agent_start' | 'agent_data' | 'agent_complete';
  agent: string;  // 'evaluation', 'planner', 'compliance', 'synthesis'
  ts?: number;    // timestamp (optional)
  payload?: {     // agent-specific data
    phase?: string;
    message?: string;
    [key: string]: any;
  };
}
```

### Examples

```json
// Agent starts
{
  "type": "agent_start",
  "agent": "evaluation"
}

// Reasoning data
{
  "type": "agent_data",
  "agent": "evaluation",
  "payload": {
    "phase": "schema",
    "message": "Schema review complete — 12 columns, 891 rows detected."
  }
}

// Agent completes with result
{
  "type": "agent_complete",
  "agent": "evaluation",
  "payload": {
    "adfi": 0.827,
    "confidence": 0.95,
    "quality_scores": {...},
    "reasoning_steps": [...]
  }
}
```

## How to Use

### 1. Starting a Pipeline Run

From the frontend, click **"Run Pipeline"** in AgentAnalysis. This:

1. Calls `POST /agents/{datasetId}/orchestrate` on NestJS
2. NestJS creates an `AgentRun` record
3. NestJS sends file to Python with headers:
   - `X-Dataset-Id`: dataset ID
   - `X-Run-Id`: run ID (for routing events)
   - `X-Backend-Url`: callback URL

### 2. Python Agents Execute

During execution, agents emit events:

```python
from app.utils.event_emitter import AgentEventEmitter

emitter = AgentEventEmitter(
    backend_url="https://uris.onrender.com",
    dataset_id="ds_123",
    run_id="run_456"
)

# Emit start
emitter.emit_start("evaluation")

# Emit reasoning data
emitter.emit_data("evaluation", 
    phase="schema",
    message="Analyzing dataset structure..."
)

# Emit completion with results
emitter.emit_complete("evaluation", {
    "adfi": 0.827,
    "reasoning_steps": [...]
})
```

### 3. Frontend Receives and Renders

AgentAnalysis component:
1. Opens WebSocket connection on mount
2. Subscribes to events for current run
3. Updates agent state as events arrive
4. Renders logs and results in real-time

```typescript
// Frontend receives:
socket.on('agent_event', (event) => {
  // {type: 'agent_start', agent: 'evaluation'}
  // {type: 'agent_data', agent: 'evaluation', payload: {...}}
  // {type: 'agent_complete', agent: 'evaluation', payload: {...}}
})
```

## Fallback Behavior

If WebSocket is unavailable:
- Frontend displays "WebSocket disconnected" warning
- AgentAnalysis still works but with potential delays
- Events are still POST'd to HTTP endpoint (no real-time UI update)

## Development & Testing

### Run All Services

```bash
# Terminal 1: NestJS Backend
cd uris-backend
npm run start:dev

# Terminal 2: Python Agents
cd uris-agents
source venv/Scripts/activate
uvicorn app.main:app --reload

# Terminal 3: React Frontend
cd uris-frontend
npm run dev
```

### Test Event Flow

1. Navigate to Agents page
2. Click "Run Pipeline"
3. Watch AgentAnalysis update in real-time
4. Check browser DevTools → Network → WS tab to see WebSocket messages

### Manual Testing with curl

```bash
# Simulate Python sending event to backend
curl -X POST https://uris.onrender.com/agents/ds_123/runs/run_456/events \
  -H "Content-Type: application/json" \
  -d '{
    "type": "agent_data",
    "agent": "evaluation",
    "payload": {
      "message": "Testing event streaming"
    }
  }'
```

## Environment Variables

### Backend (.env)
```
AGENTS_URL=https://uris-agent.onrender.com       # Python service URL
BACKEND_URL=https://uris.onrender.com      # For callback URLs
CORS_ORIGINS=https://uris-nu.vercel.app     # Frontend URL
```

### Frontend (.env.local)
```
NEXT_PUBLIC_API_URL=https://uris.onrender.com
```

### Python (no special env needed)
- Receives callback URL via headers from backend

## Troubleshooting

### WebSocket Not Connecting
- Check CORS settings in NestJS main.ts
- Ensure frontend URL is in CORS_ORIGINS
- Check browser console for connection errors

### Events Not Being Emitted
- Verify Python has requests library installed
- Check X-Dataset-Id, X-Run-Id headers are set
- Verify backend URL is reachable from Python container

### Missing Event Payload
- Some agents may not emit detailed reasoning
- Fallback payload structures work for basic rendering
- Check agent code for `emit_data()` calls

## Next Steps

- **Validation agent**: Add event emission to validation logic
- **Error recovery**: Emit error events if agent fails
- **Performance**: Add event rate limiting if needed
- **Persistence**: Save reasoning history to database
- **UI Polish**: Add animations/transitions for event streaming
