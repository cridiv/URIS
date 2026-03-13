import pandas as pd
import numpy as np
from pathlib import Path
from typing import Dict, List, Optional, Tuple
import re
from sdv.single_table import GaussianCopulaSynthesizer
from sdv.metadata import Metadata
import warnings

# Suppress SDV warnings
warnings.filterwarnings('ignore', category=FutureWarning, module='sdv')
warnings.filterwarnings('ignore', category=UserWarning, module='sdv')


# ─────────────────────────────────────────
# EXTRACTION HELPERS
# ─────────────────────────────────────────

TITLE_PATTERN = re.compile(
    r'\b(Mr|Mrs|Miss|Ms|Dr|Prof|Rev|Col|Major|Capt|Sir|Lady|Master)\b\.?',
    re.IGNORECASE
)

def get_identifier_columns(df: pd.DataFrame) -> List[str]:
    """
    Detect columns that are unique identifiers — every value is unique.
    These should never be synthesized.
    """
    identifier_cols = []
    for col in df.columns:
        if df[col].nunique() == len(df):
            identifier_cols.append(col)
    return identifier_cols


def apply_tokenisation(
    df: pd.DataFrame,
    columns_to_mask: List[str],
) -> Tuple[pd.DataFrame, Dict[str, Dict]]:
    """
    Pseudonymise sensitive columns via stable sequential tokenisation.

    Each unique real value is replaced with a short opaque token that is
    consistent within a single dataset run:
        "alice@corp.com" → "email_1"
        "bob@corp.com"   → "email_2"
        (same value always gets the same token within this call)

    Original values are never recoverable from the output.
    Returns the modified DataFrame and a token audit map
    {col: {"prefix": str, "unique_count": int}}.
    """
    df = df.copy()
    token_map: Dict[str, Dict] = {}

    for col in columns_to_mask:
        if col not in df.columns:
            continue

        # Short, URL-safe prefix derived from the column name
        prefix = re.sub(r'[^a-z0-9]', '', col.lower())[:6] or "tok"

        # Build order-of-first-appearance mapping so the same value always
        # gets the same token number within this dataset.
        seen_order: List[str] = []
        seen_set: set = set()
        for raw_val in df[col].astype(str):
            if raw_val != "nan" and raw_val not in seen_set:
                seen_set.add(raw_val)
                seen_order.append(raw_val)

        value_to_token = {val: f"{prefix}_{i + 1}" for i, val in enumerate(seen_order)}

        df[col] = df[col].apply(
            lambda x: value_to_token.get(str(x), f"{prefix}_unknown")
            if pd.notna(x)
            else f"{prefix}_null"
        )

        token_map[col] = {"prefix": prefix, "unique_count": len(value_to_token)}

    return df, token_map

def apply_extractions(df: pd.DataFrame, extractions: List[Dict]) -> pd.DataFrame:
    """
    Execute extract-then-drop operations recommended by Compliance Agent.
    Example action: {"from": "Name", "extract": "title_prefix", "into": "Name_title"}
    """
    df = df.copy()

    for action in extractions:
        source_col = action.get("from")
        extract_type = action.get("extract")
        target_col  = action.get("into")

        if not all([source_col, target_col]) or source_col not in df.columns:
            continue

        if extract_type == "title_prefix":
            df[target_col] = df[source_col].str.extract(TITLE_PATTERN, expand=False)
            df[target_col] = df[target_col].fillna("Unknown")

        elif extract_type == "email_domain":
            df[target_col] = df[source_col].str.extract(r'@([\w\.-]+)', expand=False)
            df[target_col] = df[target_col].fillna("Unknown")

        elif extract_type == "phone_country_code":
            df[target_col] = df[source_col].str.extract(r'(\+\d{1,3})', expand=False)
            df[target_col] = df[target_col].fillna("Unknown")

        # Drop original column after extraction
        if source_col in df.columns:
            df = df.drop(columns=[source_col], errors='ignore')

    return df


# ─────────────────────────────────────────
# IMPUTATION
# ─────────────────────────────────────────

def impute_missing_values(df: pd.DataFrame, protected_columns: List[str]) -> Tuple[pd.DataFrame, Dict]:
    """
    Simple imputation before synthesis:
      - Numeric → median
      - Categorical → mode or 'Unknown'
      - >70% missing → drop column
      - Never impute protected/blocked columns
    """
    df = df.copy()
    report = {}

    for col in df.columns:
        if col in protected_columns:
            continue

        null_rate = df[col].isnull().mean()
        if null_rate == 0:
            continue

        if null_rate > 0.70:
            df = df.drop(columns=[col])
            report[col] = {
                "action": "dropped",
                "reason": f"{null_rate:.1%} missing — too sparse"
            }
            continue

        if pd.api.types.is_numeric_dtype(df[col]):
            val = df[col].median()
            df[col] = df[col].fillna(val)
            report[col] = {
                "action": "median_imputed",
                "value": float(val) if not pd.isna(val) else None,
                "null_rate_before": float(null_rate)
            }
        else:
            mode_series = df[col].mode()
            val = mode_series[0] if not mode_series.empty else "Unknown"
            df[col] = df[col].fillna(val)
            report[col] = {
                "action": "mode_or_unknown_imputed",
                "value": str(val),
                "null_rate_before": float(null_rate)
            }

    return df, report


# ─────────────────────────────────────────
# SDV SYNTHESIS CORE
# ─────────────────────────────────────────

