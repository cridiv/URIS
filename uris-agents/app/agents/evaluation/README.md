# Evaluation Agent

Assesses dataset quality for AI/ML readiness by analyzing schema, distributions, missing values, class balance, and outliers.

## Functionality

- Profiles dataset using deterministic statistical analysis
- Invokes Amazon Bedrock Nova 2 Lite for quality assessment
- Returns structured JSON with data quality metrics and PII flags
- Serves as ground truth for downstream agents

## Key Output

- Schema summary with column types and PII detection
- Distribution analysis and outlier identification
- Class balance metrics for classification tasks
- Missing value patterns and completeness scores
