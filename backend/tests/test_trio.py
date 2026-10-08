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


def test_remove_hospital_import_clears_forecasts_and_preserves_partners(store, monkeypatch):
    import copy

    seed_trio(store)
    monkeypatch.setattr(api, "store", store)
    client = TestClient(api.app)
    raw = (ROOT / "demo-data/three-hospital/A-hospital.csv").read_bytes()
    result = client.post(
        "/onboarding/csv", headers={"X-Demo-Session": "demo-A"}, files={"file": ("A.csv", raw, "text/csv")}
    )
    assert result.status_code == 201, result.text
    run_job(store, enqueue(store))
    before = store.read()
    partners = {k: copy.deepcopy(v) for k, v in before["batches"].items() if v["facility_id"] != "A"}
    # A running job from before the removal must never resurrect A's data.
    stale = enqueue(store)
    response = client.delete("/onboarding/A", headers={"X-Demo-Session": "demo-judge"})
    assert response.status_code == 200, response.text
    snapshot = client.get("/snapshot", headers={"X-Demo-Session": "demo-A"}).json()
    assert snapshot["facility_supplies"]["A"] == []
    for key in ("supplies", "inventory", "forecasts", "risks", "negotiations", "movements", "replenishments"):
        assert snapshot[key] == [], key
    assert "A" not in store.read()["settings"]["facility_knowledge"]
    run_job(store, stale)
    run_job(store, response.json()["job"])
    after = store.read()
    assert not any(f["facility_id"] == "A" for f in after["forecasts"].values())
    assert set(f["facility_id"] for f in after["forecasts"].values()) == {"B", "D"}
    assert after["batches"] == partners
    assert reconciliation(after)["balanced"]
    assert client.delete("/onboarding/B", headers={"X-Demo-Session": "demo-A"}).status_code == 403
    # The same CSV can now be uploaded again as a fresh onboarding.
    result = client.post(
        "/onboarding/csv", headers={"X-Demo-Session": "demo-A"}, files={"file": ("A.csv", raw, "text/csv")}
    )
    assert result.status_code == 201, result.text
    run_job(store, result.json()["job"])
    assert len(client.get("/forecasts", headers={"X-Demo-Session": "demo-A"}).json()) == 3


def test_logout_resets_a_revokes_sessions_and_keeps_partner_logouts_non_destructive(store, monkeypatch):
    seed_trio(store)
    monkeypatch.setattr(api, "store", store)
    client = TestClient(api.app)

    def login_as(email):
        return {
            "X-Demo-Session": client.post(
                "/auth/login", json={"email": email, "password": "Demo@2026"}
            ).json()["session"]
        }

    a = login_as("admin@kaveri.demo")
    another_a = login_as("admin@kaveri.demo")
    raw = (ROOT / "demo-data/three-hospital/A-hospital.csv").read_bytes()
    client.post("/onboarding/csv", headers=a, files={"file": ("A.csv", raw)})
    run_job(store, enqueue(store))
    stale = enqueue(store)
    partners = {k: v for k, v in store.read()["batches"].items() if v["facility_id"] != "A"}
    assert client.post("/auth/logout").status_code == 401
    b = login_as("admin@chamundi.demo")
    before = store.read()["batches"]
    assert client.post("/auth/logout", headers=b).json()["reset"] is False
    assert store.read()["batches"] == before
    assert client.get("/snapshot", headers=b).status_code == 401
    assert client.post("/auth/logout", headers=a).json()["reset"] is True
    assert client.get("/snapshot", headers=another_a).status_code == 401
    run_job(store, stale)
    snapshot = client.get("/snapshot", headers={"X-Demo-Session": "demo-A"}).json()
    for key in ("inventory", "supplies", "forecasts", "risks", "negotiations", "transfers", "movements"):
        assert snapshot[key] == [], key
    assert store.read()["batches"] == partners
    assert reconciliation(store.read())["balanced"]
    a = login_as("admin@kaveri.demo")
    assert client.post("/onboarding/csv", headers=a, files={"file": ("A.csv", raw)}).status_code == 201


import pytest


@pytest.mark.parametrize("donor,recipient", [("B", "A"), ("A", "B")])
@pytest.mark.parametrize("status", ["Reserved", "Assigned", "Picked up", "In transit", "Received"])
def test_logout_reset_after_transfer_preserves_partner_stock_and_reconciles(store, donor, recipient, status):
    import copy
    from inception.trio import import_bundle, remove_import
    from inception.transactions import movement

    seed_trio(store)
    with store.transaction() as s:
        import_bundle(s, "A", (ROOT / "demo-data/three-hospital/A-hospital.csv").read_bytes())
        batch = s["batches"][donor + "-ORS-01"]
        t = {
            "id": "logout-test",
            "donor": donor,
            "recipient": recipient,
            "status": status,
            "quantity": 10,
            "lines": [{"batch_id": batch["id"], "quantity": 10}],
        }
        s["transfers"][t["id"]] = t
        if status in ("Reserved", "Assigned"):
            batch["reserved"] += 10
        else:
            batch["quantity"] -= 10
            movement(s, batch, "dispatch", -10, "Test transfer", "dispatch-logout-test-" + batch["id"])
        if status == "Received":
            received = {
                **copy.deepcopy(batch),
                "id": "received-logout-test",
                "facility_id": recipient,
                "quantity": 10,
                "reserved": 0,
            }
            s["batches"][received["id"]] = received
            movement(s, received, "receipt", 10, "Test receipt", "receive-logout-test-" + received["id"])
        assert reconciliation(s)["balanced"]
        partners = {k: v["quantity"] for k, v in s["batches"].items() if v["facility_id"] != "A"}
        remove_import(s, "A", logout_reset=True)
        assert {k: v["quantity"] for k, v in s["batches"].items()} == partners
        assert all(b["reserved"] == 0 for b in s["batches"].values())
        assert not s["transfers"]
        assert s["settings"]["logout_archives"][-1]["transfers"]
        assert reconciliation(s)["balanced"], reconciliation(s)
        import_bundle(s, "A", (ROOT / "demo-data/three-hospital/A-hospital.csv").read_bytes())
        assert reconciliation(s)["balanced"]


