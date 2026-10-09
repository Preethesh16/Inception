"""Decision-level regressions for inventory-only probabilistic forecasting."""

from datetime import timedelta

import pandas as pd
import pytest
from inception import forecast as module
from inception.engine import donor_safe, expiry_donor_safe, risk_for, simulate
from inception.redistribution import search_decisions
from inception.uncertainty import inventory_distribution, path_distribution, spike_monitor

NOW = "2026-10-05T00:00:00+00:00"


def history(n=237):
    return pd.DataFrame(
        {
            "facility_id": "A",
            "supply_id": "ORS",
            "date": pd.date_range("2026-02-10", periods=n),
            "quantity": [40.0] * n,
            "complete": 1,
            "stockout_censored": 0,
        }
    )


def state_with_stock(quantity=460, expiry=60):
    expiry_at = (pd.Timestamp(NOW) + timedelta(days=expiry)).isoformat()
    fc = {
        "facility_id": "A",
        "supply_id": "ORS",
        "planning": [10.0] * 28,
        "stress": [10.0] * 28,
        "normal_daily": 0,
        "model": "chronos-2",
        "run_id": "r",
    }
    return {
        "settings": {"demo": {"as_of": NOW}},
        "facilities": {"A": {"lead_days": 1}},
        "incidents": {},
        "reports": {},
        "transfers": {},
        "replenishments": {},
        "supplies": {
            "ORS": {
                "pack_size": 10,
                "unit": "sachet",
                "storage": "ambient",
                "critical": True,
                "alternative": False,
            }
        },
        "batches": {
            "b": {
                "id": "b",
                "facility_id": "A",
                "supply_id": "ORS",
                "quantity": quantity,
                "reserved": 0,
                "expires_at": expiry_at,
                "unit": "sachet",
                "storage": "ambient",
            }
        },
        "forecasts": {"A:ORS": fc},
    }


def test_calendar_gaps_are_unknown_and_censored_quantity_is_lower_bound():
    h = history(20).drop(index=10)
    h.loc[19, ["quantity", "stockout_censored"]] = [80, 1]
    g = module.prepare(h)
    assert len(g) == 20
    assert g.iloc[10].imputed and g.iloc[10].target == 40
    assert g.iloc[-1].imputed and g.iloc[-1].target >= 80
    h.loc[0, "quantity"] = 0
    assert module.prepare(h).iloc[0].target == 0
    with pytest.raises(ValueError, match="Duplicate"):
        module.prepare(pd.concat([h, h.iloc[:1]]))


def test_chronos_inputs_exclude_clinical_columns(monkeypatch):
    class Pipeline:
        def predict_df(self, frame, **kwargs):
            assert set(frame.columns) == {"item_id", "date", "target", "day_of_week"}
            future = kwargs["future_df"].copy()
            future["0.1"], future["0.5"], future["0.9"] = 30.0, 40.0, 50.0
            return future

    monkeypatch.setattr(module, "_PIPELINE", Pipeline())
    h = history(30)
    h["patient_load"], h["emergency_share"] = 9999, 0.99
    output = module.chronos({"A:ORS": module.prepare(h)})
    assert output["A:ORS"]["p50"] == [40.0] * 28


def test_chronos_remains_selected_and_test_is_chronological(monkeypatch, tmp_path):
    monkeypatch.setenv("INCEPTION_FORECAST", "chronos")
    origins = []

    def predict(groups, **kwargs):
        origins.extend(g.date.max() for g in groups.values())
        # Deliberately worse than the simple baseline: it must not silently replace Chronos.
        return {k: {"p10": [20.0] * 28, "p50": [35.0] * 28, "p90": [38.0] * 28} for k in groups}

    monkeypatch.setattr(module, "chronos", predict)
    state = state_with_stock()
    forecasts, e = module.build_forecasts(history(), state, "r", directory=tmp_path)
    assert e["selected"] == "chronos-2" and e["error"] is None
    fc = forecasts["A:ORS"]
    assert fc["scenarios"]["draws"] == 1000 and fc["scenarios"]["independent_windows"] < 20
    test = [r for r in e["evaluation"] if r["split"] == "test" and r["model"] == "chronos-2"]
    assert test and all(r["calibration_origins"] < fc["scenarios"]["origins"] for r in test)
    assert test[-1]["coverage_80"] == 1
    assert origins[1:] == sorted(origins[1:])
    # Clinical metadata does not even invalidate the forecast cache.
    h = history()
    h["patient_load"] = 100000
    cached, _ = module.build_forecasts(h, state, "r2", directory=tmp_path)
    assert cached["A:ORS"]["source"] == "cached"


def test_loading_failure_never_silently_switches_model(monkeypatch, tmp_path):
    monkeypatch.setenv("INCEPTION_FORECAST", "chronos")

    def fail(*args, **kwargs):
        raise RuntimeError("model unavailable")

    monkeypatch.setattr(module, "chronos", fail)
    with pytest.raises(RuntimeError, match="model unavailable"):
        module.build_forecasts(history(60), state_with_stock(), "r", directory=tmp_path)


