import hashlib
import json
import os
from pathlib import Path

import numpy as np
import pandas as pd

from .config import DATA, POLICY
from .engine import dt
from .uncertainty import calibrated_quantiles, path_distribution, quantile_metrics, spike_monitor

_PIPELINE = None


def history_at(as_of, directory=DATA, state=None):
    frame = pd.read_csv(Path(directory) / "observations.csv", parse_dates=["date"])
    if state:
        active = set(state["facilities"])
        if state["settings"]["demo"].get("mode") == "three-hospital":
            active &= set(state["settings"].get("onboarding", {}).get("hospitals", {}))
        frame = frame[frame.facility_id.isin(active)]
        for fid, record in state["settings"].get("onboarding", {}).get("hospitals", {}).items():
            imported = pd.DataFrame(record["observations"])
            imported["date"] = pd.to_datetime(imported["date"])
            cutoff = imported.date.max()
            frame = frame[~((frame.facility_id == fid) & (frame.date <= cutoff))]
            frame = pd.concat([frame, imported], ignore_index=True)
    # Date rows represent completed calendar days, never a partially observed future day.
    return frame[frame.date < pd.Timestamp(as_of).tz_localize(None).normalize()].copy()


def prepare(group, end_date=None):
    g = group.sort_values("date").copy()
    if g.date.duplicated().any():
        raise ValueError("Duplicate daily consumption observations")
    if not np.isfinite(g.quantity.astype(float)).all() or (g.quantity < 0).any():
        raise ValueError("Consumption must be finite and nonnegative")
    # Missing dates are unknown observations, never zero demand. Preserve calendar spacing.
    fid, sid = g.iloc[0].facility_id, g.iloc[0].supply_id
    last_day = pd.Timestamp(end_date) if end_date is not None else g.date.max()
    g = g.set_index("date").reindex(pd.date_range(g.date.min(), last_day, freq="D"))
    g.index.name = "date"
    g = g.reset_index()
    g["facility_id"], g["supply_id"] = fid, sid
    g["complete"] = g.complete.fillna(0)
    g["stockout_censored"] = g.stockout_censored.fillna(0)
    g["quantity"] = g.quantity.fillna(0)
    values, imputed = [], []
    for _, row in g.iterrows():
        if int(row.complete) and not int(row.stockout_censored):
            value = float(row.quantity)
            imputed.append(False)
        else:
            seasonal = values[-7::-7][:8]
            value = max(float(row.quantity), float(np.median(seasonal or values[-7:] or [0])))
            imputed.append(True)
        values.append(value)
    g["target"] = values
    g["imputed"] = imputed
    g["item_id"] = g.facility_id + ":" + g.supply_id
    g["day_of_week"] = g.date.dt.dayofweek.astype(float)
    return g


def baseline(g, horizon, kind):
    y = g.target.to_numpy(dtype=float)
    if not len(y):
        return np.zeros(horizon)
    if kind == "seasonal-naive" and len(y) >= 7:
        return np.array([y[-7 + i % 7] for i in range(horizon)])
    return np.full(horizon, np.mean(y[-7:]))


def chronos(groups, horizon=28, on_status=lambda *x: None):
    global _PIPELINE
    import torch
    from chronos import Chronos2Pipeline

    torch.set_num_threads(4)
    if _PIPELINE is None:
        on_status("MODEL_LOADING", {"model": "amazon/chronos-2", "device": "cpu"})
        _PIPELINE = Chronos2Pipeline.from_pretrained(
            os.getenv("CHRONOS_MODEL", "amazon/chronos-2"),
            device_map="cpu",
            revision=os.getenv("CHRONOS_REVISION", "29ec3766d36d6f73f0696f85560a422f50e8498c"),
        )
    on_status("MODEL_RUNNING", {"model": "amazon/chronos-2", "series": len(groups)})
    frame = pd.concat([g.tail(180) for g in groups.values()])
    columns = [
        "item_id",
        "date",
        "target",
        "day_of_week",
    ]
    future = []
    for key, g in groups.items():
        for n in range(1, horizon + 1):
            date = g.date.max() + pd.Timedelta(days=n)
            future.append({"item_id": key, "date": date, "day_of_week": float(date.dayofweek)})
    result = _PIPELINE.predict_df(
        frame[columns],
        future_df=pd.DataFrame(future),
        id_column="item_id",
        timestamp_column="date",
        target="target",
        prediction_length=horizon,
        quantile_levels=[0.1, 0.5, 0.9],
        batch_size=8,
        context_length=180,
        cross_learning=False,
        freq="D",
    )
    output = {}
    for key, g in result.groupby("item_id"):
        g = g.sort_values("date")
        q = np.maximum(0, g[["0.1", "0.5", "0.9"]].to_numpy(dtype=float))
        q.sort(axis=1)
        output[key] = {"p10": q[:, 0].tolist(), "p50": q[:, 1].tolist(), "p90": q[:, 2].tolist()}
    return output


