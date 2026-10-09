import copy
from fastapi.testclient import TestClient
from inception import api
from inception.trio import seed_trio, import_bundle
from inception.config import ROOT
from inception.worker import enqueue, run_job


def ready(store, monkeypatch):
    seed_trio(store)
    with store.transaction() as s:
        import_bundle(s, "A", (ROOT / "demo-data/three-hospital/A-hospital.csv").read_bytes())
    run_job(store, enqueue(store))
    monkeypatch.setattr(api, "store", store)
    return TestClient(api.app)


def auth(fid):
    return {"X-Demo-Session": "demo-" + fid}


def test_request_private_review_reply_human_override_and_reservation(store, monkeypatch):
    client = ready(store, monkeypatch)
    original = copy.deepcopy(store.read()["batches"])
    created = client.post("/stock-requests", headers=auth("A"), json={
        "donor":"B", "supply_id":"ORS", "quantity":200, "reason":"Expected clinic activity not captured by the forecast"})
    assert created.status_code == 201
    rid = created.json()["id"]
    assert client.get("/stock-requests", headers=auth("D")).json() == []
    donor = client.get("/stock-requests", headers=auth("B")).json()[0]
    assert donor["donor_review"]["quantity"] == 200
    assert donor["donor_review"]["lines"]
    assert store.read()["batches"] == original
    url = f"/stock-requests/{rid}/respond"
    assert client.post(url, headers=auth("D"), json={"action":"offer","version":1,"quantity":200}).status_code == 403
    assert client.post(url, headers=auth("A"), json={"action":"offer","version":1,"quantity":200}).status_code == 403
    offered = client.post(url, headers=auth("B"), json={"action":"offer","version":1,"quantity":200,"message":"We can supply these lots"})
    assert offered.status_code == 200, offered.text
    assert store.read()["batches"] == original
    reviewed = client.get("/stock-requests", headers=auth("A")).json()[0]
    assert reviewed["recipient_review"]["recommended_quantity"] < 200
    assert client.post(url, headers=auth("A"), json={"action":"accept","version":2}).status_code == 422
    accepted = client.post(url, headers=auth("A"), json={
        "action":"accept","version":2,"override_reason":"Confirmed additional clinic demand requiring this stock"})
    assert accepted.status_code == 200, accepted.text
    s = store.read()
    transfer = s["transfers"][accepted.json()["transfer_id"]]
    assert set(transfer["approvals"]) == {"A","B"}
    assert transfer["status"] == "Reserved"
    assert sum(b["reserved"] for b in s["batches"].values()) == 200
    assert client.post(url, headers=auth("A"), json={"action":"accept","version":2}).status_code == 409
    assert client.post("/demo/finish", headers=auth("judge")).status_code == 200
    assert not store.read()["stock_requests"]


def test_reply_rechecks_stock_and_versions(store, monkeypatch):
    client=ready(store,monkeypatch)
    r=client.post("/stock-requests",headers=auth("A"),json={
        "donor":"B","supply_id":"ORS","quantity":200,"reason":"Exceptional need"}).json()
    url=f'/stock-requests/{r["id"]}/respond'
    assert client.post(url,headers=auth("B"),json={"action":"offer","version":0,"quantity":200}).status_code==409
    with store.transaction() as s:
        for b in s["batches"].values():
            if b["facility_id"]=="B" and b["supply_id"]=="ORS":
                b["quantity"]=0
    assert client.post(url,headers=auth("B"),json={"action":"offer","version":1,"quantity":200}).status_code==409
    assert not store.read()["transfers"]
    assert client.post(url,headers=auth("B"),json={"action":"decline","version":1,"message":"No available stock"}).status_code==200