def test_bootstrap_preserves_whole_paths_and_is_reproducible():
    records = [
        {"start": "2026-01-01", "end": "2026-01-28", "residual": [10, -10] * 14},
        {"start": "2026-02-01", "end": "2026-02-28", "residual": [-10, 10] * 14},
    ]
    dist = path_distribution([20.0] * 28, records, "seed")
    assert dist == path_distribution([20.0] * 28, records, "seed")
    assert dist["paths"] == [[30, 10] * 14, [10, 30] * 14]
    assert sum(dist["weights"]) == pytest.approx(1)
    assert dist["independent_windows"] == 2
    assert path_distribution([20.0] * 28, [], "seed")["status"] == "unavailable"


def test_same_shortage_probability_can_hide_increased_severity():
    state = state_with_stock()
    fc = state["forecasts"]["A:ORS"]
    fc["scenarios"] = {
        "paths": [[40.0] * 7 + [0.0] * 21, [70.0] * 7 + [0.0] * 21],
        "weights": [0.95, 0.05],
        "draws": 1000,
        "origins": 2,
        "independent_windows": 2,
        "status": "limited_evidence",
    }
    before = inventory_distribution(list(state["batches"].values()), fc, NOW)
    after = inventory_distribution(list(state["batches"].values()), fc, NOW, removals={"b": 110})
    assert before["shortage_probability"] == after["shortage_probability"] == 0.05
    assert before["expected_unmet"] == 1.5 and after["expected_unmet"] == 7
    assert donor_safe(state, "A", "ORS", {"b": 40})
    assert not donor_safe(state, "A", "ORS", {"b": 110})


def test_expiry_rescue_can_coexist_with_later_shortage_without_harm():
    state = state_with_stock(100, 2)
    fc = state["forecasts"]["A:ORS"]
    risk = risk_for(state, fc)
    decision = search_decisions(state, {"A:ORS": risk})["A:ORS"]
    assert risk["expiry_units"] == 80 and risk["unmet"] > 0
    assert decision["kind"] == "donor_search" and decision["recipient_search"]
    assert expiry_donor_safe(state, "A", "ORS", {"b": 70})
    assert not expiry_donor_safe(state, "A", "ORS", {"b": 90})
    assert not donor_safe(state, "A", "ORS", {"b": 70})


def test_fixed_horizon_does_not_depend_on_supplier_delay():
    state = state_with_stock()
    before = donor_safe(state, "A", "ORS", {"b": 100})
    state["facilities"]["A"]["lead_days"] = 10000
    assert donor_safe(state, "A", "ORS", {"b": 100}) == before
    assert risk_for(state, state["forecasts"]["A:ORS"])["planning_horizon_days"] == 28


def test_expiry_simulation_uncertainty_and_reserved_stock():
    state = state_with_stock(120, 2)
    fc = state["forecasts"]["A:ORS"]
    fc["scenarios"] = {
        "paths": [[30.0] * 7, [39.0] * 7, [45.0] * 7, [70.0] * 7],
        "weights": [0.1, 0.6, 0.25, 0.05],
        "draws": 1000,
        "origins": 4,
        "independent_windows": 4,
        "status": "limited_evidence",
    }
    result = inventory_distribution(list(state["batches"].values()), fc, NOW)
    assert result["expected_waste"] == pytest.approx(38.7)
    state["batches"]["b"]["reserved"] = 120
    assert simulate(list(state["batches"].values()), [10], NOW)["unmet"] == 10


def test_cusum_accumulates_persistent_errors_and_skips_unknowns():
    reference = [-5, 0, 5] * 20
    assert not spike_monitor([0, 0, 0], reference)["alert"]
    assert spike_monitor([15, 20, 25], reference)["alert"]
    assert not spike_monitor([15, 20, None, 0], reference)["alert"]
    assert not spike_monitor([100], [])["alert"]


def test_uncertain_shortage_prompts_review_when_central_demand_is_covered():
    state = state_with_stock(460)
    fc = state["forecasts"]["A:ORS"]
    fc["scenarios"] = {
        "paths": [[10.0] * 28, [30.0] * 28],
        "weights": [0.5, 0.5],
        "draws": 1000,
        "origins": 2,
        "independent_windows": 2,
        "status": "limited_evidence",
    }
    risk = risk_for(state, fc)
    assert risk["stockout_days"] is None and risk["risk_review_required"]
    decision = search_decisions(state, {"A:ORS": risk})["A:ORS"]
    assert decision["kind"] == "risk_review"
    assert not decision["recipient_search"]


def test_inventory_only_csv_import_without_patient_fields_or_replenishment(store):
    import csv

    from inception.config import ROOT
    from inception.trio import csv_bytes, import_bundle, seed_trio

    seed_trio(store)
    with (ROOT / "demo-data/three-hospital/A-hospital.csv").open() as file:
        records = list(csv.DictReader(file))
    records = [
        {k: v for k, v in r.items() if k not in ("patient_load", "emergency_share", "lead_days")}
        for r in records
        if r["record_type"] != "replenishment"
    ]
    with store.transaction() as state:
        import_bundle(state, "A", csv_bytes(records))
    saved = store.read()["settings"]["onboarding"]["hospitals"]["A"]["observations"]
    assert len(saved) == 711
    assert all("patient_load" not in r and "emergency_share" not in r for r in saved)


def test_trailing_missing_days_preserve_forecast_start_date():
    h = history(30)
    end = h.date.max() + pd.Timedelta(days=3)
    g = module.prepare(h, end)
    assert len(g) == 33 and g.date.max() == end
    assert g.tail(3).imputed.all()
    assert not g.tail(3).complete.any()
    assert g.tail(3).target.tolist() == [40.0, 40.0, 40.0]
