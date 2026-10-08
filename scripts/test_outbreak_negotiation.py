"""Opt-in isolated Chronos/OpenAI outbreak and expiry negotiation check."""

import argparse
import json
import os
from pathlib import Path
import sys
import tempfile
from datetime import timedelta

parser = argparse.ArgumentParser()
parser.add_argument("--live", action="store_true")
if not parser.parse_args().live:
    parser.error("Pass --live to authorize OpenAI test calls")
root = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(root / "backend"))
directory = Path(tempfile.mkdtemp(prefix="inception-outbreak-negotiation-"))
os.environ["INCEPTION_DATA_DIR"] = str(directory)
os.environ["INCEPTION_FORECAST"] = "auto"
from inception import api, trio
from inception.store import Store
from inception.worker import enqueue, run_job
from inception.agent import answer
from inception.engine import dt, in_zone
from inception.offer_review import review_offer
from inception.transactions import movement, invalidate
from fastapi.testclient import TestClient

key = os.environ.get("OPENAI_API_KEY")
assert key, "Configure local OPENAI_API_KEY"
os.environ["OPENAI_API_KEY"] = ""  # only the targeted final agent call uses the API
store = Store()
trio.ROOT = directory
trio.seed_trio(store)
api.store = store
client = TestClient(api.app)
with store.transaction() as s:
    trio.import_bundle(s, "A", (directory / "demo-data/three-hospital/A-hospital.csv").read_bytes())
    for b in s["batches"].values():
        if b["facility_id"] == "A" and b["supply_id"] == "ORS":
            movement(s, b, "adjustment", 10 - b["quantity"], "Isolated shortage test")
            b["quantity"] = 10
    invalidate(s, "Isolated shortage")
print("Running local forecasting before outbreak reports", flush=True)
run_job(store, enqueue(store, force=True))


def offers():
    return [
        n
        for n in store.read()["negotiations"].values()
        if n["recipient"] == "A" and n["supply_id"] == "ORS" and n["status"] == "Awaiting approvals"
    ]


before = offers()
assert before and before[0]["donor"] == "B"
for fid in ("A", "B"):
    r = client.post(
        "/outbreak-reports",
        headers={"X-Demo-Session": "demo-" + fid},
        json={
            "onset_at": store.read()["settings"]["demo"]["as_of"],
            "category": "Suspected outbreak",
            "supply_ids": ["ORS"],
            "additional_units": {"ORS": 140},
            "note": "Isolated dynamic routing test",
        },
    )
    assert r.status_code == 201, r.text
print("Reassessing both reports and donor exclusion", flush=True)
run_job(store, enqueue(store))
after = offers()
assert after and all(n["donor"] == "D" for n in after)
s = store.read()
assert in_zone(s, "A", "ORS") and in_zone(s, "B", "ORS") and not in_zone(s, "D", "ORS")
report = {
    "before_donors": [n["donor"] for n in before],
    "after_donors": [n["donor"] for n in after],
    "forecast_models": sorted({f["model"] for f in s["forecasts"].values()}),
}
# Isolated counteroffer scenario: keep the actual computed forecast, offer an
# existing batch with shortened shelf life and zero its recipient's additional
# need by supplying sufficient own stock. This must produce a smaller counter.
n = after[0]
with store.transaction() as s:
    n = s["negotiations"][n["id"]]
    offered = min(200, n["max_quantity"])
    n["quantity"] = offered
    bid = n["max_lines"][0]["batch_id"]
    n["max_lines"] = n["lines"] = [{"batch_id": bid, "quantity": offered}]
    n["max_quantity"] = offered
    s["batches"][bid]["expires_at"] = (dt(s["settings"]["demo"]["as_of"]) + timedelta(days=7)).isoformat()
    for b in s["batches"].values():
        if b["facility_id"] == "A" and b["supply_id"] == "ORS":
            b["quantity"] = 0
    stock = s["batches"]["A-ORS-01"]
    stock["quantity"] = int(sum(s["forecasts"]["A:ORS"]["planning"][:6]))
    stock["expires_at"] = (dt(s["settings"]["demo"]["as_of"]) + timedelta(days=6)).isoformat()
    s["replenishments"] = {k: r for k, r in s["replenishments"].items() if r["facility_id"] != "A"}
    n["round"] = 0
    expected = review_offer(s, n, offered)
    assert expected["recommended_quantity"] < offered, expected
os.environ["OPENAI_API_KEY"] = key
print("Asking real recipient agent to consult forecasting and counteroffer", flush=True)
result = answer(
    store,
    "A",
    f"The donor offers {offered} units on proposal {n['id']}. Call evaluate_received_offer with that quantity and read_operational_policy. If the engine recommends a positive smaller quantity, submit exactly that counteroffer. If zero, explain why it must be declined. Never approve.",
    automatic_ids={n["id"]},
)
assert result["mode"].startswith("OpenAI"), result["error"]
assert any(t["tool"] == "evaluate_received_offer" for t in result["traces"])
if expected["recommended_quantity"] > 0:
    assert store.read()["negotiations"][n["id"]]["quantity"] == expected["recommended_quantity"]
report["expiry_review"] = expected
report["agent"] = {k: result[k] for k in ("mode", "answer", "traces", "knowledge_refs")}
os.environ["OPENAI_API_KEY"] = ""
r = client.post("/auth/logout", headers={"X-Demo-Session": "demo-A"})
assert r.status_code == 200 and r.json()["reports_cleared"] == 2
assert not store.read()["reports"] and not store.read()["incidents"]
run_job(store, r.json()["job"])
assert not any(f["facility_id"] == "A" for f in store.read()["forecasts"].values())
report["logout_reports_cleared"] = True
out = root / "artifacts/outbreak-negotiation-live.json"
out.write_text(json.dumps(report, indent=2))
print("PASS: B → D routing, live forecast tool, expiry counteroffer, logout reset. Report:", out, flush=True)
