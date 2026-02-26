# Compliance Agent

Assesses privacy risk, PII exposure, and regulatory compliance for datasets.

## Functionality

- Classifies PII into direct identifiers, quasi-identifiers, and sensitive attributes
- Extracts structure hints from PII columns (emails, phone numbers, titles, zip codes)
- Computes deterministic privacy risk scores
- Maps findings to regulatory frameworks (GDPR, CCPA, HIPAA)
- Flags columns that must be blocked from synthesis

## Key Output

- PII findings with confidence and severity levels
- Re-identification risk assessment
- Recommended actions (drop, extract_then_drop, hash, generalize, keep)
- Blocked columns list enforced in downstream tasks
- Regulatory exposure scores

## Integration

Works with `structure_extractor` utility to detect extractable structured information before recommending column removal, preserving valuable signals.
