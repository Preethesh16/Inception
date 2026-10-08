from datetime import timedelta
import pytest
from inception.engine import allocate, dt
from inception.transactions import verify, DomainError


def steady(state):
    state["incidents"] = {}
    state["replenishments"] = {}
    state["transfers"] = {}
    expiry = (dt(state["settings"]["demo"]["as_of"]) + timedelta(days=70)).isoformat()
    for b in state["batches"].values():
        b.update(quantity=5000, reserved=0, expires_at=expiry, quarantined=False)
    for f in state["forecasts"].values():
        f.update(planning=[10.0] * 28, stress=[10.0] * 28, normal_daily=10)
    return state


def test_adequate_stock_does_not_search_or_negotiate(state):
    s = steady(state)
    result = allocate(s)
    assert all(d["kind"] == "none" for d in result["searches"].values())
    assert result["moves"] == [] and result["rejected"] == []


def test_locally_needed_expiry_is_not_surplus(state):
    s = steady(state)
    s["batches"]["A-ORS-01"].update(
        quantity=20, expires_at=(dt(s["settings"]["demo"]["as_of"]) + timedelta(days=4)).isoformat()
    )
    result = allocate(s)
    assert result["searches"]["A:ORS"]["kind"] == "none"
    assert result["moves"] == []


def test_unused_expiry_finds_forecast_supported_recipient_without_shortage(state):
    s = steady(state)
    s["batches"]["A-ORS-01"].update(
        quantity=200, expires_at=(dt(s["settings"]["demo"]["as_of"]) + timedelta(days=4)).isoformat()
    )
    result = allocate(s)
    assert result["searches"]["A:ORS"]["kind"] == "recipient_search"
    assert result["moves"]
    assert all(m["purpose"] == "expiry_rescue" and m["donor"] == "A" for m in result["moves"])
    assert sum(m["quantity"] for m in result["moves"]) <= 160
    assert all(m["before"] is None for m in result["moves"])
    m = result["moves"][0]
    n = {**m, "run_id": s["settings"]["demo"]["latest_run"]}
    verify(s, n)
    s["forecasts"][f"{m['recipient']}:ORS"]["planning"] = [0.0] * 28
    with pytest.raises(DomainError, match="shift expiry waste|Recipient cannot consume"):
        verify(s, n)


def test_unused_expiry_does_not_create_recipient_demand(state):
    s = steady(state)
    for f in s["forecasts"].values():
        if f["facility_id"] != "A":
            f.update(planning=[0.0] * 28, stress=[0.0] * 28, normal_daily=0)
    s["batches"]["A-ORS-01"].update(
        quantity=200, expires_at=(dt(s["settings"]["demo"]["as_of"]) + timedelta(days=4)).isoformat()
    )
    result = allocate(s)
    assert result["searches"]["A:ORS"]["kind"] == "recipient_search"
    assert result["moves"] == []
    assert any("No recipient can consume" in r["reason"] for r in result["rejected"])


def test_worker_records_search_gates_per_hospital(store):
    from inception.worker import enqueue, run_job

    job = enqueue(store)
    run_job(store, job)
    events = [
        e
        for e in store.recent_events(200)
        if e["run_id"] == job["id"] and e["type"] in ("SEARCH_COMPLETED", "SEARCH_SKIPPED")
    ]
    assert len(events) == len(store.read()["forecasts"])
    assert all(e["facilities"] == [e["details"]["facility_id"]] for e in events)
    assert all((e["type"] == "SEARCH_SKIPPED") == (e["details"]["kind"] == "none") for e in events)
