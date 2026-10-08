import copy
from datetime import timedelta
import pytest
from inception.engine import dt
from inception.offer_review import review_offer
from inception.transactions import counter, DomainError
from inception.agent import context


def offer(state):
    n = copy.deepcopy(next(n for n in state["negotiations"].values() if n["supply_id"] == "ORS"))
    state["negotiations"][n["id"]] = n
    n.update(
        quantity=200,
        max_quantity=200,
        round=0,
        status="Awaiting approvals",
        approvals=[n["donor"]],
        travel_hours=12,
    )
    bid = n["max_lines"][0]["batch_id"]
    n["max_lines"] = n["lines"] = [{"batch_id": bid, "quantity": 200}]
    state["batches"][bid]["expires_at"] = (
        dt(state["settings"]["demo"]["as_of"]) + timedelta(days=7)
    ).isoformat()
    for b in state["batches"].values():
        if b["facility_id"] == n["recipient"] and b["supply_id"] == "ORS":
            b["quantity"] = b["reserved"] = 0
    state["replenishments"] = {
        k: r for k, r in state["replenishments"].items() if r["facility_id"] != n["recipient"]
    }
    f = state["forecasts"][n["recipient"] + ":ORS"]
    f["planning"] = [20] * 28
    return n


def test_seven_day_200_offer_countered_to_130_from_live_forecast(state):
    n = offer(state)
    review = review_offer(state, n, 200)
    assert review["planning_7_days"] == 140
    assert review["recommended_quantity"] == 130  # half a day in transit
    assert review["batches"][0]["predicted_consumed"] == 130
    old_version = n["version"]
    counter(state, n["id"], n["donor"], 200)
    assert n["quantity"] == 130 and not n["approvals"] and n["version"] == old_version + 1
    assert n["recipient_review"]["forecast_run_id"]
    assert any(m["type"] == "forecast review" and "130" in m["text"] for m in n["messages"])
    assert context(state, n["recipient"])["offers"][0].get("offered_batches")


def test_offer_recomputes_when_usage_changes_and_respects_scope(state):
    n = offer(state)
    state["forecasts"][n["recipient"] + ":ORS"]["planning"] = [10] * 28
    assert review_offer(state, n, 200)["recommended_quantity"] == 60
    donor_context = context(state, n["donor"])
    assert all("recipient_forecast_review" not in o for o in donor_context["offers"])
    with pytest.raises(DomainError):
        counter(state, n["id"], "not-a-party", 200)


def test_zero_use_declines_without_creating_an_approval(state):
    n = offer(state)
    state["forecasts"][n["recipient"] + ":ORS"]["planning"] = [0] * 28
    counter(state, n["id"], n["donor"], 200)
    assert n["status"] == "Rejected" and not n["approvals"]


def test_existing_stock_and_confirmed_arrivals_reduce_the_offer(state):
    n = offer(state)
    own = next(
        b for b in state["batches"].values() if b["facility_id"] == n["recipient"] and b["supply_id"] == "ORS"
    )
    own["quantity"] = 20
    own["expires_at"] = (dt(state["settings"]["demo"]["as_of"]) + timedelta(days=2)).isoformat()
    assert review_offer(state, n, 200)["recommended_quantity"] == 120
    state["replenishments"]["review-arrival"] = {
        "id": "review-arrival",
        "facility_id": n["recipient"],
        "supply_id": "ORS",
        "quantity": 100,
        "confirmed": True,
        "status": "scheduled",
        "arrives_at": (dt(state["settings"]["demo"]["as_of"]) + timedelta(days=1)).isoformat(),
        "expires_at": (dt(state["settings"]["demo"]["as_of"]) + timedelta(days=5)).isoformat(),
    }
    # Arrival itself would expire unused; adding a transfer may not add waste.
    review = review_offer(state, n, 200)
    assert review["recommended_quantity"] < 120


def test_search_records_reason_when_one_pack_breaks_donor_reserve(state, monkeypatch):
    from inception import engine

    monkeypatch.setattr(engine, "donor_safe", lambda state, fid, sid, removals: not removals)
    result = engine.allocate(state)
    assert any(
        "protected demand and safety reserve" in r["reason"] and r.get("recipient_id")
        for r in result["rejected"]
    )
    assert len(result["rejected"]) == len({str(r) for r in result["rejected"]})
