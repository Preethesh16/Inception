from concurrent.futures import ThreadPoolExecutor
import pytest
from inception.transactions import counter, approve, transfer_action, DomainError, invalidate
from inception.demo import reconciliation


def offer(state):
    return next(
        n
        for n in state["negotiations"].values()
        if n["supply_id"] == "ORS" and n["status"] == "Awaiting approvals"
    )


def test_dual_approval_and_inventory_conservation(state):
    n = offer(state)
    donor_before = sum(b["quantity"] for b in state["batches"].values() if b["facility_id"] == n["donor"])
    approve(state, n["id"], n["recipient"], n["version"])
    assert not state["transfers"]
    approve(state, n["id"], n["donor"], n["version"])
    assert n["status"] == "Reserved"
    assert (
        sum(b["quantity"] for b in state["batches"].values() if b["facility_id"] == n["donor"])
        == donor_before
    )
    for action in ("claim", "pickup", "transit", "receive", "receive"):
        transfer_action(state, n["id"], action, "judge")
        assert reconciliation(state)["balanced"]
    assert len([m for m in state["movements"].values() if m["id"].startswith("receive-")]) == len(n["lines"])
    assert (
        sum(b["quantity"] for b in state["batches"].values() if b["facility_id"] == n["donor"])
        == donor_before - n["quantity"]
    )


def test_counteroffer_cap_round_limit_and_dedup(state):
    n = offer(state)
    old = n["quantity"]
    counter(state, n["id"], n["recipient"], old + 10)
    assert n["quantity"] == old
    counter(state, n["id"], n["recipient"], old + 10)
    assert n["round"] == 2
    counter(state, n["id"], n["recipient"], old + 20)
    with pytest.raises(DomainError):
        counter(state, n["id"], n["recipient"], old + 30)


def test_new_terms_clear_approvals(state):
    n = offer(state)
    approve(state, n["id"], n["recipient"], 1)
    counter(state, n["id"], n["recipient"], n["quantity"] - 10)
    assert n["version"] == 2 and n["approvals"] == []
    with pytest.raises(DomainError):
        approve(state, n["id"], n["donor"], 1)


def test_stale_or_unauthorized_approval_rejected(state):
    n = offer(state)
    with pytest.raises(DomainError):
        approve(state, n["id"], "C", 1)
    invalidate(state, "new report")
    with pytest.raises(DomainError):
        approve(state, n["id"], n["recipient"], 1)


def test_cancel_releases_reservations(state):
    n = offer(state)
    approve(state, n["id"], n["recipient"], 1)
    approve(state, n["id"], n["donor"], 1)
    transfer_action(state, n["id"], "cancel", "judge")
    assert all(b["reserved"] == 0 for b in state["batches"].values())
    assert reconciliation(state)["balanced"]


def test_no_double_reservation_under_concurrent_approval(store):
    initial = store.read()
    n = offer(initial)
    with store.transaction() as s:
        approve(s, n["id"], n["recipient"], 1)

    def do():
        with store.transaction() as s:
            return approve(s, n["id"], n["donor"], 1)["status"]

    with ThreadPoolExecutor(max_workers=2) as pool:
        results = list(pool.map(lambda _: do(), range(2)))
    assert results == ["Reserved", "Reserved"]
    s = store.read()
    assert len(s["transfers"]) == 1
    assert sum(s["batches"][l["batch_id"]]["reserved"] for l in n["lines"]) == n["quantity"]


def test_all_planned_transfers_can_be_committed(state):
    for n in list(state["negotiations"].values()):
        if n["status"] == "Awaiting approvals":
            approve(state, n["id"], n["recipient"], 1)
            approve(state, n["id"], n["donor"], 1)
    assert state["transfers"]
    assert reconciliation(state)["balanced"]


def test_original_fifteen_unit_limit():
    from inception.engine import simulate
    from datetime import datetime, timedelta, timezone

    asof = datetime(2026, 10, 8, tzinfo=timezone.utc)
    b = {"id": "Z", "quantity": 40, "reserved": 0, "expires_at": (asof + timedelta(days=20)).isoformat()}
    demand = [20 / 7] * 7
    demand[-1] += 5
    assert simulate([b], demand, asof.isoformat(), removals={"Z": 15})["unmet"] == 0
    assert simulate([b], demand, asof.isoformat(), removals={"Z": 20})["unmet"] == 5
