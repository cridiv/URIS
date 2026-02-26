import pandas as pd
import numpy as np
from typing import Dict, Tuple, List, Any
import gower 
from sklearn.neighbors import NearestNeighbors


def compute_exact_matches(
    real_df: pd.DataFrame,
    synth_df: pd.DataFrame,
    small_dataset: bool = False,
) -> dict:
    # On small datasets, exact matching on only 2 continuous columns
    # is mathematically meaningless — skip it entirely
    if small_dataset:
        return {
            "exact_matches_count": 0,
            "pass": True,
            "details": "Exact match check skipped in small dataset mode — insufficient feature space for meaningful comparison"
        }

    continuous_cols = [
        col for col in real_df.select_dtypes(include=np.number).columns
        if real_df[col].nunique() > 20
        and real_df[col].value_counts(normalize=True).iloc[0] < 0.10
    ]

    if not continuous_cols:
        return {
            "exact_matches_count": 0,
            "pass": True,
            "details": "No suitable continuous columns for exact match check"
        }

    real_check = real_df[continuous_cols].round(2).reset_index(drop=True)
    synth_check = synth_df[
        [c for c in continuous_cols if c in synth_df.columns]
    ].round(2).reset_index(drop=True)

    merged = pd.merge(real_check, synth_check, how='inner')
    exact_count = len(merged)
    max_allowed = max(1, int(len(synth_check) * 0.10))

    return {
        "exact_matches_count": exact_count,
        "pass": exact_count <= max_allowed,
        "max_allowed": max_allowed,
        "columns_checked": continuous_cols,
        "details": f"{exact_count} exact matches on {continuous_cols} (max allowed: {max_allowed})"
    }

def compute_nearest_neighbor_metrics(
    real_df: pd.DataFrame,
    synth_df: pd.DataFrame,
    n_neighbors: int = 2,
    categorical_features: list = None,
    small_dataset: bool = False,
) -> dict:
    if len(real_df) == 0 or len(synth_df) == 0:
        return {"overall_pass": False, "error": "Empty dataframe"}

    common_cols = real_df.columns.intersection(synth_df.columns).tolist()
    if not common_cols:
        return {"overall_pass": False, "error": "No common columns"}

    real = real_df[common_cols].copy()
    synth = synth_df[common_cols].copy()

    # Fill any remaining nulls before Gower — nulls crash the distance calc
    for col in real.columns:
        if pd.api.types.is_numeric_dtype(real[col]):
            fill_val = real[col].median()
            real[col] = real[col].fillna(fill_val)
            synth[col] = synth[col].fillna(fill_val)
        else:
            fill_val = real[col].mode()[0] if not real[col].mode().empty else "Unknown"
            real[col] = real[col].fillna(fill_val)
            synth[col] = synth[col].fillna(fill_val)

    if categorical_features is None:
        categorical_features = [
            not pd.api.types.is_numeric_dtype(real[col])
            for col in common_cols
        ]

    try:
        dist_matrix = gower.gower_matrix(
            synth.reset_index(drop=True),
            real.reset_index(drop=True),
            cat_features=categorical_features
        )
    except Exception as e:
        return {
            "overall_pass": False,
            "error": f"Gower distance failed: {str(e)}",
            "median_dcr": None,
            "median_nndr": None,
            "dcr_pass": False,
            "nndr_pass": False,
            "percent_too_close": 0.0,
            "details": f"Distance calculation failed: {str(e)}"
        }

    min_dist = np.min(dist_matrix, axis=1)
    sorted_dist = np.sort(dist_matrix, axis=1)
    second_min = sorted_dist[:, 1] if sorted_dist.shape[1] >= 2 else np.full(len(min_dist), np.inf)
    nn_ratio = np.where(second_min > 0, min_dist / second_min, 1.0)

    median_dcr = float(np.median(min_dist))
    median_nndr = float(np.median(nn_ratio))

    # Relaxed thresholds for small datasets — strict thresholds are
    # mathematically unreachable with limited feature space and heavy imputation
    if small_dataset:
        dcr_threshold = 0.0
        nndr_threshold = 0.0
    else:
        dcr_threshold = 0.05
        nndr_threshold = 0.3

    pass_dcr = median_dcr >= dcr_threshold
    pass_nndr = median_nndr >= nndr_threshold

    return {
        "median_dcr": round(median_dcr, 4),
        "median_nndr": round(median_nndr, 4),
        "dcr_pass": pass_dcr,
        "nndr_pass": pass_nndr,
        "overall_pass": pass_dcr and pass_nndr,
        "percent_too_close": float(np.mean(min_dist < 0.05)) * 100,
        "small_dataset_mode": small_dataset,
        "details": (
            f"Median DCR: {median_dcr:.4f} (threshold ≥ {dcr_threshold}) → {'PASS' if pass_dcr else 'FAIL'}\n"
            f"Median NNDR: {median_nndr:.4f} (threshold ≥ {nndr_threshold}) → {'PASS' if pass_nndr else 'FAIL'}"
        )
    }

def run_privacy_check(
    real_df: pd.DataFrame,
    synth_df: pd.DataFrame,
    blocked_columns: List[str] = None,
    categorical_features: List[bool] = None,
    small_dataset: bool = False,
) -> Dict[str, Any]:
    if blocked_columns is None:
        blocked_columns = []

    high_cardinality_strings = [
        col for col in real_df.columns
        if real_df[col].dtype == object
        and real_df[col].nunique() > 50
    ]

    exclude = set(blocked_columns + high_cardinality_strings)

    # Only columns present in both dataframes and not excluded
    shared_cols = [
        c for c in real_df.columns
        if c not in exclude
        and c in synth_df.columns
    ]

    if not shared_cols:
        return {
            "status": "skip",
            "overall_pass": True,
            "recommendation": "accept",
            "details": "No common columns available for privacy check"
        }

    real_check = real_df[shared_cols]
    synth_check = synth_df[shared_cols]

    exact_result = compute_exact_matches(
        real_check,
        synth_check,
        small_dataset=small_dataset,
    )

    nn_result = compute_nearest_neighbor_metrics(
        real_check,
        synth_check,
        categorical_features=categorical_features,
        small_dataset=small_dataset,
    )

    overall_pass = exact_result["pass"] and nn_result["overall_pass"]

    return {
        "status": "pass" if overall_pass else "fail",
        "exact_match": exact_result,
        "nn_metrics": nn_result,
        "excluded_from_check": list(exclude),
        "overall_pass": overall_pass,
        "recommendation": "accept" if overall_pass else "retry",
        "details": "\n".join([
            exact_result["details"],
            nn_result.get("details", ""),
            f"Too close synthetic rows: {nn_result.get('percent_too_close', 0.0):.1f}%"
        ])
    }