def metrics(actual, pred):
    y, p = np.asarray(actual), np.asarray(pred)
    error = np.abs(y - p)
    return {
        "mae": round(float(error.mean()), 3),
        "wape": round(float(error.sum() / np.abs(y).sum()), 4) if np.abs(y).sum() else None,
        "observations": len(y),
    }


def build_forecasts(history, state, run_id, on_status=lambda *x: None, directory=DATA, force=False):
    cutoff = pd.Timestamp(state["settings"]["demo"]["as_of"]).tz_localize(None).normalize()
    history = history[history.date < cutoff].copy()
    groups = {
        f"{fid}:{sid}": prepare(g, cutoff - pd.Timedelta(days=1))
        for (fid, sid), g in history.groupby(["facility_id", "supply_id"])
    }
    config = {
        "model": os.getenv("CHRONOS_MODEL", "amazon/chronos-2"),
        "revision": os.getenv("CHRONOS_REVISION", "29ec3766d36d6f73f0696f85560a422f50e8498c"),
        "context": 180,
        "horizon": 28,
        "quantiles": [0.1, 0.5, 0.9],
        "policy": POLICY,
        "schema": 2,
        "cutoff": cutoff.isoformat(),
        "mode": os.getenv("INCEPTION_FORECAST", "chronos"),
    }
    # Clinical metadata does not influence either prediction or cache identity.
    inventory_columns = ["facility_id", "supply_id", "date", "quantity", "complete", "stockout_censored"]
    fingerprint = hashlib.sha256(
        (
            history[inventory_columns].sort_values(["facility_id", "supply_id", "date"]).to_csv(index=False)
            + json.dumps(config, sort_keys=True)
        ).encode()
    ).hexdigest()
    cache_dir = Path(directory) / "forecast_cache"
    cache_dir.mkdir(exist_ok=True)
    cache_path = cache_dir / f"{fingerprint}.json"
    source = "live"
    if not force and cache_path.exists():
        payload = json.loads(cache_path.read_text())
        source = "cached"
        on_status("FORECAST_CACHE_HIT", {"input_hash": fingerprint, "computed_at": payload["computed_at"]})
    else:
        # Baseline mode is an explicit offline/test choice; never silently substitute it.
        selected = "recent-level" if config["mode"] == "baseline" else "chronos-2"

        def predict(training):
            if selected == "chronos-2":
                return chronos(training, on_status=on_status)
            result = {}
            for key, g in training.items():
                center = baseline(g, 28, selected)
                spread = float(g.target.diff(7).dropna().abs().quantile(0.8)) if len(g) > 7 else 0.0
                result[key] = {
                    "p10": np.maximum(0, center - spread).tolist(),
                    "p50": center.tolist(),
                    "p90": (center + spread).tolist(),
                }
            return result

        raw_predictions = predict(groups)
        records = {key: [] for key in groups}
        monitors = {}
        evaluation = []
        # Ascending calendar origins; only earlier, fully observed paths calibrate a test.
        # Latest 28 days are untouched by calibration until after their evaluation.
        for holdout in range(168, 27, -7):
            training = {k: g.iloc[:-holdout].copy() for k, g in groups.items() if len(g) >= holdout + 56}
            if not training:
                continue
            predictions = predict(training)
            for key, train in training.items():
                test = groups[key].iloc[len(train) : len(train) + 28]
                valid_mask = ((test.complete == 1) & (test.stockout_censored == 0)).to_numpy()
                actual = test.quantity.to_numpy(dtype=float)
                pred = predictions[key]
                prior = [r for r in records[key] if r["end"] < test.date.iloc[0].isoformat()]
                adjusted = calibrated_quantiles(pred, prior)
                for horizon in (7, 28):
                    mask = valid_mask[:horizon]
                    if not mask.any():
                        continue
                    y = actual[:horizon][mask]
                    for name in dict.fromkeys((selected, "seasonal-naive", "recent-level")):
                        values = pred["p50"] if name == selected else baseline(train, 28, name)
                        row = {
                            "series": key,
                            "model": name,
                            "horizon": horizon,
                            "holdout_offset": holdout,
                            "origin": test.date.iloc[0].isoformat(),
                            "split": "test" if holdout == 28 else "rolling_validation",
                            **metrics(y, np.asarray(values)[:horizon][mask]),
                        }
                        if name == selected:
                            row.update(
                                quantile_metrics(
                                    y, {q: np.asarray(v)[:horizon][mask] for q, v in adjusted.items()}
                                )
                            )
                            row["calibration_origins"] = len(prior)
                        evaluation.append(row)
                residual = actual - np.asarray(pred["p50"])
                if holdout == 28:
                    reference = [v for r in prior for v in r["residual"]]
                    monitors[key] = spike_monitor(
                        [float(v) if ok else None for v, ok in zip(residual[-7:], valid_mask[-7:])], reference
                    )
                # Censored/missing outcomes cannot establish a complete error path.
                if valid_mask.all():
                    records[key].append(
                        {
                            "start": test.date.iloc[0].isoformat(),
                            "end": test.date.iloc[-1].isoformat(),
                            "residual": residual.tolist(),
                        }
                    )
        from .store import now

        payload = {
            "predictions": raw_predictions,
            "residual_records": records,
            "monitors": monitors,
            "evaluation": evaluation,
            "selected": selected,
            "error": "Explicit offline baseline mode" if selected != "chronos-2" else None,
            "computed_at": now(),
            "input_hash": fingerprint,
            "config": config,
        }
        cache_path.write_text(json.dumps(payload, allow_nan=False))
    error = payload["error"]
    as_of = dt(state["settings"]["demo"]["as_of"])
    forecasts = {}
    for key, g in groups.items():
        fid, sid = key.split(":")
        valid = int(((g.complete == 1) & (g.stockout_censored == 0)).sum())
        selected = payload["selected"]
        records = payload["residual_records"].get(key, [])
        raw = calibrated_quantiles(payload["predictions"][key], records)
        monitor = payload["monitors"].get(key, {"alert": False, "status": "insufficient_error_history"})
        plan, stress, reasons = list(raw["p50"]), list(raw["p90"]), []
        anomaly = any(
            any(e["facility_id"] == fid and e["supply_id"] == sid for e in i["evidence"])
            for i in state["incidents"].values()
        )
        anomaly = anomaly or monitor["alert"]
        floor = (
            float(g[(g.complete == 1) & (g.stockout_censored == 0)].quantity.tail(3).mean()) if anomaly else 0
        )
        additional = max(
            [
                float(r.get("additional_units", {}).get(sid, 0)) / 7
                for r in state["reports"].values()
                if r["facility_id"] == fid
                and r["status"] == "active"
                and dt(r["onset_at"]) <= as_of < dt(r["expires_at"])
            ]
            or [0]
        )
        normal = float(g.target.iloc[-31:-3].median()) if len(g) > 31 else float(g.target.median())
        for day in range(7):
            plan[day] = max(plan[day], floor, normal + additional if additional else 0)
            stress[day] = max(stress[day], plan[day])
        if anomaly:
            reasons.append(f"Observed 3-day consumption floor: {floor:.1f} units/day for 7 days")
        if additional:
            reasons.append(
                f"Reported additional requirement: {additional * 7:.0f} units / 7 days; overlapping surge not added twice"
            )
        scenarios = path_distribution(plan, records, fingerprint + key)
        if anomaly or additional:
            scenarios["status"] = "regime_change_stress_only" if scenarios["paths"] else "unavailable"
        forecasts[key] = {
            "id": key,
            "facility_id": fid,
            "supply_id": sid,
            "run_id": run_id,
            "cutoff": as_of.isoformat(),
            "model": selected,
            "source": source,
            "computed_at": payload["computed_at"],
            "input_hash": fingerprint,
            "p10": raw["p10"],
            "p50": raw["p50"],
            "p90": raw["p90"],
            "planning": plan,
            "stress": stress,
            "normal_daily": normal,
            "adjustments": reasons,
            "scenarios": scenarios,
            "spike_monitor": monitor,
            "limited_evidence": valid < 28 or scenarios["status"] != "empirical",
            "uncertainty_note": "Empirical residual simulation; limited independent history. Daily p90 values are not a joint 90% demand path.",
            "surge_scenarios": {"1.5x": [v * 1.5 for v in plan], "2x": [v * 2 for v in plan]},
            "imputed_count": int(g.imputed.sum()),
            "fallback_reason": error,
            "history": [
                {
                    "date": r.date.isoformat(),
                    "quantity": int(r.quantity),
                    "imputed": bool(r.imputed),
                    "model_input": float(r.target),
                }
                for _, r in g.tail(30).iterrows()
            ],
        }
    return forecasts, {k: v for k, v in payload.items() if k not in ("predictions", "residual_records")}
