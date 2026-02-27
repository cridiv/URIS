# Compliance Agent

Analyses a dataset for PII exposure, re-identification risk, and regulatory obligations. Produces a mandatory list of blocked columns that all downstream agents must respect.

## What it does

1. Reads PII-flagged columns from the Evaluation Agent's output.
2. Runs `structure_extractor` on those columns to detect embedded extractable information (titles, email domains, phone country codes, zip codes) before deciding to drop them.
3. Sends the evaluation summary and structure hints to Amazon Bedrock Nova Lite.
4. Parses Nova's JSON response and **overrides** the `privacy_risk_score` with a deterministic calculation — Nova's value is discarded.
5. Returns a compliance report with blocked columns, recommended actions, and regulatory exposure.

---

## Functions

### `_compute_privacy_risk_score(pii_findings, re_id_risk) → float`

Computes a deterministic privacy risk score, ignoring whatever score Nova returned.

- Adds **0.30** if any direct identifier is present (capped at one addition).
- Adds **0.15** per quasi-identifier found.
- Adds **0.20** if the re-identification risk score exceeds 0.5.
- Clamps the result to the range `[0.0, 1.0]`.

---

### `run_compliance(dataset_path, evaluation) → dict`

Main entry point called by the orchestrator.

1. Collects the PII-flagged column names from the evaluation's `schema_summary`.
2. Calls `extract_structure_hints()` on those columns.
3. Builds a user message combining the full evaluation JSON and the structure hints.
4. Invokes Nova and strips markdown code fences from the response.
5. Validates required keys in Nova's output (`pii_findings`, `regulatory_exposure`, `re_identification_risk`, `privacy_risk_score`, `blocked_columns`).
6. Replaces `privacy_risk_score` with the deterministic value from `_compute_privacy_risk_score()`.
7. Returns `{"status": "success", "compliance": <parsed>}` or `{"status": "error", ...}`.

---

## Key output fields

| Field | Description |
|-------|-------------|
| `pii_findings` | List of columns with PII type, confidence, and severity. |
| `regulatory_exposure` | Applicable regulations (GDPR, CCPA, HIPAA) and their exposure level. |
| `re_identification_risk` | Score and reasoning for re-identification risk. |
| `privacy_risk_score` | Deterministic float in `[0, 1]`. |
| `blocked_columns` | Columns that **must not** be synthesized — enforced by all downstream agents. |
| `recommended_actions` | Per-column actions: `drop`, `extract_then_drop`, `hash`, `generalize`, `keep`. |
