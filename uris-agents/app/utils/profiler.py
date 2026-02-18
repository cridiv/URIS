import pandas as pd
import numpy as np
import json
import chardet
from pathlib import Path

NUMERIC_SAMPLE_SIZE = 1000

def detect_encoding(filepath: str) -> str:
    """Detect file encoding using chardet"""
    with open(filepath, "rb") as f:
        raw = f.read(100000)
    result = chardet.detect(raw)
    return result.get("encoding") or "utf-8"

def _clean_dataframe(df: pd.DataFrame) -> pd.DataFrame:
    """Clean and normalize the dataframe"""
    # Strip whitespace from column names
    df.columns = df.columns.str.strip()

    # Strip whitespace from string values
    str_cols = df.select_dtypes(include="object").columns
    for col in str_cols:
        df[col] = df[col].str.strip()

    # Drop completely empty rows and columns
    df = df.dropna(how="all")
    df = df.loc[:, df.notna().any()]

    # Reset index
    df = df.reset_index(drop=True)

    return df

def profile_dataset(filepath: str) -> dict:
    path = Path(filepath)
    suffix = path.suffix.lower()

    if suffix == ".json":
        df = pd.read_json(filepath)
    elif suffix == ".csv":
        encoding = detect_encoding(filepath)

        # Try with auto-detection first
        df = None
        try:
            temp_df = pd.read_csv(
                filepath,
                encoding=encoding,
                sep=None,
                engine="python",
                on_bad_lines="skip"
            )
            if len(temp_df.columns) > 1:
                df = temp_df
        except Exception:
            pass

        # Fall back: try every delimiter, keep best result
        if df is None:
            best_df = None
            best_col_count = 0

            for enc in [encoding, "utf-8", "latin-1", "cp1252"]:
                for sep in [",", ";", "\t", "|"]:
                    try:
                        temp_df = pd.read_csv(
                            filepath,
                            encoding=enc,
                            sep=sep,
                            on_bad_lines="skip"
                        )
                        if not temp_df.empty and len(temp_df.columns) > best_col_count:
                            best_df = temp_df
                            best_col_count = len(temp_df.columns)
                    except Exception:
                        continue

            if best_df is None or best_df.empty:
                raise ValueError("Could not parse CSV file. Please ensure it's a valid CSV format.")
            
            df = best_df

        # Clean the dataframe
        df = _clean_dataframe(df)
    else:
        raise ValueError(f"Unsupported file type: {suffix}")

    # Sample large datasets for speed
    if len(df) > 50000:
        df_sample = df.sample(NUMERIC_SAMPLE_SIZE, random_state=42)
    else:
        df_sample = df

    columns = []
    for col in df.columns:
        col_info = _profile_column(df, df_sample, col)
        columns.append(col_info)

    return {
        "row_count": len(df),
        "column_count": len(df.columns),
        "duplicate_row_pct": round(df.duplicated().mean(), 3),
        "columns": columns
    }


def _profile_column(df: pd.DataFrame, df_sample: pd.DataFrame, col: str) -> dict:
    series = df[col]
    null_pct = round(series.isnull().mean(), 3)
    
    # Determine column type
    if pd.api.types.is_numeric_dtype(series):
        col_type = "numeric"
    elif series.nunique() <= 20:
        col_type = "categorical"
    else:
        col_type = "string"

    base = {
        "name": col,
        "type": col_type,
        "null_pct": null_pct,
        "unique_count": int(series.nunique())
    }

    if col_type == "numeric":
        base["range"] = [
            _safe_scalar(series.min()),
            _safe_scalar(series.max())
        ]
        base["mean"] = _safe_scalar(series.mean())
        base["std"] = _safe_scalar(series.std())
        base["outlier_pct"] = _estimate_outlier_pct(series)

    elif col_type == "categorical":
        dist = series.value_counts(normalize=True).round(3).to_dict()
        base["distribution"] = {str(k): float(v) for k, v in dist.items()}
        base["class_count"] = int(series.nunique())

    elif col_type == "string":
        base["sample_values"] = series.dropna().head(3).tolist()
        base["avg_length"] = round(series.dropna().astype(str).str.len().mean(), 1)
        base["pii_hint"] = _check_pii_hint(col, series)

    return base


def _estimate_outlier_pct(series: pd.Series) -> float:
    """IQR-based outlier estimate"""
    clean = series.dropna()
    if len(clean) < 10:
        return 0.0
    q1 = clean.quantile(0.25)
    q3 = clean.quantile(0.75)
    iqr = q3 - q1
    outliers = ((clean < q1 - 1.5 * iqr) | (clean > q3 + 1.5 * iqr)).sum()
    return round(float(outliers) / len(clean), 3)


def _check_pii_hint(col_name: str, series: pd.Series) -> bool:
    """Basic heuristic — compliance agent does the real scan"""
    pii_keywords = ["email", "phone", "ssn", "name", "address", "ip", "passport", "dob", "birth"]
    col_lower = col_name.lower()
    return any(keyword in col_lower for keyword in pii_keywords)


def _safe_scalar(val):
    """Convert numpy types to native Python for JSON serialization"""
    if isinstance(val, (np.integer,)):
        return int(val)
    if isinstance(val, (np.floating,)):
        return float(val)
    return val