def test_two_reports_logout_clears_all_demo_reports_and_rebuilds_without_a(store, monkeypatch):
    seed_trio(store)
    monkeypatch.setattr(api, "store", store)
    client = TestClient(api.app)
    raw = (ROOT / "demo-data/three-hospital/A-hospital.csv").read_bytes()
    client.post("/onboarding/csv", headers={"X-Demo-Session": "demo-A"}, files={"file": ("A.csv", raw)})
    for fid in ("A", "B"):
        response = client.post(
            "/outbreak-reports",
            headers={"X-Demo-Session": "demo-" + fid},
            json={
                "onset_at": store.read()["settings"]["demo"]["as_of"],
                "category": "Suspected outbreak",
                "supply_ids": ["ORS"],
                "additional_units": {"ORS": 140},
                "note": "Logout reset regression",
            },
        )
        assert response.status_code == 201
    run_job(store, enqueue(store))
    assert in_zone(store.read(), "B", "ORS")
    response = client.post("/auth/logout", headers={"X-Demo-Session": "demo-A"})
    assert response.status_code == 200 and response.json()["reports_cleared"] == 2
    assert not store.read()["reports"] and not store.read()["incidents"]
    run_job(store, response.json()["job"])
    assert not in_zone(store.read(), "B", "ORS")
    assert not any(f["facility_id"] == "A" for f in store.read()["forecasts"].values())


def test_done_restores_all_three_hospitals_to_original_csv_stock(store, monkeypatch):
    from inception.trio import import_bundle

    seed_trio(store)
    monkeypatch.setattr(api, "store", store)
    with store.transaction() as s:
        import_bundle(s, "A", (ROOT / "demo-data/three-hospital/A-hospital.csv").read_bytes())
    original = store.read()["batches"]
    with store.transaction() as s:
        for b in s["batches"].values():
            b["quantity"] = 1
            b["expires_at"] = "2026-10-06T00:00:00Z"
        s["reports"]["test"] = {"facility_id": "B"}
        s["negotiations"]["test"] = {"status": "Received"}
        s["transfers"]["test"] = {"status": "Received"}
    client = TestClient(api.app)
    assert client.post("/demo/finish", headers={"X-Demo-Session": "demo-A"}).status_code == 403
    r = client.post("/demo/finish", headers={"X-Demo-Session": "demo-judge"})
    assert r.status_code == 200, r.text
    s = store.read()
    assert s["batches"] == original
    assert set(s["settings"]["onboarding"]["hospitals"]) == {"A", "B", "D"}
    assert not s["reports"] and not s["incidents"] and not s["negotiations"] and not s["transfers"]
    assert reconciliation(s)["balanced"]
    run_job(store, r.json()["job"])
    assert {f["facility_id"] for f in store.read()["forecasts"].values()} == {"A", "B", "D"}


def test_onboarding_and_refresh_have_no_approvals_until_demo_action(store, monkeypatch):
    seed_trio(store)
    monkeypatch.setattr(api, "store", store)
    client = TestClient(api.app)
    headers = {"X-Demo-Session": "demo-A"}
    raw = (ROOT / "demo-data/three-hospital/A-hospital.csv").read_bytes()
    response = client.post("/onboarding/csv", headers=headers, files={"file": ("A.csv", raw)})
    assert response.status_code == 201
    run_job(store, response.json()["job"])
    run_job(store, enqueue(store))
    state = store.read()
    assert state["forecasts"]
    assert not state["negotiations"]
    assert all(d["kind"] == "none" for d in state["allocations"][state["settings"]["demo"]["latest_run"]]["searches"].values())
    batch = state["batches"]["A-ORS-02"]
    response = client.post("/inventory/batches/A-ORS-02", headers=headers, json={
        "quantity": 0, "expires_at": batch["expires_at"],
        "expected_quantity": batch["quantity"], "expected_expiry": batch["expires_at"],
        "command_id": "start-demo", "reason": "Demonstrate demand gap",
    })
    assert response.status_code == 200
    run_job(store, enqueue(store))
    assert any(n["status"] == "Awaiting approvals" for n in store.read()["negotiations"].values())
    client.post("/auth/logout", headers=headers)
    response = client.post("/onboarding/csv", headers=headers, files={"file": ("A.csv", raw)})
    assert response.status_code == 201
    run_job(store, response.json()["job"])
    assert not any(n["status"] == "Awaiting approvals" for n in store.read()["negotiations"].values())
