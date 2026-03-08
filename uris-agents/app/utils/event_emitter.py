"""
Event emitter for agent reasoning — sends events to NestJS backend via HTTP
for real-time WebSocket broadcasting to frontend.
"""

import requests
import json
from typing import Optional, Dict, Any
import logging
import numpy as np

logger = logging.getLogger(__name__)


def _json_safe(value: Any) -> Any:
    """Recursively normalize numpy/pandas scalar types into JSON-safe Python types."""
    if isinstance(value, dict):
        return {k: _json_safe(v) for k, v in value.items()}
    if isinstance(value, list):
        return [_json_safe(v) for v in value]
    if isinstance(value, tuple):
        return [_json_safe(v) for v in value]
    if isinstance(value, np.bool_):
        return bool(value)
    if isinstance(value, np.integer):
        return int(value)
    if isinstance(value, np.floating):
        if np.isnan(value) or np.isinf(value):
            return None
        return float(value)
    return value


class AgentEventEmitter:
    """Emit agent reasoning events to the NestJS backend"""

    def __init__(self, backend_url: str, dataset_id: str, run_id: str):
        self.backend_url = backend_url
        self.dataset_id = dataset_id
        self.run_id = run_id
        self.base_endpoint = f"{backend_url}/agents/{dataset_id}/runs/{run_id}/events"

    def emit_start(self, agent: str) -> bool:
        """Emit agent start event"""
        return self._emit({
            "type": "agent_start",
            "agent": agent,
        })

    def emit_data(
        self,
        agent: str,
        phase: Optional[str] = None,
        message: Optional[str] = None,
        payload: Optional[Dict[str, Any]] = None,
    ) -> bool:
        """Emit agent data/reasoning event"""
        data = {
            "type": "agent_data",
            "agent": agent,
        }
        
        event_payload = {}
        if phase:
            event_payload["phase"] = phase
        if message:
            event_payload["message"] = message
        if payload:
            event_payload.update(payload)
        
        if event_payload:
            data["payload"] = event_payload

        return self._emit(data)

    def emit_complete(self, agent: str, result: Optional[Dict[str, Any]] = None) -> bool:
        """Emit agent complete event"""
        data = {
            "type": "agent_complete",
            "agent": agent,
        }
        if result:
            data["payload"] = _json_safe(result)

        return self._emit(data)

    def _emit(self, event: Dict[str, Any]) -> bool:
        """Send event to backend"""
        try:
            safe_event = _json_safe(event)
            print(f"[EventEmitter] Posting {safe_event['type']} for {safe_event['agent']} to {self.base_endpoint}")
            response = requests.post(
                self.base_endpoint,
                json=safe_event,
                timeout=5,
            )
            response.raise_for_status()
            print(f"[EventEmitter] ✅ Emitted {safe_event['type']} for {safe_event['agent']}")
            logger.info(f"Emitted {safe_event['type']} for {safe_event['agent']}")
            return True
        except Exception as e:
            print(f"[EventEmitter] ❌ Failed to emit event: {e}")
            logger.warning(f"Failed to emit event: {e}")
            return False
