# utils/validator.py

import pandas as pd
import numpy as np
from scipy import stats
from typing import Dict, Any, Optional


# ─────────────────────────────────────────
# PROFILE AUGMENTED DATASET
# ─────────────────────────────────────────

def profile_augmented(df: pd.DataFrame) -> dict:
    """
    Lightweight re-profile of the augmented dataset.
    Computes the same metrics as the main profiler but
    operates on a dataframe directly rather than a file path.
    """
    columns = []
    for col in df.columns:
        null_pct = round(df[col].isnull().mean(), 3)

        if pd.api.types.is_numeric_dtype(df[col]):
            columns.append({
                "name": col,
                "type": "numeric",
                "null_pct": null_pct,
                "unique_count": int(df[col].nunique()),
                "mean": round(float(df[col].mean()), 4),
                "std": round(float(df[col].std()), 4),
                "min": round(float(df[col].min()), 4),
                "max": round(float(df[col].max()), 4),
            })
        elif df[col].nunique() <= 20:
            dist = df[col].value_counts(normalize=True).round(3).to_dict()
            columns.append({
                "name": col,
                "type": "categorical",
                "null_pct": null_pct,
                "unique_count": int(df[col].nunique()),
                "distribution": {str(k): float(v) for k, v in dist.items()},
            })
        else:
            columns.append({
                "name": col,
                "type": "string",
                "null_pct": null_pct,
                "unique_count": int(df[col].nunique()),
            })

    return {
        "row_count": len(df),
        "column_count": len(df.columns),
        "duplicate_row_pct": round(df.duplicated().mean(), 3),
        "columns": columns
    }


# ─────────────────────────────────────────
# CLASS BALANCE COMPARISON
# ─────────────────────────────────────────

def compare_balance(
    original_df: pd.DataFrame,
    augmented_df: pd.DataFrame,
    target_column: str,
) -> dict:
    """
    Compare class balance before and after synthesis.
    Balance score = minority_count / majority_count.
    """
    if target_column not in original_df.columns or target_column not in augmented_df.columns:
        return {"available": False, "reason": f"Target column '{target_column}' not found"}

    orig_counts = original_df[target_column].value_counts()
    aug_counts = augmented_df[target_column].value_counts()

    orig_balance = round(orig_counts.min() / orig_counts.max(), 3)
    aug_balance = round(aug_counts.min() / aug_counts.max(), 3)

    improved = aug_balance > orig_balance
    delta = round(aug_balance - orig_balance, 3)

    return {
        "available": True,
        "before": orig_balance,
        "after": aug_balance,
        "delta": delta,
        "improved": improved,
        "before_distribution": {str(k): int(v) for k, v in orig_counts.items()},
        "after_distribution": {str(k): int(v) for k, v in aug_counts.items()},
        "passed": improved or abs(delta) < 0.02  # allow tiny regression
    }


# ─────────────────────────────────────────
# DISTRIBUTION SIMILARITY — KS TEST
# ─────────────────────────────────────────

def run_ks_tests(
    original_df: pd.DataFrame,
    augmented_df: pd.DataFrame,
    blocked_columns: list,
) -> dict:
    """
    Kolmogorov-Smirnov test for each numeric column.
    Tests whether the augmented column's distribution
    significantly diverged from the original.

    p-value < 0.05 = distributions are significantly different = bad
    p-value >= 0.05 = distributions are similar = good
    """
    numeric_cols = [
        col for col in original_df.select_dtypes(include=np.number).columns
        if col not in blocked_columns
        and col in augmented_df.columns
    ]

    results = {}
    for col in numeric_cols:
        orig_vals = original_df[col].dropna()
        aug_vals = augmented_df[col].dropna()

        if len(orig_vals) < 5 or len(aug_vals) < 5:
            results[col] = {"skipped": True, "reason": "Insufficient data"}
            continue

        ks_stat, p_value = stats.ks_2samp(orig_vals, aug_vals)

        results[col] = {
            "ks_statistic": round(float(ks_stat), 4),
            "p_value": round(float(p_value), 4),
            "passed": p_value >= 0.05,
            "severity": (
                "high" if p_value < 0.01 else
                "medium" if p_value < 0.05 else
                "none"
            )
        }

    failed = [col for col, r in results.items() if not r.get("passed", True) and not r.get("skipped")]

    return {
        "per_column": results,
        "failed_columns": failed,
        "passed": len(failed) == 0
    }


# ─────────────────────────────────────────
# DISTRIBUTION SIMILARITY — CHI-SQUARED
# ─────────────────────────────────────────

