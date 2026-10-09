"""Empirical, whole-path uncertainty. Frequencies are conditional model estimates.

Weekly rolling origins overlap: the number of Monte Carlo draws is NOT the
number of independent historical observations. Never label these as calibrated
clinical probabilities or as joint samples supplied directly by Chronos.
"""

import hashlib

import numpy as np

from .config import POLICY


def path_distribution(center, records, seed_key):
    center = np.asarray(center, dtype=float)
    if not records:
        return {
            "paths": [],
            "weights": [],
            "draws": 0,
            "origins": 0,
            "independent_windows": 0,
            "status": "unavailable",
        }
    residuals = np.asarray([r["residual"] for r in records], dtype=float)
    seed = int(hashlib.sha256(seed_key.encode()).hexdigest()[:16], 16)
    rng = np.random.default_rng(seed)
    counts = np.bincount(
        rng.integers(len(records), size=POLICY["monte_carlo_samples"]), minlength=len(records)
    )
    # Keep full residual vectors together; compress identical bootstrap draws.
    paths = np.maximum(0, center + residuals)
    independent, last_end = 0, None
    for r in sorted(records, key=lambda r: r["start"]):
        if last_end is None or r["start"] > last_end:
            independent += 1
            last_end = r["end"]
    return {
        "paths": paths.tolist(),
        "weights": (counts / counts.sum()).tolist(),
        "draws": int(counts.sum()),
        "origins": len(records),
        "independent_windows": independent,
        "status": "limited_evidence" if independent < 20 else "empirical",
        "method": "whole-path residual bootstrap; overlapping historical origins",
        "interpretation": "Conditional simulation estimates, not validated real-world probabilities",
    }


def calibrated_quantiles(raw, records):
    """Horizon-specific empirical error correction, not a conformal guarantee."""
    if not records:
        return raw
    residuals = np.asarray([r["residual"] for r in records])
    center = np.asarray(raw["p50"])
    return {
        "p10": np.maximum(0, np.minimum(raw["p10"], center + np.quantile(residuals, 0.1, axis=0))).tolist(),
        "p50": raw["p50"],
        "p90": np.maximum(raw["p90"], center + np.quantile(residuals, 0.9, axis=0)).tolist(),
    }


def quantile_metrics(actual, prediction):
    y = np.asarray(actual)
    lo, hi = np.asarray(prediction["p10"]), np.asarray(prediction["p90"])
    losses = []
    for key, tau in (("p10", 0.1), ("p50", 0.5), ("p90", 0.9)):
        error = y - np.asarray(prediction[key])
        losses.append(float(np.maximum(tau * error, (tau - 1) * error).mean()))
    return {
        "pinball": float(np.mean(losses)),
        "coverage_80": float(((y >= lo) & (y <= hi)).mean()),
        "interval_width": float((hi - lo).mean()),
    }


def spike_monitor(residual, reference):
    """CUSUM on errors from predictions made before their target observations."""
    if len(reference) < 28:
        return {"alert": False, "status": "insufficient_error_history"}
    reference = np.asarray(reference)
    median = float(np.median(reference))
    scale = max(1.0, float(1.4826 * np.median(np.abs(reference - median))))
    score = 0.0
    latest = 0.0
    for value in residual:
        if value is None:  # Missing/censored observations must not accumulate evidence.
            score = 0.0
            continue
        latest = (value - median) / scale
        score = max(0.0, score + latest - POLICY["cusum_allowance"])
    return {
        "alert": score > POLICY["cusum_threshold"],
        "cusum": round(score, 3),
        "latest_robust_score": round(latest, 3),
        "error_median": median,
        "error_scale": scale,
        "status": "heuristic_threshold_requires_local_validation",
    }


def inventory_distribution(batches, forecast, as_of, arrivals=(), incoming=(), removals=None):
    from .engine import simulate

    distribution = forecast.get("scenarios", {})
    paths, weights = distribution.get("paths", []), distribution.get("weights", [])
    if not paths:
        return {"available": False, "status": "unavailable"}
    results = [simulate(batches, p, as_of, arrivals, incoming, removals) for p in paths]
    unmet = np.asarray([r["unmet"] for r in results])
    waste = np.asarray([r["waste"] for r in results])
    weights = np.asarray(weights)
    order = np.argsort(unmet)
    index = min(len(order) - 1, int(np.searchsorted(np.cumsum(weights[order]), 0.95)))
    return {
        "available": True,
        "status": distribution["status"],
        "shortage_probability": float(weights @ (unmet > 1e-6)),
        "expected_unmet": float(weights @ unmet),
        "unmet_p95": float(unmet[order[index]]),
        "worst_sample_unmet": float(unmet.max()),
        "expected_waste": float(weights @ waste),
        "expiry_probability": float(weights @ (waste > 1e-6)),
        "batch_expected_waste": {
            bid: float(weights @ np.array([r["batch_waste"].get(bid, 0) for r in results]))
            for bid in results[0]["batch_waste"]
        },
        "draws": distribution["draws"],
        "origins": distribution["origins"],
        "independent_windows": distribution["independent_windows"],
    }
