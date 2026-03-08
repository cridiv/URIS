import pandas as pd
import chardet
from pathlib import Path

def detect_encoding(filepath: str) -> str:
    with open(filepath, "rb") as f:
        raw = f.read(100000)
    result = chardet.detect(raw)
    return result.get("encoding") or "utf-8"

def format_file(filepath: str) -> pd.DataFrame:
    path = Path(filepath)
    suffix = path.suffix.lower()

    if suffix == ".json":
        return pd.read_json(filepath)

    if suffix != ".csv":
        raise ValueError(f"Unsupported file type: {suffix}")

    encoding = detect_encoding(filepath)

    # Try with comma first (most common for URIS datasets)
    try:
        df = pd.read_csv(
            filepath,
            encoding=encoding,
            sep=",",
            on_bad_lines="skip"
        )
        if not df.empty and len(df.columns) > 1:
            return _clean_dataframe(df)
    except Exception:
        pass

    # Try with auto-detection if comma didn't work
    try:
        df = pd.read_csv(
            filepath,
            encoding=encoding,
            sep=None,
            engine="python",
            on_bad_lines="skip"
        )
        if not df.empty and len(df.columns) > 1:
            return _clean_dataframe(df)
    except Exception:
        pass

    # Fall back: try every delimiter, keep best result
    best_df = None
    best_col_count = 0

    for enc in [encoding, "utf-8", "latin-1", "cp1252"]:
        for sep in [",", ";", "\t", "|", " "]:
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
        raise ValueError("Could not parse file. Please upload a valid CSV or JSON.")

    return _clean_dataframe(best_df)


def _clean_dataframe(df: pd.DataFrame) -> pd.DataFrame:
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