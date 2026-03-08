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
    Expects strategy_decision with keys like:
      - columns_to_exclude / blocked_columns
      - columns_to_extract_first
      - augmentation_budget
      - target_column (optional — not used anymore with SDV-only)
    """
    # Read CSV with explicit comma delimiter (most common for URIS datasets)
    try:
        df = pd.read_csv(dataset_path, sep=",")
    except Exception:
        # Fallback to auto-detection if comma fails
        df = pd.read_csv(dataset_path)

    # Extract fields from Nova's decision
    blocked_columns   = strategy_decision.get("columns_to_exclude", [])
    extractions       = strategy_decision.get("columns_to_extract_first", [])
    augmentation_budget = strategy_decision.get("augmentation_budget", 200)

    # Early validation: filter out non-existent columns
    blocked_columns = [c for c in blocked_columns if c in df.columns]
    strategy_decision["columns_to_exclude"] = blocked_columns
    
    # Validate extraction columns
    valid_extractions = [
        e for e in extractions 
        if e.get("from") in df.columns
    ]
    if len(valid_extractions) < len(extractions):
        extractions = valid_extractions

    # ── Pre-processing ────────────────────────────────────────

    # 0. Drop blocked columns early
    df = df.drop(columns=[c for c in blocked_columns if c in df.columns], errors='ignore')
    # 0.5. Auto-detect and drop identifier columns
    identifier_cols = get_identifier_columns(df)
    if identifier_cols:
        df = df.drop(columns=identifier_cols, errors='ignore')
    # 1. Extractions (from compliance recommendations)
    if extractions:
        df = apply_extractions(df, extractions)

    # 3. Imputation
    df_imputed, imputation_report = impute_missing_values(
        df, protected_columns=[]
    )

    # ── Synthesis ─────────────────────────────────────────────

    try:
        result_df, synthesis_report = run_sdv_gaussian_copula(
            df=df_imputed,
            protected_columns=[],
            num_rows_to_generate=augmentation_budget
        )

        return {
            "status": "success",
            "dataframe": result_df,
            "synthesis_report": synthesis_report,
            "imputation_report": imputation_report,
            "extractions_applied": extractions,
            "strategy_used": "SDV_GaussianCopula",
            "identifier_cols_removed": identifier_cols,
        }

    except Exception as e:
        # Return original (post-extraction/imputation) on failure
        return {
            "status": "error",
            "dataframe": df_imputed,
            "synthesis_report": {},
            "imputation_report": imputation_report,
            "extractions_applied": extractions,
            "strategy_used": None,
            "error": str(e)
        }