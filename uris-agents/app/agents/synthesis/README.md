# Synthesis Agent

Generates synthetic data and performs data augmentation while respecting compliance constraints.

## Status

**Not yet implemented.**

## Planned Functionality

- Generate synthetic samples for underrepresented classes
- Impute missing values using context-aware methods
- Rebalance datasets to address class imbalance
- Respect blocked columns from compliance agent
- Preserve statistical properties of original data

## Integration

Will receive filtered task list from orchestrator with blocked columns removed, ensuring no PII synthesis occurs.
