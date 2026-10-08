"""Independent synthetic test seeds. Never feeds held-out targets to the forecast worker."""

import json
import tempfile
import time
from pathlib import Path
import numpy as np
import pandas as pd
from inception.store import Store
from inception.seed import seed, generate, START
from inception.forecast import history_at, build_forecasts, metrics
from inception.engine import detect, simulate, batches_for, arrivals_for
from inception.demo import advance
from inception.config import ROOT

started = time.monotonic()
results = []
for test_seed in (2027, 2028):
    directory = Path(tempfile.mkdtemp(prefix=f"inception-eval-{test_seed}-"))
    store = Store(directory / "test.db")
    seed(store, directory)
    generate(directory, test_seed)
    with store.transaction() as state:
        advance(state, 3, directory=directory)
    state = store.read()
    history = history_at(state["settings"]["demo"]["as_of"], directory)
    state["incidents"] = {i["id"]: i for i in detect(history, state)}
    forecasts, validation = build_forecasts(
        history, state, f"test-{test_seed}", lambda k, v: print(test_seed, k, flush=True), directory
    )
    future = pd.read_csv(directory / "observations.csv", parse_dates=["date"])
    future = future[future.date >= pd.Timestamp(state["settings"]["demo"]["as_of"]).tz_localize(None)]
    raw_y, raw_p, adjusted_p, covered = [], [], [], []
    truth_short, pred_short, leads, timing_errors = [], [], [], []
    for key, fc in forecasts.items():
        fid, sid = key.split(":")
        target = future[(future.facility_id == fid) & (future.supply_id == sid)].quantity.to_numpy(
            dtype=float
        )[:28]
        raw_y.extend(target)
        raw_p.extend(fc["p50"])
        adjusted_p.extend(fc["planning"])
        covered.extend((target >= np.array(fc["p10"])) & (target <= np.array(fc["p90"])))
        real = simulate(
            batches_for(state, fid, sid),
            target,
            state["settings"]["demo"]["as_of"],
            arrivals_for(state, fid, sid),
        )
        predicted = simulate(
            batches_for(state, fid, sid),
            fc["planning"],
            state["settings"]["demo"]["as_of"],
            arrivals_for(state, fid, sid),
        )
        truth_short.append(real["stockout_days"] is not None)
        pred_short.append(predicted["stockout_days"] is not None)
        if truth_short[-1] and pred_short[-1]:
            leads.append(real["stockout_days"])
            timing_errors.append(abs(real["stockout_days"] - predicted["stockout_days"]))

    def classification(actual, predicted):
        tp = sum(a and p for a, p in zip(actual, predicted))
        fp = sum(not a and p for a, p in zip(actual, predicted))
        fn = sum(a and not p for a, p in zip(actual, predicted))
        return {
            "tp": tp,
            "fp": fp,
            "fn": fn,
            "precision": tp / (tp + fp) if tp + fp else None,
            "recall": tp / (tp + fn) if tp + fn else None,
        }

    anomaly_truth, anomaly_pred, delays = [], [], []
    # Includes isolated mask spike and multiple incident beginnings/ends.
    full = pd.read_csv(directory / "observations.csv", parse_dates=["date"])
    first_seen = {}
    for day in list(range(98, 114)) + list(range(218, 225)) + list(range(235, 241)):
        cutoff = START + pd.Timedelta(days=day)
        h = full[full.date < pd.Timestamp(cutoff).tz_localize(None)]
        state["settings"]["demo"]["as_of"] = cutoff.isoformat()
        detected = {(e["facility_id"], e["supply_id"]) for i in detect(h, state) for e in i["evidence"]}
        for fid in state["facilities"]:
            for sid in state["supplies"]:
                active = fid in ("A", "B") and sid == "ORS" and ((100 < day <= 110) or (237 < day <= 250))
                anomaly_truth.append(active)
                anomaly_pred.append((fid, sid) in detected)
                if active and (fid, sid) in detected:
                    onset = 100 if day < 200 else 237
                    first_seen.setdefault((fid, sid, onset), day - onset)
    results.append(
        {
            "test_seed": test_seed,
            "model_revision": validation["config"]["revision"],
            "input_hash": validation["input_hash"],
            "selected_model": validation["selected"],
            "availability_error": validation["error"],
            "validation": validation["evaluation"],
            "raw_test": metrics(raw_y, raw_p),
            "incident_adjusted_test": metrics(raw_y, adjusted_p),
            "daily_p10_p90_empirical_coverage": float(np.mean(covered)),
            "shortage_alerts": {
                **classification(truth_short, pred_short),
                "mean_warning_lead_days": float(np.mean(leads)) if leads else None,
                "mean_stockout_timing_error_days": float(np.mean(timing_errors)) if timing_errors else None,
            },
            "anomaly_detection": {
                **classification(anomaly_truth, anomaly_pred),
                "detection_delays_days": list(first_seen.values()),
            },
        }
    )
report = {
    "scope": "Synthetic unseen seeds only; not clinical validation",
    "seeds": [2027, 2028],
    "thresholds_tuned_on_test": False,
    "elapsed_seconds": round(time.monotonic() - started, 2),
    "results": results,
}
(ROOT / "artifacts").mkdir(exist_ok=True)
(ROOT / "artifacts/evaluation.json").write_text(json.dumps(report, indent=2, allow_nan=False))
print(json.dumps(report, indent=2))
