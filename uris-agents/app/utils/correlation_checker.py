import pandas as pd
import numpy as np
from typing import Dict, Any, List, Optional


def compute_correlation_matrix(df: pd.DataFrame, numeric_columns: Optional[List[str]] = None) -> pd.DataFrame:
    """
    Compute Pearson correlation matrix for numeric columns only.
    Returns a symmetric DataFrame with NaN where not applicable.
    """
    if numeric_columns is None:
        numeric_columns = df.select_dtypes(include=[np.number]).columns.tolist()

    if not numeric_columns:
        return pd.DataFrame()

    corr_matrix = df[numeric_columns].corr(method='pearson')
    return corr_matrix


def calculate_correlation_drift(
    real_corr: pd.DataFrame,
    synth_corr: pd.DataFrame,
    max_allowed_drift_per_pair: float = 0.15,
    max_allowed_frobenius: float = 0.25,
    max_allowed_column_drift: float = 0.20
) -> Dict[str, Any]:
    """
    Compare two correlation matrices and compute drift metrics.

    Metrics:
    - max_pair_diff: largest absolute difference in any cell
    - frobenius_norm: sqrt(sum of squared differences) — overall matrix distance
    - mean_column_drift: average max drift per column
    - pass: True if all metrics below thresholds

    Returns detailed report.
    """
    # Align matrices — only compare common numeric columns
    common_cols = real_corr.columns.intersection(synth_corr.columns).tolist()
    if not common_cols:
        return {
            "status": "fail",
            "error": "No common numeric columns between real and synthetic data",
            "pass": False
        }

    real_aligned = real_corr.loc[common_cols, common_cols]
    synth_aligned = synth_corr.loc[common_cols, common_cols]

    # Absolute difference matrix
    diff_matrix = np.abs(real_aligned - synth_aligned)

    # Overall metrics
    max_pair_diff = float(diff_matrix.max().max())
    frobenius_norm = float(np.linalg.norm(diff_matrix.values, 'fro'))
    mean_column_drift = float(diff_matrix.max(axis=1).mean())

    # Per-column max drift
    column_max_drift = diff_matrix.max(axis=1).to_dict()

    pass_pair = max_pair_diff <= max_allowed_drift_per_pair
    pass_frobenius = frobenius_norm <= max_allowed_frobenius
    pass_column = mean_column_drift <= max_allowed_column_drift

    overall_pass = pass_pair and pass_frobenius and pass_column

    return {
        "status": "pass" if overall_pass else "fail",
        "max_pair_difference": round(max_pair_diff, 4),
        "frobenius_norm": round(frobenius_norm, 4),
        "mean_column_max_drift": round(mean_column_drift, 4),
        "per_column_max_drift": {k: round(v, 4) for k, v in column_max_drift.items()},
        "thresholds": {
            "max_pair_difference": max_allowed_drift_per_pair,
            "frobenius_norm": max_allowed_frobenius,
            "mean_column_drift": max_allowed_column_drift
        },
        "individual_passes": {
            "pairwise": pass_pair,
            "frobenius": pass_frobenius,
            "column_level": pass_column
        },
        "overall_pass": overall_pass,
        "details": (
            f"Max pairwise correlation drift: {max_pair_diff:.4f} (threshold ≤ {max_allowed_drift_per_pair}) → {'PASS' if pass_pair else 'FAIL'}\n"
            f"Frobenius norm of difference matrix: {frobenius_norm:.4f} (threshold ≤ {max_allowed_frobenius}) → {'PASS' if pass_frobenius else 'FAIL'}\n"
            f"Mean max drift per column: {mean_column_drift:.4f} (threshold ≤ {max_allowed_column_drift}) → {'PASS' if pass_column else 'FAIL'}"
        )
    }


def run_correlation_check(
    real_df: pd.DataFrame,
    synth_df: pd.DataFrame,
    blocked_columns: List[str] = None,
    drift_thresholds: Optional[Dict[str, float]] = None
) -> Dict[str, Any]:
    """
    Main entry point — called by Synthesis Agent after generation.

    Args:
        real_df: original (post-imputation) dataset
        synth_df: synthetic-augmented dataset
        blocked_columns: columns to exclude from correlation (PII, protected)
        drift_thresholds: optional override of default thresholds

    Returns:
        {
            "status": "pass" | "fail",
            "drift_metrics": {...},
            "recommendation": "accept" | "retry",
            "details": str
        }
    """
    if blocked_columns is None:
        blocked_columns = []

    # Exclude blocked columns
    numeric_cols = [
        col for col in real_df.select_dtypes(include=[np.number]).columns
        if col not in blocked_columns
    ]

    if not numeric_cols:
        return {
            "status": "skip",
            "recommendation": "accept",
            "details": "No numeric columns available for correlation check (all blocked or non-numeric)."
        }

    real_corr = compute_correlation_matrix(real_df, numeric_columns=numeric_cols)
    synth_corr = compute_correlation_matrix(synth_df, numeric_columns=numeric_cols)

    if real_corr.empty or synth_corr.empty:
        return {
            "status": "fail",
            "recommendation": "retry",
            "details": "Could not compute correlation matrices — insufficient numeric data."
        }

    # Use custom thresholds if provided
    thresholds = {
        "max_allowed_drift_per_pair": 0.20,
        "max_allowed_frobenius": 0.40,
        "max_allowed_column_drift": 0.20
    }
    if drift_thresholds:
        thresholds.update(drift_thresholds)

    drift_result = calculate_correlation_drift(
        real_corr=real_corr,
        synth_corr=synth_corr,
        **thresholds
    )

    recommendation = "accept" if drift_result["overall_pass"] else "retry"

    return {
        "status": "pass" if drift_result["overall_pass"] else "fail",
        "drift_metrics": drift_result,
        "recommendation": recommendation,
        "details": drift_result["details"]
    }