"""Opt-in real OpenAI + Chronos integration test against a disposable database.

Run: .venv/bin/python scripts/test_live_agents.py --live
Uses the ignored local .env credentials; never prints them or touches the live DB.
"""

import argparse
import copy
import json
import os
import re
from pathlib import Path
import sys
import tempfile
import time

parser = argparse.ArgumentParser()
parser.add_argument("--live", action="store_true", help="Authorize real API calls for this test")
args = parser.parse_args()
if not args.live:
    parser.error("Use --live to run paid API integration checks")
root = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(root / "backend"))
directory = Path(tempfile.mkdtemp(prefix="inception-live-agents-"))
os.environ["INCEPTION_DATA_DIR"] = str(directory)
os.environ["INCEPTION_FORECAST"] = "auto"

from inception import trio
from inception.agent import answer, context
from inception.config import POLICY
from inception.demo import reconciliation
from inception.store import Store, now
from inception.transactions import counter, invalidate, movement
from inception.worker import enqueue, run_job

if not os.getenv("OPENAI_API_KEY"):
    raise SystemExit("Configure OPENAI_API_KEY in the ignored .env first")
started = time.monotonic()
store = Store()
# Generated import templates also stay in the disposable directory.
trio.ROOT = directory
trio.seed_trio(store)
with store.transaction() as state:
    trio.import_bundle(state, "A", (directory / "demo-data/three-hospital/A-hospital.csv").read_bytes())
    for b in state["batches"].values():
        if b["facility_id"] == "A" and b["supply_id"] == "ORS":
            movement(state, b, "adjustment", 10 - b["quantity"], "Isolated live-agent shortage test")
            b["quantity"] = 10
    invalidate(state, "Isolated live-agent shortage test")

print("Running fresh local forecasting and automatic hospital negotiations…", flush=True)
job = enqueue(store, force=True)
run_job(store, job)
state = store.read()
assert job["status"] == "completed", job["status"]
proposal = next(
    n
    for n in state["negotiations"].values()
    if n["recipient"] == "A" and n["supply_id"] == "ORS" and n["status"] == "Awaiting approvals"
)
briefings = [m for m in proposal["messages"] if m["type"] == "agent briefing"]
assert {m["actor"] for m in briefings} == {proposal["donor"], proposal["recipient"]}
assert all(m["mode"].startswith("OpenAI") for m in briefings), "An automatic agent fell back"
assert all(m["knowledge_refs"] and m["cited_sources"] for m in briefings)
report = {
    "at": now(),
    "database": str(directory / "inception.db"),
    "model": os.getenv("OPENAI_MODEL", "gpt-4.1-mini"),
    "forecast_models": sorted({f["model"] for f in state["forecasts"].values()}),
    "proposal": {
        k: proposal[k] for k in ("id", "donor", "recipient", "supply_id", "quantity", "max_quantity")
    },
    "automatic_briefings": briefings,
    "checks": {},
}

for actor in (proposal["recipient"], proposal["donor"]):
    own = context(state, actor)
    assert all(b["facility_id"] == actor for b in own["inventory"])
    assert all(f["facility_id"] == actor for f in own["forecast_evidence"])
    assert all(r["facility_id"] == actor for r in own["replenishments"])
    assert not any(m.get("briefing_for") not in (None, actor) for n in own["offers"] for m in n["messages"])
    print(f"Checking live scoped inventory and OKF tools for hospital {actor}…", flush=True)
    result = answer(
        store,
        actor,
        "Use read_own_position and read_operational_policy. Explain my own ORS stock, "
        "seven-day demand, batch expiry and protected reserve, then review proposal "
        + proposal["id"]
        + ". Cite the exact policy and proposal IDs. Do not change any terms or request analysis.",
        read_only=True,
    )
    assert result["mode"].startswith("OpenAI") and result["error"] is None
    assert {t["tool"] for t in result["traces"]} >= {"read_own_position", "read_operational_policy"}
    assert all(
        not d["id"].startswith("facility/") or d["id"].startswith(f"facility/{actor}/")
        for d in result["knowledge_refs"]
    )
    position = next(t["result"] for t in result["traces"] if t["tool"] == "read_own_position")
    assert {f["supply_id"] for f in position["forecast_evidence"]} == {"ORS"}
    if actor == proposal["donor"]:
        protected = position["forecast_evidence"][0]["donor_protection"]["protected_units"]
        numbers = [float(v.replace(",", "")) for v in re.findall(r"\d[\d,]*(?:\.\d+)?", result["answer"])]
        assert any(abs(v - protected) < 1 for v in numbers), (
            "Donor narrative omitted or misstated the computed reserve"
        )
    report["checks"]["scoped_" + actor] = result

