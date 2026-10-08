import copy
from datetime import timedelta
import pytest
from inception.engine import simulate, dt, donor_safe, allocate, detect, usable
from inception.demo import reconciliation
from inception.forecast import history_at, prepare

NOW = "2026-10-08T00:00:00+00:00"


def batch(q=20000, expiry=100):
    return {
        "id": "b",
        "quantity": q,
        "reserved": 0,
        "expires_at": (dt(NOW) + timedelta(days=expiry)).isoformat(),
        "quarantined": False,
    }


def test_rubric_arithmetic():
    assert simulate([batch()], [2000 / 7] * 80, NOW)["stockout_days"] == 70
    assert simulate([batch()], [5500 / 7] * 80, NOW)["stockout_days"] == pytest.approx(25.455, 0.001)


def test_expiry_is_consumption_aware():
    assert simulate([batch(20, 2)], [15] * 7, NOW)["waste"] == 0
    assert simulate([batch(50, 2)], [15] * 7, NOW)["waste"] == 20


def test_fractional_arrival_does_not_retroactively_cure_gap():
    arrival = {
        "id": "a",
        "quantity": 20,
        "arrives_at": (dt(NOW) + timedelta(hours=12)).isoformat(),
        "expires_at": (dt(NOW) + timedelta(days=10)).isoformat(),
    }
    s = simulate([batch(2)], [10], NOW, arrivals=[arrival])
    assert s["stockout_days"] == 0.2
    assert s["unmet"] == 3


def test_unconfirmed_orders_do_not_count():
    a = {
        "id": "a",
        "quantity": 100,
        "arrives_at": NOW,
        "expires_at": (dt(NOW) + timedelta(days=10)).isoformat(),
        "confirmed": False,
    }
    assert simulate([], [10], NOW, arrivals=[a])["unmet"] == 10


def test_reserved_and_quarantined_stock_not_consumed():
    b = batch(100)
    b["reserved"] = 90
    assert simulate([b], [20], NOW)["unmet"] == 10
    b["quarantined"] = True
    assert simulate([b], [20], NOW)["unmet"] == 20


def test_seed_reconciles(state):
    assert reconciliation(state)["balanced"]


def test_no_future_leakage(state):
    history = history_at(state["settings"]["demo"]["as_of"])
    assert history.date.max().isoformat() < state["settings"]["demo"]["as_of"]
    assert len(history) == 240 * 6 * 3


def test_anomaly_detects_cluster_not_isolated_spike(state):
    incidents = detect(history_at(state["settings"]["demo"]["as_of"]), state)
    cluster = next(i for i in incidents if i["supply_id"] == "ORS")
    assert cluster["status"] == "Corroborated signal"
    assert set(cluster["facilities"]) == {"A", "B"}
    assert not any(i["supply_id"] == "MSK" for i in incidents)


def test_missing_observations_imputed_causally(state):
    h = history_at(state["settings"]["demo"]["as_of"])
    g = prepare(h[(h.facility_id == "C") & (h.supply_id == "ORS")])
    assert g.imputed.sum() == 2
    assert all(g[g.imputed].target > 0)


def test_allocation_protects_donors_and_competing_recipients(state):
    result = allocate(state)
    assert result["moves"]
    ors = [m for m in result["moves"] if m["supply_id"] == "ORS"]
    assert {"A", "B"}.issubset({m["recipient"] for m in ors})
    assert not any(m["donor"] in ("A", "B", "C") for m in ors)
    for donor in {m["donor"] for m in result["moves"]}:
        for sid in state["supplies"]:
            removals = {}
            for m in result["moves"]:
                if m["donor"] == donor and m["supply_id"] == sid:
                    for line in m["lines"]:
                        removals[line["batch_id"]] = removals.get(line["batch_id"], 0) + line["quantity"]
            if removals:
                assert donor_safe(state, donor, sid, removals)
    assert allocate(state) == result


def test_no_donor_explicit_deficit(state):
    for b in state["batches"].values():
        if b["facility_id"] in ("D", "E", "F"):
            b["quarantined"] = True
    result = allocate(state)
    assert not [m for m in result["moves"] if m["supply_id"] == "ORS"]
    assert any(d["unmet"] > 0 for d in result["deficits"])


def test_unit_storage_rejection(state):
    b = copy.deepcopy(next(iter(state["batches"].values())))
    s = state["supplies"][b["supply_id"]]
    b["unit"] = "wrong"
    assert not usable(b, s, state["settings"]["demo"]["as_of"])
    b["unit"] = s["unit"]
    b["storage"] = "wrong"
    assert not usable(b, s, state["settings"]["demo"]["as_of"])
