import re
import pandas as pd

TITLE_PATTERN = re.compile(
    r'\b(Mr|Mrs|Miss|Ms|Dr|Prof|Rev|Col|Major|Capt|Sir|Lady|Master)\b\.?',
    re.IGNORECASE
)
EMAIL_PATTERN = re.compile(r'[\w\.-]+@[\w\.-]+\.\w+')
PHONE_PATTERN = re.compile(r'(\+?\d[\d\s\-().]{7,}\d)')
ZIPCODE_PATTERN = re.compile(r'\b\d{5}(?:-\d{4})?\b')

# Each pattern paired with what's worth extracting from it
PATTERNS = [
    {
        "key": "title_prefix",
        "pattern": TITLE_PATTERN,
        "suggested_action": "Extract title into new column `{col}_title` before dropping `{col}`"
    },
    {
        "key": "email_domain",
        "pattern": EMAIL_PATTERN,
        "suggested_action": "Extract domain into new column `{col}_domain` before dropping `{col}`"
    },
    {
        "key": "phone_country_code",
        "pattern": PHONE_PATTERN,
        "suggested_action": "Extract country code into new column `{col}_country_code` before dropping `{col}`"
    },
    {
        "key": "zip_code",
        "pattern": ZIPCODE_PATTERN,
        "suggested_action": "Generalize `{col}` into regional buckets before dropping — zip codes carry geographic signal"
    },
]

MATCH_THRESHOLD = 0.30  # 30% of sampled rows must match to consider it structural


def extract_structure_hints(dataset_path: str, pii_columns: list) -> dict:
    """
    For each PII-flagged column, detect whether structured extractable
    information is embedded before the compliance agent recommends dropping it.

    Returns a dict keyed by column name with a list of findings.
    Passed directly to the compliance agent as ground truth.
    """
    try:
        df = pd.read_csv(dataset_path)
    except Exception as e:
        return {"error": f"Could not load dataset for structure extraction: {str(e)}"}

    hints = {}

    for col in pii_columns:
        if col not in df.columns:
            continue

        series = df[col].dropna().astype(str)

        # Use a sample for speed on large datasets
        sample = series.head(100) if len(series) > 100 else series

        col_findings = []

        for p in PATTERNS:
            match_rate = sample.str.contains(p["pattern"], regex=True).mean()

            if match_rate >= MATCH_THRESHOLD:
                col_findings.append({
                    "extractable": p["key"],
                    "match_rate": round(float(match_rate), 2),
                    "suggested_action": p["suggested_action"].format(col=col)
                })

        if col_findings:
            hints[col] = {
                "has_extractable_structure": True,
                "findings": col_findings
            }
        else:
            hints[col] = {
                "has_extractable_structure": False,
                "findings": [{
                    "extractable": None,
                    "suggested_action": f"Drop `{col}` safely — no structured information detected"
                }]
            }

    return hints