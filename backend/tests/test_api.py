import pytest
from fastapi.testclient import TestClient
from inception import api


@pytest.fixture
def client(store, monkeypatch):
    monkeypatch.setattr(api, "store", store)
    return TestClient(api.app)


def headers(actor="A"):
    return {"X-Demo-Session": "demo-" + actor}


def test_scoped_inventory_and_auth(client):
    assert client.get("/inventory").status_code == 401
    rows = client.get("/inventory", headers=headers()).json()
    assert all(r["facility_id"] == "A" for r in rows)
    assert client.get("/dataset", headers=headers()).status_code == 403
    assert client.get("/allocation-plans", headers=headers()).status_code == 403


def test_bad_csv_is_atomic(client, store):
    initial = len(store.read()["batches"])
    text = "id,facility_id,supply_id,lot,quantity,expires_at,storage,unit\nnew,A,ORS,L1,10,2027-01-01T00:00:00Z,ambient,sachet\nbad,A,ORS,L2,-1,2027-01-01T00:00:00Z,ambient,sachet\n"
    result = client.post("/imports", headers=headers(), files={"file": ("test.csv", text, "text/csv")})
    assert result.status_code == 422
    assert len(store.read()["batches"]) == initial


def test_report_submission_is_scoped_and_invalidates(client, store):
    s = store.read()
    r = client.post(
        "/outbreak-reports",
        headers=headers(),
        json={
            "facility_id": "D",
            "onset_at": s["settings"]["demo"]["as_of"],
            "category": "Suspected surge",
            "supply_ids": ["ORS"],
            "additional_units": {},
        },
    )
    assert r.status_code == 201
    assert r.json()["report"]["facility_id"] == "A"
    assert all(n["status"] == "Needs re-evaluation" for n in store.read()["negotiations"].values())


def test_fallback_assistant_uses_own_evidence(client, monkeypatch):
    monkeypatch.delenv("OPENAI_API_KEY", raising=False)
    r = client.post(
        "/assistant/query", headers=headers(), json={"question": "What is my shortage risk?"}
    ).json()
    assert r["mode"] == "deterministic fallback"
    assert "A /" in r["answer"]
    assert "D /" not in r["answer"]


def test_duplicate_movement_does_not_apply_twice(client, store):
    body = {
        "batch_id": "A-ORS-02",
        "kind": "consumption",
        "quantity": -1,
        "reason": "test consumption",
        "idempotency_key": "repeatable-test-key",
    }
    initial = store.read()["batches"]["A-ORS-02"]["quantity"]
    assert client.post("/inventory/movements", headers=headers(), json=body).status_code == 200
    assert client.post("/inventory/movements", headers=headers(), json=body).status_code == 200
    assert store.read()["batches"]["A-ORS-02"]["quantity"] == initial - 1


def test_explicit_live_inference_bypasses_cache(client):
    result = client.post("/analysis-runs", headers=headers(), json={"force": True})
    assert result.status_code == 202
    assert result.json()["force"] is True


def test_network_map_shares_risk_levels_without_private_details(client, store, monkeypatch):
    def calculated_risk(state, forecast):
        fid = forecast["facility_id"]
        return {
            "facility_id": fid,
            "supply_id": forecast["supply_id"],
            "before_replenishment": fid == "A",
            "stockout_days": 1 if fid == "A" else None,
            "stress_stockout_days": 10 if fid == "B" else None,
        }
    monkeypatch.setattr(api, "risk_for", calculated_risk)
    result = client.get("/snapshot", headers=headers()).json()
    assert result["network_status"]["A"] == "high"
    assert result["network_status"]["B"] == "moderate"
    assert result["network_status"]["D"] == "adequate"
    assert all(r["facility_id"] == "A" for r in result["risks"])
    assert all(r["facility_id"] == "A" for r in result["inventory"])
    with store.transaction() as state:
        state["forecasts"] = {k: v for k, v in state["forecasts"].items() if v["facility_id"] != "D"}
    result = client.get("/snapshot", headers=headers()).json()
    assert result["network_status"]["D"] == "unknown"
