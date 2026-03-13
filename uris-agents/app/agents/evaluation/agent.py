import json
import re
from typing import Dict, Any, Optional
from ...utils.bedrock import invoke_nova
from ...utils.profiler import profile_dataset
from ...utils.event_emitter import AgentEventEmitter

AGENT = "evaluation"


def _fix_json_string(s: str) -> str:
    s = re.sub(r',(\s*[}\]])', r'\1', s)
    s = re.sub(r'([{,]\s*)([a-zA-Z_][a-zA-Z0-9_]*)(\s*:)', r'\1"\2"\3', s)
    return s


def _strip_code_fences(text: str) -> str:
    return re.sub(r'^```(?:json)?\s*|\s*```$', '', text, flags=re.MULTILINE).strip()


def _extract_json_object(text: str) -> str:
    """Return the largest top-level {...} block if present; otherwise return input."""
    start = text.find("{")
    end = text.rfind("}")
    if start == -1 or end == -1 or end <= start:
        return text
    return text[start:end + 1]


def _repair_json_with_model(bad_json: str) -> str:
    """Best-effort JSON repair via Nova when deterministic cleanup fails."""
    repair_system = (
        "You are a strict JSON repair assistant. "
        "Fix malformed JSON and return ONLY valid JSON with no markdown, commentary, or code fences."
    )
    repair_user = (
        "Repair the JSON below. Preserve keys/values as much as possible.\n\n"
        f"{bad_json}"
    )
    return invoke_nova(repair_system, repair_user)


def _parse_evaluation_json(raw_response: str) -> tuple[Dict[str, Any], str]:
    """Parse Nova output into JSON with deterministic cleanup + one repair pass."""
    cleaned = _strip_code_fences(raw_response)
    cleaned = _extract_json_object(cleaned)
    cleaned = _fix_json_string(cleaned)

    try:
        return json.loads(cleaned), cleaned
    except json.JSONDecodeError:
        repaired = _strip_code_fences(_repair_json_with_model(cleaned))
        repaired = _extract_json_object(repaired)
        repaired = _fix_json_string(repaired)
        return json.loads(repaired), repaired


def _profile_to_schema_summary(profile: Dict[str, Any]) -> Dict[str, Any]:
    columns = []
    for col in profile.get("columns", []):
        col_type = col.get("type", "other")
        if col_type == "string":
            mapped_type = "text"
        elif col_type in {"numeric", "categorical", "boolean", "datetime", "text", "other"}:
            mapped_type = col_type
        else:
            mapped_type = "other"

        stats = {
            "range": col.get("range"),
            "mean": col.get("mean"),
            "std": col.get("std"),
            "outlier_pct": col.get("outlier_pct"),
            "distribution": col.get("distribution"),
            "class_count": col.get("class_count"),
            "avg_length": col.get("avg_length"),
        }
        stats = {k: v for k, v in stats.items() if v is not None}

        unique_count = col.get("unique_count")
        row_count = profile.get("row_count") or 0
        cardinality_ratio = None
        if isinstance(unique_count, int) and row_count:
            cardinality_ratio = round(unique_count / row_count, 3)

        columns.append({
            "name": col.get("name", "unknown"),
            "type": mapped_type,
            "missing_pct": float(col.get("null_pct", 0.0) or 0.0),
            "unique_count": unique_count if isinstance(unique_count, int) else None,
            "cardinality_ratio": cardinality_ratio,
            "potential_pii": bool(col.get("pii_hint", False)),
            "stats": stats,
        })

    return {
        "num_rows": int(profile.get("row_count", 0) or 0),
        "num_columns": int(profile.get("column_count", len(columns)) or len(columns)),
        "columns": columns,
        "duplicate_rows_pct": float(profile.get("duplicate_row_pct", 0.0) or 0.0),
        "potential_keys": [],
    }


def _normalize_evaluation_payload(parsed: Dict[str, Any], profile: Dict[str, Any]) -> Dict[str, Any]:
    # Common model wrappers we have seen in production responses.
    if isinstance(parsed.get("evaluation"), dict):
        parsed = parsed["evaluation"]
    elif isinstance(parsed.get("result"), dict):
        parsed = parsed["result"]

    normalized = dict(parsed)

    if not isinstance(normalized.get("schema_summary"), dict):
        normalized["schema_summary"] = _profile_to_schema_summary(profile)

    if not isinstance(normalized.get("quality_scores"), dict):
        normalized["quality_scores"] = {
            "completeness": 0.0,
            "uniqueness": 0.0,
            "balance": None,
            "distribution_quality": 0.0,
            "consistency": 0.0,
        }

    normalized.setdefault("critical_gaps", [])
    normalized.setdefault("confidence", 0.5)
    normalized.setdefault("reasoning_steps", ["Evaluation normalized from partial model response"])
    normalized.setdefault("adfi", 0.0)
    normalized.setdefault("recommended_focus", "completeness")

    return normalized


