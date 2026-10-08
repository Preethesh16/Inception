import hashlib
import json
import os
from pathlib import Path
import numpy as np
import pandas as pd
from .config import DATA, POLICY
from .engine import dt

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
    return frame[frame.date < pd.Timestamp(as_of).tz_localize(None)].copy()


def prepare(group):
    g = group.sort_values("date").copy()
    values, imputed = [], []
    for _, row in g.iterrows():
        if int(row.complete) and not int(row.stockout_censored):
            value = float(row.quantity)
            imputed.append(False)
        else:
            seasonal = values[-7::-7][:8]
            value = float(np.median(seasonal or values[-7:] or [0]))
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
            revision=os.getenv("CHRONOS_REVISION", "29ec3766d36d6f73f0696f85560a422f50e8498c1"),
        )
    on_status("MODEL_RUNNING", {"model": "amazon/chronos-2", "series": len(groups)})
    frame = pd.concat([g.tail(180) for g in groups.values()])
    columns = [
        "item_id",
        "date",
        "target",
        "patient_load",
        "emergency_share",
        "report_indicator",
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
    groups = {f"{fid}:{sid}": prepare(g) for (fid, sid), g in history.groupby(["facility_id", "supply_id"])}
    config = {
        "model": os.getenv("CHRONOS_MODEL", "amazon/chronos-2"),
        "revision": os.getenv("CHRONOS_REVISION", "29ec3766d36d6f73f0696f85560a422f50e8498c1"),
        "context": 180,
        "horizon": 28,
        "quantiles": [0.1, 0.5, 0.9],
        "policy": POLICY["version"],
        "mode": os.getenv("INCEPTION_FORECAST", "auto"),
    }
    fingerprint = hashlib.sha256(
        (history.to_csv(index=False) + json.dumps(config, sort_keys=True)).encode()
    ).hexdigest()
    cache_dir = Path(directory) / "forecast_cache"
    cache_dir.mkdir(exist_ok=True)
    cache_path = cache_dir / f"{fingerprint}.json"
    source, error = "live", None
    if (
        not force
        and cache_path.exists()
        and (not json.loads(cache_path.read_text())["error"] or config["mode"] == "baseline")
    ):
        payload = json.loads(cache_path.read_text())
        source = "cached"
        on_status("FORECAST_CACHE_HIT", {"input_hash": fingerprint, "computed_at": payload["computed_at"]})
    else:
        candidates = {"seasonal-naive": {}, "recent-level": {}}
        for name in candidates:
            for key, g in groups.items():
                p = baseline(g, 28, name)
                residuals = g.target.diff(7).dropna().abs()
                spread = float(residuals.quantile(0.8)) if len(residuals) else 0
                candidates[name][key] = {
                    "p10": np.maximum(0, p - spread).tolist(),
                    "p50": p.tolist(),
                    "p90": (p + spread).tolist(),
                }
        if config["mode"] != "baseline":
            try:
                candidates["chronos-2"] = chronos(groups, on_status=on_status)
            except Exception as exc:
                error = f"{type(exc).__name__}: {str(exc)[:300]}"
                on_status("MODEL_FALLBACK", {"reason": error, "fallback": "validated baseline"})
        else:
            error = "Baseline-only mode explicitly configured"
        evaluation = []
        # Historical cutoffs only: validation does not touch hidden future targets.
        for holdout in (56, 28):
            training = {k: g.iloc[:-holdout].copy() for k, g in groups.items() if len(g) > holdout + 28}
            if not training:
                continue
            predictions = {
                name: {k: baseline(g, 28, name).tolist() for k, g in training.items()}
                for name in ("seasonal-naive", "recent-level")
            }
            if "chronos-2" in candidates:
                try:
                    cp = chronos(training, on_status=on_status)
                    predictions["chronos-2"] = {k: p["p50"] for k, p in cp.items()}
                except Exception as exc:
                    on_status("VALIDATION_FAILED", {"reason": str(exc)[:200]})
            for horizon in (7, 28):
                for name, preds in predictions.items():
                    actual, predicted = [], []
                    for k in training:
                        test = groups[k].iloc[len(training[k]) : len(training[k]) + horizon]
                        for j, (_, row) in enumerate(test.iterrows()):
                            if row.complete and not row.stockout_censored:
                                actual.append(float(row.quantity))
                                predicted.append(preds[k][j])
                    if actual:
                        evaluation.append(
                            {
                                "model": name,
                                "horizon": horizon,
                                "holdout_offset": holdout,
                                **metrics(actual, predicted),
                            }
                        )
        scores = {
            name: np.mean([r["mae"] for r in evaluation if r["model"] == name])
            for name in candidates
            if any(r["model"] == name for r in evaluation)
        }
        selected = min(scores, key=scores.get) if scores else "recent-level"
        from .store import now

        payload = {
            "candidates": candidates,
            "evaluation": evaluation,
            "selected": selected,
            "error": error,
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
        selected = payload["selected"] if valid >= 28 else "recent-level"
        raw = payload["candidates"][selected][key]
        plan, stress, reasons = list(raw["p50"]), list(raw["p90"]), []
        anomaly = any(
            any(e["facility_id"] == fid and e["supply_id"] == sid for e in i["evidence"])
            for i in state["incidents"].values()
        )
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
            "limited_evidence": valid < 28,
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
    return forecasts, {k: v for k, v in payload.items() if k != "candidates"}