def run_chi_squared_tests(
    original_df: pd.DataFrame,
    augmented_df: pd.DataFrame,
    blocked_columns: list,
) -> dict:
    """
    Chi-squared test for each categorical column.
    Tests whether category proportions shifted significantly after synthesis.

    p-value < 0.05 = proportions shifted significantly = bad
    p-value >= 0.05 = proportions preserved = good
    """
    cat_cols = [
        col for col in original_df.columns
        if original_df[col].nunique() <= 20
        and col not in blocked_columns
        and col in augmented_df.columns
        and pd.api.types.is_object_dtype(original_df[col])
        or (
            col in original_df.columns
            and original_df[col].nunique() <= 20
            and col not in blocked_columns
            and col in augmented_df.columns
        )
    ]

    # Deduplicate
    cat_cols = list(set(cat_cols))

    results = {}
    for col in cat_cols:
        orig_counts = original_df[col].value_counts()
        aug_counts = augmented_df[col].value_counts()

        # Align categories
        all_cats = set(orig_counts.index) | set(aug_counts.index)
        orig_aligned = [orig_counts.get(c, 0) for c in all_cats]
        aug_aligned = [aug_counts.get(c, 0) for c in all_cats]

        # Scale aug to same total as orig for fair comparison
        scale = sum(orig_aligned) / sum(aug_aligned) if sum(aug_aligned) > 0 else 1
        aug_scaled = [v * scale for v in aug_aligned]

        try:
            chi2_stat, p_value = stats.chisquare(f_obs=aug_scaled, f_exp=orig_aligned)
            results[col] = {
                "chi2_statistic": round(float(chi2_stat), 4),
                "p_value": round(float(p_value), 4),
                "passed": p_value >= 0.05,
                "severity": (
                    "high" if p_value < 0.01 else
                    "medium" if p_value < 0.05 else
                    "none"
                )
            }
        except Exception as e:
            results[col] = {"skipped": True, "reason": str(e)}

    failed = [col for col, r in results.items() if not r.get("passed", True) and not r.get("skipped")]

    return {
        "per_column": results,
        "failed_columns": failed,
        "passed": len(failed) == 0
    }


# ─────────────────────────────────────────
# COMPLETENESS COMPARISON
# ─────────────────────────────────────────

def compare_completeness(
    original_df: pd.DataFrame,
    augmented_df: pd.DataFrame,
) -> dict:
    """
    Compare overall missing value rates before and after.
    Synthesis should never introduce new missing values.
    """
    orig_null_rate = round(original_df.isnull().mean().mean(), 3)
    aug_null_rate = round(augmented_df.isnull().mean().mean(), 3)

    per_column = {}
    for col in original_df.columns:
        if col not in augmented_df.columns:
            continue
        orig_col_null = round(original_df[col].isnull().mean(), 3)
        aug_col_null = round(augmented_df[col].isnull().mean(), 3)
        per_column[col] = {
            "before": orig_col_null,
            "after": aug_col_null,
            "improved": aug_col_null < orig_col_null,
            "degraded": aug_col_null > orig_col_null
        }

    degraded_cols = [col for col, v in per_column.items() if v["degraded"]]

    return {
        "overall_null_rate_before": orig_null_rate,
        "overall_null_rate_after": aug_null_rate,
        "improved": aug_null_rate < orig_null_rate,
        "per_column": per_column,
        "degraded_columns": degraded_cols,
        "passed": len(degraded_cols) == 0
    }


# ─────────────────────────────────────────
# MAIN ENTRY POINT
# ─────────────────────────────────────────

def run_validation_checks(
    original_df: pd.DataFrame,
    augmented_df: pd.DataFrame,
    target_column: Optional[str],
    blocked_columns: list,
    adfi_before: float,
) -> dict:
    """
    Run all pre/post validation checks.
    Returns structured metrics for the validation agent to reason over.
    """
    augmented_profile = profile_augmented(augmented_df)

    balance = compare_balance(original_df, augmented_df, target_column) if target_column else {"available": False}
    ks_results = run_ks_tests(original_df, augmented_df, blocked_columns)
    chi2_results = run_chi_squared_tests(original_df, augmented_df, blocked_columns)
    completeness = compare_completeness(original_df, augmented_df)

    # Summary of what passed and what failed
    checks_passed = []
    checks_failed = []

    if balance.get("passed"):
        checks_passed.append("class_balance")
    elif balance.get("available"):
        checks_failed.append("class_balance")

    if ks_results["passed"]:
        checks_passed.append("numeric_distributions")
    else:
        checks_failed.append(f"numeric_distributions ({', '.join(ks_results['failed_columns'])})")

    if chi2_results["passed"]:
        checks_passed.append("categorical_distributions")
    else:
        checks_failed.append(f"categorical_distributions ({', '.join(chi2_results['failed_columns'])})")

    if completeness["passed"]:
        checks_passed.append("completeness")
    else:
        checks_failed.append(f"completeness ({', '.join(completeness['degraded_columns'])})")

    return {
        "augmented_profile": augmented_profile,
        "adfi_before": adfi_before,
        "rows_before": len(original_df),
        "rows_after": len(augmented_df),
        "rows_added": len(augmented_df) - len(original_df),
        "balance": balance,
        "ks_tests": ks_results,
        "chi2_tests": chi2_results,
        "completeness": completeness,
        "checks_passed": checks_passed,
        "checks_failed": checks_failed,
        "overall_passed": len(checks_failed) == 0
    }