def run_sdv_gaussian_copula(
    df: pd.DataFrame,
    protected_columns: List[str],
    num_rows_to_generate: int
) -> Tuple[pd.DataFrame, Dict]:
    """
    Fit SDV GaussianCopula on non-protected columns and generate synthetic rows.
    Protected columns are re-attached with NaN in synthetic part.
    """
    df_for_fit = df.drop(columns=protected_columns, errors="ignore").copy()

    rows_before = len(df)

    # Auto-detect metadata using new Metadata class
    metadata = Metadata.detect_from_dataframe(df_for_fit, table_name='table')

    synthesizer = GaussianCopulaSynthesizer(metadata)
    synthesizer.fit(df_for_fit)

    synthetic = synthesizer.sample(num_rows=num_rows_to_generate)

    # Re-attach protected columns as NaN for synthetic rows
    for col in protected_columns:
        if col in df.columns:
            synthetic[col] = np.nan

    final_df = pd.concat([df, synthetic], ignore_index=True)

    report = {
        "strategy": "SDV_GaussianCopula",
        "rows_before": rows_before,
        "rows_generated": len(synthetic),
        "rows_after": len(final_df),
        "metadata_detected_columns": len(df_for_fit.columns),
    }

    return final_df, report


# ─────────────────────────────────────────
# MAIN ENTRY POINT
# ─────────────────────────────────────────

def run_synthesis(
    dataset_path: str,
    strategy_decision: Dict
) -> Dict:
    """
    Called by Synthesis Agent.
    Expects strategy_decision with keys:
      - columns_to_exclude      — hard-blocked columns (drop before SDV)
      - columns_to_mask         — MASK-policy columns (tokenise, set aside, re-attach)
      - columns_to_extract_first — extract-then-drop compliance actions
      - augmentation_budget     — rows to generate
    """
    # Read CSV with explicit comma delimiter (most common for URIS datasets)
    try:
        df = pd.read_csv(dataset_path, sep=",")
    except Exception:
        df = pd.read_csv(dataset_path)

    blocked_columns     = strategy_decision.get("columns_to_exclude", [])
    masked_columns      = strategy_decision.get("columns_to_mask", [])
    extractions         = strategy_decision.get("columns_to_extract_first", [])
    augmentation_budget = strategy_decision.get("augmentation_budget", 200)

    # Filter to columns that actually exist
    blocked_columns = [c for c in blocked_columns if c in df.columns]
    masked_columns  = [c for c in masked_columns  if c in df.columns]
    strategy_decision["columns_to_exclude"] = blocked_columns

    valid_extractions = [e for e in extractions if e.get("from") in df.columns]
    if len(valid_extractions) < len(extractions):
        extractions = valid_extractions

    # ── Step 0: Tokenise MASK columns and set them aside ─────────────────────
    # Real values are replaced with stable tokens (email_1, email_2 …).
    # The tokenised originals are re-attached after SDV so they appear in
    # the final output but never expose PII to the synthesizer.
    masked_originals: Dict[str, pd.Series] = {}
    token_map: Dict[str, Dict] = {}

    if masked_columns:
        df, token_map = apply_tokenisation(df, masked_columns)
        for col in masked_columns:
            if col in df.columns:
                masked_originals[col] = df[col].copy()
        # Remove from df so SDV never sees them
        df = df.drop(columns=list(masked_originals.keys()), errors="ignore")

    # ── Step 0a: Drop hard-blocked columns ───────────────────────────────────
    df = df.drop(columns=[c for c in blocked_columns if c in df.columns], errors="ignore")

    # ── Step 0b: Auto-detect identifier columns ───────────────────────────────
    # Masked columns were already removed; identifier detection runs on what's left.
    identifier_cols = get_identifier_columns(df)
    if identifier_cols:
        df = df.drop(columns=identifier_cols, errors="ignore")

    # ── Step 1: Extract-then-drop (compliance) ────────────────────────────────
    if extractions:
        df = apply_extractions(df, extractions)

    # ── Step 2: Imputation ────────────────────────────────────────────────────
    df_imputed, imputation_report = impute_missing_values(df, protected_columns=[])

    # ── Step 3: SDV synthesis ─────────────────────────────────────────────────
    try:
        result_df, synthesis_report = run_sdv_gaussian_copula(
            df=df_imputed,
            protected_columns=[],
            num_rows_to_generate=augmentation_budget,
        )

        # ── Step 4: Re-attach masked columns with continuation tokens ─────────
        # Original rows keep their tokens; synthetic rows receive new sequential
        # continuation tokens (email_1001, email_1002 …) so re-identification
        # is impossible while the column structure is preserved.
        if masked_originals:
            n_original = synthesis_report["rows_before"]
            n_synthetic = synthesis_report["rows_generated"]
            for col, original_series in masked_originals.items():
                tok_info = token_map.get(col, {})
                prefix   = tok_info.get("prefix", re.sub(r'[^a-z0-9]', '', col.lower())[:6] or "tok")
                max_n    = tok_info.get("unique_count", len(original_series))
                continuation = [f"{prefix}_{max_n + i + 1}" for i in range(n_synthetic)]
                full_col = pd.concat(
                    [original_series.reset_index(drop=True), pd.Series(continuation)],
                    ignore_index=True,
                )
                result_df[col] = full_col

        return {
            "status": "success",
            "dataframe": result_df,
            "synthesis_report": synthesis_report,
            "imputation_report": imputation_report,
            "extractions_applied": extractions,
            "strategy_used": "SDV_GaussianCopula",
            "identifier_cols_removed": identifier_cols,
            "masked_columns_tokenised": list(masked_originals.keys()),
            "token_map": token_map,
        }

    except Exception as e:
        return {
            "status": "error",
            "dataframe": df_imputed,
            "synthesis_report": {},
            "imputation_report": imputation_report,
            "extractions_applied": extractions,
            "strategy_used": None,
            "error": str(e),
            "masked_columns_tokenised": list(masked_originals.keys()),
        }