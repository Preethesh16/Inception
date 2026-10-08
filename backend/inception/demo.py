import copy
from datetime import timedelta
import pandas as pd
from .config import DATA
from .engine import dt, batches_for, simulate, arrivals_for
from .transactions import require, movement, invalidate
from .store import emit


def advance(state, days, directory=DATA):
    require(
        not any(
            t["status"] in ("Reserved", "Assigned", "Picked up", "In transit")
            for t in state["transfers"].values()
        ),
        "Finish or cancel active deliveries before advancing days",
    )
    history = pd.read_csv(directory / "observations.csv")
    demo = state["settings"]["demo"]
    require(
        demo["day"] + days <= 240,
        "Observation replay ends at day 240; use outcome replay for the hidden future",
    )
    for _ in range(days):
        as_of = dt(demo["as_of"])
        for b in state["batches"].values():
            if dt(b["expires_at"]) <= as_of and b["quantity"]:
                movement(state, b, "expiry", -b["quantity"], "Expired during scenario replay")
                b["quantity"] = 0
        for a in state["replenishments"].values():
            if a["confirmed"] and a["status"] == "scheduled" and dt(a["arrives_at"]) <= as_of:
                b = {
                    "id": a["id"],
                    "facility_id": a["facility_id"],
                    "supply_id": a["supply_id"],
                    "quantity": a["quantity"],
                    "reserved": 0,
                    "expires_at": a["expires_at"],
                    "storage": a["storage"],
                    "unit": a["unit"],
                    "quarantined": False,
                    "lot": a["id"],
                }
                state["batches"][b["id"]] = b
                movement(state, b, "receipt", b["quantity"], "Confirmed supplier receipt")
                a["status"] = "received"
        for _, row in history[history.date == as_of.date().isoformat()].iterrows():
            remaining = int(row.quantity)
            for b in sorted(
                batches_for(state, row.facility_id, row.supply_id), key=lambda b: b["expires_at"]
            ):
                q = min(remaining, b["quantity"] - b["reserved"])
                if q:
                    b["quantity"] -= q
                    remaining -= q
                    movement(state, b, "consumption", -q, "Observed synthetic daily consumption")
            if remaining:
                emit(
                    state, "UNMET_DEMAND", {"supply_id": row.supply_id, "units": remaining}, [row.facility_id]
                )
        demo["day"] += 1
        demo["as_of"] = (as_of + timedelta(days=1)).isoformat()
    demo["phase"] = "surge" if demo["day"] >= 240 else "emerging"
    invalidate(state, "New observed consumption", start_workflow=True)
    emit(state, "SCENARIO_ADVANCED", {"as_of": demo["as_of"], "days": days})


def reconciliation(state):
    expected = {}
    for m in state["movements"].values():
        expected[m["batch_id"]] = expected.get(m["batch_id"], 0) + m["quantity"]
    discrepancies = [
        {"batch_id": b["id"], "ledger": expected.get(b["id"], 0), "balance": b["quantity"]}
        for b in state["batches"].values()
        if abs(expected.get(b["id"], 0) - b["quantity"]) > 1e-6
    ]
    opening = sum(m["quantity"] for m in state["movements"].values() if m["kind"] == "opening")
    consumed = -sum(m["quantity"] for m in state["movements"].values() if m["kind"] == "consumption")
    expired = -sum(m["quantity"] for m in state["movements"].values() if m["kind"] == "expiry")
    transit = sum(
        t["quantity"] for t in state["transfers"].values() if t["status"] in ("Picked up", "In transit")
    )
    adjustment = sum(m["quantity"] for m in state["movements"].values() if m["kind"] == "adjustment")
    supplier_receipts = sum(
        m["quantity"]
        for m in state["movements"].values()
        if m["kind"] == "receipt" and not m["id"].startswith("receive-")
    )
    on_hand = sum(b["quantity"] for b in state["batches"].values())
    residual = opening + supplier_receipts + adjustment - on_hand - transit - consumed - expired
    return {
        "balanced": not discrepancies and abs(residual) < 1e-6,
        "opening": opening,
        "supplier_receipts": supplier_receipts,
        "adjustments": adjustment,
        "on_hand": on_hand,
        "in_transit": transit,
        "consumed": consumed,
        "expired": expired,
        "residual": residual,
        "discrepancies": discrepancies,
    }


def outcomes(state, reveal=False):
    as_of = state["settings"]["demo"]["as_of"]
    if reveal:
        future = pd.read_csv(DATA / "observations.csv", parse_dates=["date"])
        future = future[
            (future.date >= pd.Timestamp(as_of).tz_localize(None))
            & (future.date < pd.Timestamp(as_of).tz_localize(None) + pd.Timedelta(days=28))
        ]
    without = copy.deepcopy(state)
    # Reconstruct the same decision-time stock as if lateral transfers never happened.
    for t in state["transfers"].values():
        if t["status"] in ("Picked up", "In transit", "Received"):
            for line in t["lines"]:
                without["batches"][line["batch_id"]]["quantity"] += line["quantity"]
                without["batches"].pop(f"received-{t['id']}-{line['batch_id']}", None)
        elif t["status"] in ("Reserved", "Assigned"):
            for line in t["lines"]:
                without["batches"][line["batch_id"]]["reserved"] -= line["quantity"]
    without["transfers"] = {}
    totals = {}
    for label, scenario in (("without", without), ("with", state)):
        unmet, waste, donor_days = 0.0, 0.0, 0
        for key, fc in state["forecasts"].items():
            fid, sid = key.split(":")
            demand = (
                future[(future.facility_id == fid) & (future.supply_id == sid)].quantity.tolist()[:28]
                if reveal
                else fc["planning"]
            )
            if not demand:
                continue
            sim = simulate(batches_for(scenario, fid, sid), demand, as_of, arrivals_for(scenario, fid, sid))
            unmet += sim["unmet"]
            waste += sim["waste"]
            if fid in {t["donor"] for t in state["transfers"].values()}:
                increments = [
                    sim["timeline"][i]["unmet"] - (sim["timeline"][i - 1]["unmet"] if i else 0)
                    for i in range(len(sim["timeline"]))
                ]
                donor_days += sum(v > 0 for v in increments)
        totals[label] = {
            "unmet_units": round(unmet),
            "expiry_units": round(waste),
            "donor_stockout_days": donor_days,
        }
    return {
        "basis": "Simulated realised outcomes on identical hidden future demand"
        if reveal
        else "Projected outcomes from current planning demand",
        "horizon_days": 28,
        "cutoff": as_of,
        **totals,
    }