def _build_user_message(
    task_type: str,
    target_column: Optional[str],
    profile: Dict,
) -> str:
    lines = [
        f"Task type: {task_type}",
        f"Target column: {target_column or 'not specified'}",
        "",
        "Pre-computed Dataset Profile (treat all values as ground truth):",
        json.dumps(profile, indent=2),
    ]

    lines += [
        "",
        "Using only the values in the profile above,",
        "analyze the dataset and return the structured evaluation JSON.",
    ]

    return "\n".join(lines)


def run_evaluation(
    dataset_path: str,
    task_type: str,
    target_column: Optional[str] = None,
    event_emitter: Optional[AgentEventEmitter] = None,
) -> Dict[str, Any]:
    """
    Execute Evaluation Agent:
    1. Profile dataset
    2. Build dataset-only prompt
    3. Invoke Nova
    4. Parse + deterministically compute ADFI
    """

    # ── Agent start ───────────────────────────────────────────────────────────
    if event_emitter:
        event_emitter.emit_start(AGENT)

    # ── Profile ───────────────────────────────────────────────────────────────
    if event_emitter:
        event_emitter.emit_data(AGENT, phase="profiling", message="Profiling dataset — computing schema, distributions, null rates...")

    profile = profile_dataset(dataset_path)

    num_cols = len(profile.get("columns", []))
    num_rows = profile.get("row_count", "?")

    if event_emitter:
        event_emitter.emit_data(AGENT, phase="schema", message=f"Schema scan complete — {num_cols} columns, {num_rows} rows detected.")

    # ── Nova invocation ───────────────────────────────────────────────────────
    if event_emitter:
        event_emitter.emit_data(AGENT, phase="quality", message="Scoring completeness, uniqueness, balance, distribution, consistency...")

    from .prompt import EVALUATION_SYSTEM_PROMPT
    user_message = _build_user_message(
        task_type=task_type,
        target_column=target_column,
        profile=profile,
    )

    raw_response = invoke_nova(EVALUATION_SYSTEM_PROMPT, user_message)

    # ── Parse ─────────────────────────────────────────────────────────────────
    cleaned = ""

    try:
        parsed, cleaned = _parse_evaluation_json(raw_response)
        parsed = _normalize_evaluation_payload(parsed, profile)

        # ── Emit critical gaps as they surface ────────────────────────────────
        if event_emitter:
            for gap in parsed.get("critical_gaps", []):
                cols = ", ".join(gap.get("affected_columns", []))
                event_emitter.emit_data(
                    AGENT,
                    phase="gaps",
                    message=f"Critical gap detected: {cols} — {gap['description']} ({gap['severity'].upper()}).",
                )

        # ── Deterministic ADFI ────────────────────────────────────────────────
        scores     = parsed["quality_scores"]
        null_rates = [col["missing_pct"] for col in parsed["schema_summary"]["columns"]]
        avg_null   = sum(null_rates) / len(null_rates) if null_rates else 0.0
        weighted_completeness = max(0.0, 1.0 - (avg_null * 2))

        balance_score      = scores.get("balance")              if scores.get("balance")              is not None else 1.0
        distribution_score = scores.get("distribution_quality") if scores.get("distribution_quality") is not None else 0.5
        consistency_score  = scores.get("consistency")          if scores.get("consistency")          is not None else 0.5
        uniqueness_score   = scores.get("uniqueness")           if scores.get("uniqueness")           is not None else 0.5

        parsed["adfi"] = round(
            0.30 * weighted_completeness +
            0.25 * balance_score +
            0.20 * distribution_score +
            0.15 * consistency_score +
            0.10 * uniqueness_score,
            3,
        )
        parsed["quality_scores"]["completeness"] = round(weighted_completeness, 3)

        # ── Agent complete ────────────────────────────────────────────────────
        if event_emitter:
            event_emitter.emit_complete(AGENT, result={
                "adfi":            parsed["adfi"],
                "confidence":      parsed["confidence"],
                "quality_scores":  parsed["quality_scores"],
                "critical_gaps":   parsed["critical_gaps"],
                "reasoning_steps": parsed["reasoning_steps"],
            })

        return {
            "status":          "success",
            "evaluation":      parsed,
            "profile":         profile,
            "raw_nova_output": raw_response,
        }

    except (json.JSONDecodeError, ValueError) as e:
        if event_emitter:
            event_emitter.emit_data(AGENT, phase="error", message=f"Evaluation failed — {str(e)}")

        return {
            "status":          "error",
            "message":         str(e),
            "raw_nova_output": raw_response,
            "cleaned_text":    cleaned,
        }