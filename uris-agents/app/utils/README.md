# Utils

Shared utility modules used across all agents. Each file has a single responsibility and is called directly by agents — they contain no LLM logic.

---

## `bedrock.py` — AWS Bedrock client

Thin wrapper around `boto3` for invoking Amazon Nova Lite.

### `get_bedrock_client() → boto3.client`
Creates and returns a `bedrock-runtime` boto3 client using credentials from `.env` (`AWS_REGION`, `AWS_ACCESS_KEY`, `AWS_SECRET_ACCESS_KEY`).

### `invoke_nova(system_prompt, user_message, max_tokens) → str`
Sends a single-turn conversation to `amazon.nova-lite-v1:0` and returns the plain text response. Temperature is fixed at 0.3.

---

## `profiler.py` — Dataset profiling

Generates column-level statistics from a CSV or JSON file. Used by the Evaluation Agent as ground truth — no LLM is involved.

### `profile_dataset(filepath) → dict`
Main entry point. Reads the file, cleans it, then calls `_profile_column()` for every column. Returns `row_count`, `column_count`, `duplicate_row_pct`, and a `columns` list.

- Detects file encoding with `chardet` before reading.
- For CSVs, auto-detects the delimiter; falls back to trying `,`, `;`, `\t`, and `|` with multiple encodings.
- Samples up to 50 000 rows for speed on large files.

### `_profile_column(df, df_sample, col) → dict`
Profiles a single column. Returns type (`numeric`, `categorical`, `string`), null rate, and unique count. Numeric columns get range, mean, std, and outlier percentage. Categorical columns get a value distribution dict. String columns get sample values, average length, and a PII hint flag.

### `detect_encoding(filepath) → str`
Reads the first 100 KB of a file with `chardet` and returns the detected encoding, defaulting to `utf-8`.

### `_clean_dataframe(df) → DataFrame`
Strips whitespace from column names and string values, drops fully-empty rows and columns, and resets the index.

### `_estimate_outlier_pct(series) → float`
IQR-based outlier estimate: counts values outside `[Q1 − 1.5×IQR, Q3 + 1.5×IQR]`.

### `_check_pii_hint(col_name, series) → bool`
Keyword heuristic that returns `True` if the column name contains common PII terms (`email`, `phone`, `ssn`, `name`, `address`, etc.). Used only as a hint — the Compliance Agent does the real scan.

### `_safe_scalar(val) → int | float | other`
Converts numpy integer and float types to native Python scalars for JSON serialization.

---

## `structure_extractor.py` — PII column structure analysis

Scans PII-flagged columns for embedded extractable information before the Compliance Agent decides to drop them.

### `extract_structure_hints(dataset_path, pii_columns) → dict`
Loads the dataset and, for each PII column, checks up to 100 sampled values against four regex patterns:

| Pattern | Extracts |
|---------|---------|
| `title_prefix` | Mr, Mrs, Dr, Prof, etc. |
| `email_domain` | Domain after `@` |
| `phone_country_code` | `+XX` prefix |
| `zip_code` | 5-digit US zip codes |

A pattern is reported if it matches ≥ 30% of sampled rows. Returns a dict keyed by column name with `has_extractable_structure` and a list of findings with match rates and suggested actions. Passed directly to the Compliance Agent as ground truth.

---

## `formatter.py` — File loading and normalisation

Reads a CSV or JSON file into a clean pandas DataFrame. Used by upload routes before passing data to agents.

### `format_file(filepath) → DataFrame`
Reads CSV or JSON, auto-detects encoding and delimiter, and returns a cleaned DataFrame. Raises `ValueError` for unsupported file types or unparseable files.

### `_clean_dataframe(df) → DataFrame`
Strips whitespace from column names and string values, drops fully-empty rows and columns, and resets the index. Shared logic mirrored in `profiler.py`.

### `detect_encoding(filepath) → str`
Same chardet-based encoding detection as in `profiler.py`.

---

## `synthesizer.py` — SDV GaussianCopula synthesis

Core data generation logic. Called by the Synthesis Agent.

### `get_identifier_columns(df) → list[str]`
Returns any column where every value is unique (`nunique() == len(df)`). These are auto-detected identifiers (e.g. `PassengerId`) and are never synthesized.

### `apply_extractions(df, extractions) → DataFrame`
Executes extract-then-drop operations from the Compliance Agent's recommended actions. Supports `title_prefix`, `email_domain`, and `phone_country_code` extractions. Drops the source column after extraction.

### `impute_missing_values(df, protected_columns) → (DataFrame, dict)`
Simple pre-synthesis imputation:
- Numeric columns → median fill.
- Categorical columns → mode fill, or `"Unknown"` if no mode.
- Columns with > 70% missing values → dropped entirely.
- Protected columns are never touched.
Returns the imputed DataFrame and a per-column imputation report.

### `run_sdv_gaussian_copula(df, protected_columns, num_rows_to_generate) → (DataFrame, dict)`
Fits an SDV `GaussianCopulaSynthesizer` on all non-protected columns, generates `num_rows_to_generate` synthetic rows, and concatenates them with the original. Protected columns are attached to synthetic rows as `NaN`. Returns the combined DataFrame and a synthesis report.

### `run_synthesis(dataset_path, strategy_decision) → dict`
Main entry point called by the Synthesis Agent. Reads the CSV, validates that blocked and extraction columns actually exist in the file, then runs the full pre-processing pipeline:

