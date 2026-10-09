import copy
from datetime import timedelta
from inception.negotiation import negotiate_offer
from inception.engine import dt
from inception.store import now
from inception.transactions import approve


def setup(state):
    s = copy.deepcopy(state)
    s["incidents"], s["transfers"], s["replenishments"], s["negotiations"] = {}, {}, {}, {}
    for f in s["forecasts"].values():
        f.pop("scenarios", None)
        f.pop("spike_monitor", None)
        f.update(planning=[10.2] * 28, stress=[11.] * 28, normal_daily=10.)
    for b in s["batches"].values():
        b.update(quantity=5000, reserved=0, quarantined=False,
                 expires_at=(dt(s["settings"]["demo"]["as_of"]) + timedelta(days=70)).isoformat())
    s["batches"]["A-ORS-01"]["quantity"] = 0
    s["batches"]["A-ORS-02"]["quantity"] = 100
    return s


def offer(s, nid, quantity):
    return {"id": nid, "donor": "B", "recipient": "A", "supply_id": "ORS",
            "purpose": "shortage", "quantity": quantity, "max_quantity": quantity,
            "lines": [{"batch_id": "B-ORS-02", "quantity": quantity}],
            "max_lines": [{"batch_id": "B-ORS-02", "quantity": quantity}],
            "travel_hours": 1, "eta": (dt(s["settings"]["demo"]["as_of"]) + timedelta(hours=1)).isoformat(),
            "version": 1, "status": "Awaiting approvals", "approvals": [],
            "run_id": s["settings"]["demo"]["latest_run"], "created_at": now()}


def test_negotiation_reduces_offer_and_blocks_overlap_before_approval(state):
    s = setup(state)
    original = copy.deepcopy(s)
    first, planned = negotiate_offer(s, s, offer(s, "one", 250))
    assert first["quantity"] == 180
    assert first["approvals"] == [] and first["status"] == "Awaiting approvals"
    second, _ = negotiate_offer(s, planned, offer(s, "two", 10), ["one"])
    assert second is None
    assert s == original  # Simulated signatures must never touch actual state.
    s["negotiations"]["one"] = first
    approve(s, "one", "A", 1)
    approve(s, "one", "B", 1)
    assert s["negotiations"]["one"]["status"] == "Reserved"
    third, _ = negotiate_offer(s, s, offer(s, "three", 10))
    assert third is None


def test_negotiation_protects_donor_before_publishing(state):
    s = setup(state)
    s["batches"]["B-ORS-01"]["quantity"] = 0
    s["batches"]["B-ORS-02"]["quantity"] = 328  # 318 protected, only 10 releasable.
    proposed, _ = negotiate_offer(s, s, offer(s, "one", 180))
    assert proposed["quantity"] == 10
    s["batches"]["B-ORS-02"]["quantity"] = 318
    proposed, _ = negotiate_offer(s, s, offer(s, "two", 180))
    assert proposed is None
