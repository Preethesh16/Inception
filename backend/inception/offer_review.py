"""Forecast-grounded shelf-life review of shared transfer terms."""

from datetime import timedelta
from .config import POLICY
from .engine import arrivals_for, batches_for, dt, simulate


def review_offer(state, proposal, quantity):
    fid, sid = proposal["recipient"], proposal["supply_id"]
    forecast = state["forecasts"].get(f"{fid}:{sid}")
    if not forecast:
        return {
            "recommended_quantity": 0,
            "reason": "Forecast unavailable; request fresh analysis",
            "batches": [],
        }
    as_of = state["settings"]["demo"]["as_of"]
    eta = dt(as_of) + timedelta(hours=proposal["travel_hours"])
    pack = state["supplies"][sid]["pack_size"]
    own = batches_for(state, fid, sid)
    arrivals = [
        a for a in arrivals_for(state, fid, sid) if not a["id"].startswith(f"incoming-{proposal['id']}-")
    ]
    before = simulate(own, forecast["planning"], as_of, arrivals)
    offered = []
    remaining = min(quantity, proposal["max_quantity"])
    for line in proposal["max_lines"]:
        batch = state["batches"].get(line["batch_id"])
        if not batch:
            continue
        amount = min(remaining, line["quantity"])
        if amount > 0:
            offered.append(
                {
                    "id": "offer-review-" + batch["id"],
                    "batch_id": batch["id"],
                    "quantity": amount,
                    "expires_at": batch["expires_at"],
                    "arrives_at": eta.isoformat(),
                }
            )
            remaining -= amount

    def evaluate(amount):
        incoming = []
        for batch in offered:
            take = min(amount, batch["quantity"])
            if take > 0:
                incoming.append({**batch, "quantity": take})
                amount -= take
        result = simulate(own, forecast["planning"], as_of, arrivals, incoming)
        acceptable = (
            amount == 0
            and result["waste"] <= before["waste"] + 1e-6
            and all(
                dt(b["expires_at"]) > eta + timedelta(days=POLICY["residual_life_days"])
                and result["consumed"].get(b["id"], 0) >= b["quantity"] - 1e-6
                for b in incoming
            )
        )
        return acceptable, result

    lo, hi = 0, int(sum(b["quantity"] for b in offered) // pack)
    while lo < hi:
        middle = (lo + hi + 1) // 2
        if evaluate(middle * pack)[0]:
            lo = middle
        else:
            hi = middle - 1
    _, offered_result = evaluate(sum(b["quantity"] for b in offered))
    recommended = lo * pack
    return {
        "proposal_id": proposal["id"],
        "recipient": fid,
        "supply_id": sid,
        "forecast_run_id": forecast["run_id"],
        "input_hash": forecast["input_hash"],
        "cutoff": forecast["cutoff"],
        "policy_version": POLICY["version"],
        "offered_quantity": quantity,
        "recommended_quantity": recommended,
        "pack_size": pack,
        "planning_7_days": round(sum(forecast["planning"][:7]), 2),
        "existing_usable_units": sum(
            max(0, b["quantity"] - b.get("reserved", 0)) for b in own if not b.get("quarantined")
        ),
        "additional_waste_if_accepted": round(max(0, offered_result["waste"] - before["waste"]), 3),
        "batches": [
            {
                "batch_id": b["batch_id"],
                "quantity": b["quantity"],
                "expires_at": b["expires_at"],
                "arrives_at": b["arrives_at"],
                "predicted_consumed": round(offered_result["consumed"].get(b["id"], 0), 3),
            }
            for b in offered
        ],
        "reason": "FEFO simulation includes own stock, reservations, confirmed arrivals and history-based planning demand; whole packs only, no additional expiry waste. Consumption beyond the forecast horizon is not assumed.",
    }
