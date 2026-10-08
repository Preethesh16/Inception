from fastapi.testclient import TestClient
from inception import api
from inception.trio import seed_trio
from inception.config import ROOT
from inception.worker import enqueue, run_job
from inception.demo import reconciliation
from inception.engine import in_zone
from inception.transactions import approve


def test_three_hospital_dynamic_rerouting(store, monkeypatch):
    seed_trio(store)
    monkeypatch.setattr(api, "store", store)
    client = TestClient(api.app)
    login = client.post("/auth/login", json={"email": "admin@kaveri.demo", "password": "wrong"})
    assert login.status_code == 401
    login = client.post("/auth/login", json={"email": "admin@kaveri.demo", "password": "Demo@2026"}).json()
    headers = {"X-Demo-Session": login["session"]}
    assert not client.get("/inventory", headers=headers).json()
    path = ROOT / "demo-data/three-hospital/A-hospital.csv"
    result = client.post(
        "/onboarding/csv", headers=headers, files={"file": ("hospital.csv", path.read_bytes(), "text/csv")}
    )
    assert result.status_code == 201, result.text
    assert result.json()["knowledge_source"] == "facility/A/onboarding"
    s = store.read()
    assert set(s["facilities"]) == {"A", "B", "D"}
    assert set(s["settings"]["onboarding"]["hospitals"]) == {"A", "B", "D"}
    assert reconciliation(s)["balanced"]
    for bid in ("A-ORS-01", "A-ORS-02"):
        b = store.read()["batches"][bid]
        response = client.post(
            "/inventory/batches/" + bid,
            headers=headers,
            json={
                "quantity": 10,
                "expires_at": b["expires_at"],
                "expected_quantity": b["quantity"],
                "expected_expiry": b["expires_at"],
                "command_id": "change-" + bid,
                "reason": "Demonstrate a low stock correction",
            },
        )
        assert response.status_code == 200, response.text
    run_job(store, enqueue(store))
    s = store.read()
    offers = [
        n
        for n in s["negotiations"].values()
        if n["status"] == "Awaiting approvals" and n["recipient"] == "A" and n["supply_id"] == "ORS"
    ]
    assert offers and offers[0]["donor"] == "B"
    for fid in ("A", "B"):
        r = client.post(
            "/outbreak-reports",
            headers={"X-Demo-Session": "demo-" + fid},
            json={
                "onset_at": s["settings"]["demo"]["as_of"],
                "category": "Suspected outbreak",
                "supply_ids": ["ORS"],
                "additional_units": {"ORS": 140},
                "note": "Synthetic demonstration",
            },
        )
        assert r.status_code == 201, r.text
    run_job(store, enqueue(store))
    s = store.read()
    assert in_zone(s, "A", "ORS") and in_zone(s, "B", "ORS") and not in_zone(s, "D", "ORS")
    assert any(set(i["facilities"]) == {"A", "B"} for i in s["incidents"].values())
    offers = [
        n
        for n in s["negotiations"].values()
        if n["status"] == "Awaiting approvals" and n["recipient"] == "A" and n["supply_id"] == "ORS"
    ]
    assert offers and all(n["donor"] == "D" for n in offers)
    visible = client.get("/negotiations", headers=headers).json()
    assert all(m.get("briefing_for") in (None, "A") for n in visible for m in n["messages"])
    with store.transaction() as state:
        n = offers[0]
        approve(state, n["id"], "A", n["version"])
        approve(state, n["id"], "D", n["version"])
    s = store.read()
    b = s["batches"][offers[0]["lines"][0]["batch_id"]]
    response = client.post(
        "/inventory/batches/" + b["id"],
        headers={"X-Demo-Session": "demo-D"},
        json={
            "quantity": 0,
            "expires_at": b["expires_at"],
            "expected_quantity": b["quantity"],
            "expected_expiry": b["expires_at"],
            "command_id": "unsafe-after-reservation",
            "reason": "Trying to edit reserved batch",
        },
    )
    assert response.status_code == 409
    assert reconciliation(store.read())["balanced"]


def test_bundle_failure_has_no_partial_inventory_or_knowledge(store, monkeypatch):
    seed_trio(store)
    monkeypatch.setattr(api, "store", store)
    client = TestClient(api.app)
    before = store.read()
    raw = (
        (ROOT / "demo-data/three-hospital/A-hospital.csv")
        .read_bytes()
        .replace(b"ambient", b"unknown-storage")
    )
    response = client.post(
        "/onboarding/csv", headers={"X-Demo-Session": "demo-A"}, files={"file": ("bad.csv", raw)}
    )
    assert response.status_code == 422
    after = store.read()
    assert after["batches"] == before["batches"] and after["settings"] == before["settings"]


def test_expiry_edit_is_audited_and_idempotent(store, monkeypatch):
    seed_trio(store)
    monkeypatch.setattr(api, "store", store)
    client = TestClient(api.app)
    b = store.read()["batches"]["D-ORS-01"]
    body = {
        "quantity": b["quantity"],
        "expires_at": "2026-10-06T00:00:00Z",
        "expected_quantity": b["quantity"],
        "expected_expiry": b["expires_at"],
        "command_id": "expiry-change-01",
        "reason": "Shorten expiry for demonstration",
    }
    for _ in range(2):
        r = client.post("/inventory/batches/" + b["id"], headers={"X-Demo-Session": "demo-D"}, json=body)
        assert r.status_code == 200, r.text
    assert store.read()["batches"][b["id"]]["expires_at"].startswith("2026-10-06")
    assert len([m for m in store.read()["movements"].values() if m["id"] == "expiry-change-01"]) == 1
    assert reconciliation(store.read())["balanced"]