pack = state["supplies"]["ORS"]["pack_size"]
unsafe = copy.deepcopy(store.read())
unsafe["_events"] = []
counter(unsafe, proposal["id"], "A", proposal["max_quantity"] + pack)
assert unsafe["negotiations"][proposal["id"]]["quantity"] <= proposal["max_quantity"]
report["checks"]["over_limit_backend_guard"] = unsafe["negotiations"][proposal["id"]]["messages"][-1]
before_batches = copy.deepcopy(store.read()["batches"])
target = max(pack, proposal["quantity"] - pack)
print("Testing a real model tool call for a feasible counteroffer…", flush=True)
result = answer(
    store,
    "A",
    f"For this synthetic integration test, explicitly call counterpropose_transfer "
    f"on {proposal['id']} with quantity {target}. I authorize this smaller whole-pack request. "
    "Explain the result; do not approve or request analysis.",
    automatic_ids={proposal["id"]},
)
assert result["mode"].startswith("OpenAI") and result["error"] is None
assert any(t["tool"] == "counterpropose_transfer" and "error" not in t["result"] for t in result["traces"])
assert store.read()["negotiations"][proposal["id"]]["quantity"] == target
assert store.read()["batches"] == before_batches and not store.read()["transfers"]
assert not store.read()["negotiations"][proposal["id"]]["approvals"]
report["checks"]["live_counteroffer"] = result

print("Testing that the donor reacts to changed own inventory, not old knowledge text…", flush=True)
donor = proposal["donor"]
with store.transaction() as state:
    for b in state["batches"].values():
        if b["facility_id"] == donor and b["supply_id"] == "ORS":
            movement(state, b, "adjustment", -b["quantity"], "Isolated inventory freshness check")
            b["quantity"] = 0
    invalidate(state, "Donor stock changed in isolated test")
fresh = context(store.read(), donor)
assert next(r for r in fresh["risks"] if r["supply_id"] == "ORS")["stock"] == 0
assert proposal["id"] not in {n["id"] for n in fresh["offers"]}
result = answer(
    store,
    donor,
    "Use read_own_position now. How much usable ORS stock do I currently have? "
    "Can I still donate the old offer? Use current records, not the earlier import profile. "
    "Do not request analysis or change any records.",
    read_only=True,
)
assert result["mode"].startswith("OpenAI") and result["error"] is None
positions = [t["result"] for t in result["traces"] if t["tool"] == "read_own_position"]
assert positions and next(r for r in positions[-1]["risks"] if r["supply_id"] == "ORS")["stock"] == 0
report["checks"]["live_inventory_change"] = result
report["ledger"] = reconciliation(store.read())
assert report["ledger"]["balanced"]
report["policy_version"] = POLICY["version"]
report["elapsed_seconds"] = round(time.monotonic() - started, 2)
report["passed"] = True
path = root / "artifacts/live-agent-test.json"
path.write_text(json.dumps(report, indent=2, default=str))
print(
    json.dumps(
        {
            "passed": True,
            "report": str(path),
            "proposal": report["proposal"],
            "forecast_models": report["forecast_models"],
            "elapsed_seconds": report["elapsed_seconds"],
        }
    ),
    flush=True,
)