1. Drop blocked columns.
2. Auto-detect and drop identifier columns.
3. Apply compliance-recommended extractions.
4. Impute missing values.
5. Run SDV GaussianCopula synthesis.

Returns `{"status": "success", "dataframe": ..., "synthesis_report": ..., ...}` or `{"status": "error", ...}` on exception.

---

## `privacy_checker.py` — Privacy validation

Checks whether synthetic rows are too close to real rows using exact matching and nearest-neighbour distance metrics.

### `compute_exact_matches(real_df, synth_df, small_dataset) → dict`
Counts rows in the synthetic set that exactly match a row in the real set, evaluated on continuous columns only (those with > 20 unique values and no dominant value ≥ 10%).

- In `small_dataset` mode the check is **skipped entirely** — too few features make exact matching meaningless.
- Rounds values to 2 decimal places before comparing.
- Allows up to 10% of synthetic rows to be exact matches (`max_allowed = max(1, int(len(synth) × 0.10))`).

### `compute_nearest_neighbor_metrics(real_df, synth_df, n_neighbors, categorical_features, small_dataset) → dict`
Computes Gower distance from every synthetic row to its nearest real neighbour. Reports median DCR (distance to closest record) and median NNDR (nearest-neighbour distance ratio).

- Fills NaN values before computing Gower distance to prevent crashes.
- In `small_dataset` mode, thresholds are set to 0 so this check always passes.
- Normal thresholds: DCR ≥ 0.05, NNDR ≥ 0.30.
- Wraps `gower_matrix()` in a try/except and returns a graceful failure dict if it errors.

### `run_privacy_check(real_df, synth_df, blocked_columns, categorical_features, small_dataset) → dict`
Main entry point called by the Synthesis Agent.

1. Identifies and excludes high-cardinality string columns (`dtype == object` and `nunique > 50`, e.g. `Ticket`, `Cabin`, free-text names).
2. Builds the shared column list from the intersection of real and synthetic columns, minus excluded columns.
3. Calls `compute_exact_matches()` and `compute_nearest_neighbor_metrics()` with the `small_dataset` flag.
4. Returns `overall_pass = True` only if both checks pass.

---

## `correlation_checker.py` — Correlation drift validation

Checks whether pairwise feature correlations shifted significantly between the real and synthetic datasets.

### `compute_correlation_matrix(df, numeric_columns) → DataFrame`
Computes a Pearson correlation matrix for the specified (or all) numeric columns. Returns an empty DataFrame if no numeric columns exist.

### `calculate_correlation_drift(real_corr, synth_corr, max_allowed_drift_per_pair, max_allowed_frobenius, max_allowed_column_drift) → dict`
Aligns the two correlation matrices to common columns and computes three drift metrics:

| Metric | Default threshold |
|--------|-----------------|
| `max_pair_diff` — largest absolute difference in any single correlation pair | ≤ 0.20 |
| `frobenius_norm` — overall matrix distance `‖real − synth‖_F` | ≤ 0.40 |
| `mean_column_drift` — average of each column's maximum drift | ≤ 0.20 |

Returns a detailed report with per-column drift values and pass/fail for each metric.

### `run_correlation_check(real_df, synth_df, blocked_columns, drift_thresholds) → dict`
Main entry point called by the Synthesis Agent.

1. Selects numeric columns not in `blocked_columns`.
2. Computes correlation matrices for real and synthetic data.
3. Calls `calculate_correlation_drift()` with the default thresholds (overridable via `drift_thresholds`).
4. Returns `{"status": "pass" | "fail" | "skip", "drift_metrics": ..., "recommendation": "accept" | "retry", ...}`.

---

## `validator.py` — Pre/post synthesis statistical checks

Computes all the statistical metrics that the Validation Agent uses to form its verdict. No LLM is involved.

### `profile_augmented(df) → dict`
Lightweight re-profile of the augmented DataFrame (operates on a DataFrame directly, unlike `profiler.py` which reads from a file path). Returns the same structure: row count, column count, duplicate rate, and per-column stats.

### `compare_balance(original_df, augmented_df, target_column) → dict`
Compares class balance before and after synthesis. Balance score = `minority_count / majority_count`. Passes if balance improved or regressed by less than 0.02.

### `run_ks_tests(original_df, augmented_df, blocked_columns) → dict`
Kolmogorov-Smirnov test for each non-blocked numeric column. A column passes if `p-value ≥ 0.05` (distributions are not significantly different). Skips columns with fewer than 5 non-null values.

### `run_chi_squared_tests(original_df, augmented_df, blocked_columns) → dict`
Chi-squared test for each non-blocked categorical column (≤ 20 unique values). Scales the augmented counts to the same total as the original before testing. A column passes if `p-value ≥ 0.05`.

### `compare_completeness(original_df, augmented_df) → dict`
Compares null rates per column before and after synthesis. Passes only if no column has a higher null rate after synthesis than before — synthesis must never introduce new missing values.

### `run_validation_checks(original_df, augmented_df, target_column, blocked_columns, adfi_before) → dict`
Main entry point called by the Validation Agent. Runs all four checks above, aggregates `checks_passed` and `checks_failed` lists, and returns a single structured metrics dict including `overall_passed`, row counts, and the augmented dataset's profile.
