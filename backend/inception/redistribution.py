"""Explicit forecast gates and expiry-driven recipient matching."""

import copy
import math
from datetime import timedelta

from .config import POLICY
from .engine import (
    arrivals_for,
    batches_for,
    donor_safe,
    dt,
    expiry_donor_safe,
    in_zone,
    recipient_safe,
    risk_for,
    simulate,
    travel_hours,
)


def search_decisions(state, risks):
    decisions = {}
    for key, r in risks.items():
        pack = state["supplies"][r["supply_id"]]["pack_size"]
        shortage = r["stockout_days"] is not None and r["unmet"] >= pack
        unused = sum(
            math.floor(q / pack) * pack for bid, q in r["batch_waste"].items() if bid in state["batches"]
        )
        expiry = unused >= pack
        surplus = (
            r.get("surplus_candidate_units", 0) >= pack and not shortage and not r.get("risk_review_required")
        )
        risk_review = bool(r.get("risk_review_required")) and not shortage
        recipient_search = expiry or (surplus and not risk_review)
        decisions[key] = {
            "facility_id": r["facility_id"],
            "supply_id": r["supply_id"],
            "kind": "donor_search"
            if shortage
            else "recipient_search"
            if recipient_search
            else "risk_review"
            if risk_review
            else "none",
            "recipient_search": recipient_search,
            "expiry_search": expiry,
            "risk_review_required": risk_review,
            "surplus_units": r.get("surplus_candidate_units", 0),
            "shortage_units": round(r["unmet"], 2),
            "unused_expiring_units": unused,
            "reason": "Forecasted unmet demand warrants a donor search."
            if shortage
            else "FEFO projection leaves expiring stock unused locally; look for forecast-supported recipient consumption."
            if expiry
            else "Inventory exceeds protected demand over the planning horizon; evaluate useful sharing."
            if surplus
            else "Central forecast is covered, but empirical shortage risk exceeds policy. Review uncertainty and surge scenarios before deciding additional stock; a simulation frequency alone does not establish a validated purchase quantity."
            if risk_review
            else "No pack-sized forecast shortage or transferable expiry exposure. No search or negotiation.",
        }
    return decisions


def expiry_matches(state, risks, decisions, existing):
    if not any(d.get("recipient_search") for d in decisions.values()):
        return [], []
    work = copy.deepcopy(state)
    moves, rejected = [], []
    as_of = state["settings"]["demo"]["as_of"]

    def apply(move):
        for line in move["lines"]:
            b = work["batches"][line["batch_id"]]
            b["quantity"] -= line["quantity"]
            identity = f"planned-{len(work['replenishments'])}-{b['id']}"
            work["replenishments"][identity] = {
                "id": identity,
                "facility_id": move["recipient"],
                "supply_id": move["supply_id"],
                "quantity": line["quantity"],
                "expires_at": b["expires_at"],
                "arrives_at": move["eta"],
                "confirmed": True,
                "status": "scheduled",
            }

    for move in existing:
        apply(move)
    for key, decision in decisions.items():
        if not decision.get("recipient_search"):
            continue
        donor, sid = decision["facility_id"], decision["supply_id"]
        if in_zone(work, donor, sid):
            rejected.append(
                {
                    "facility_id": donor,
                    "supply_id": sid,
                    "reason": "Expiry search stopped: donor is inside the active planning zone",
                }
            )
            continue
        pack = work["supplies"][sid]["pack_size"]
        for _ in range(10000):
            fc = work["forecasts"][key]
            before_donor = risk_for(work, fc)
            batches = sorted(batches_for(work, donor, sid), key=lambda b: (b["expires_at"], b["id"]))
            found = False
            for batch in batches:
                expiry_rescue = before_donor["batch_waste"].get(batch["id"], 0) >= pack
                if batch["quantity"] - batch.get("reserved", 0) < pack:
                    continue
                if not expiry_rescue and before_donor.get("surplus_candidate_units", 0) < pack:
                    continue
                for recipient in sorted(
                    work["facilities"],
                    key=lambda fid: (travel_hours(work["facilities"][donor], work["facilities"][fid]), fid),
                ):
                    if recipient == donor or f"{recipient}:{sid}" not in work["forecasts"]:
                        continue
                    # Never cycle stock through another donor in the same plan.
                    if any(m["donor"] == recipient and m["supply_id"] == sid for m in existing + moves):
                        continue
                    hours = travel_hours(work["facilities"][donor], work["facilities"][recipient])
                    eta = dt(as_of) + timedelta(hours=hours)
                    if dt(batch["expires_at"]) <= eta + timedelta(days=POLICY["residual_life_days"]):
                        continue
                    if batch["storage"] not in work["facilities"][recipient]["storage"] or not (
                        expiry_donor_safe if expiry_rescue else donor_safe
                    )(work, donor, sid, {batch["id"]: pack}):
                        continue
                    rfc = work["forecasts"][f"{recipient}:{sid}"]
                    before = risk_for(work, rfc)
                    if before["expiry_units"] > 0:
                        continue
                    incoming = {
                        "id": "expiry-candidate",
                        "quantity": pack,
                        "arrives_at": eta.isoformat(),
                        "expires_at": batch["expires_at"],
                    }
                    after = simulate(
                        batches_for(work, recipient, sid),
                        rfc["planning"],
                        as_of,
                        arrivals_for(work, recipient, sid),
                        [incoming],
                    )
                    after_donor = simulate(
                        batches_for(work, donor, sid),
                        fc["planning"],
                        as_of,
                        arrivals_for(work, donor, sid),
                        removals={batch["id"]: pack},
                    )
                    if (
                        after["consumed"].get(incoming["id"], 0) < pack - 1e-6
                        or after["waste"] > before["expiry_units"] + 1e-6
                        or (
                            expiry_rescue
                            and after_donor["waste"] > before_donor["expiry_units"] - pack + 1e-6
                        )
                        or not recipient_safe(work, recipient, sid, [incoming])
                        # Long-life transfers need demonstrated shortage benefit; do not just relocate surplus.
                        or (not expiry_rescue and before["unmet"] - after["unmet"] < pack - 1e-6)
                    ):
                        continue
                    move = {
                        "donor": donor,
                        "recipient": recipient,
                        "supply_id": sid,
                        "quantity": pack,
                        "lines": [{"batch_id": batch["id"], "quantity": pack}],
                        "travel_hours": hours,
                        "eta": eta.isoformat(),
                        "tier": before["tier"],
                        "before": before["stockout_days"],
                        "before_unmet": before["unmet"],
                        "after": after["stockout_days"],
                        "remaining_unmet": after["unmet"],
                        "purpose": "expiry_rescue" if expiry_rescue else "surplus_share",
                        "expiry_saved": pack if expiry_rescue else 0,
                        "reason": "Expiry rescue: donor forecast leaves this batch unused. Recipient forecast consumes the offered units before expiry without increasing waste. Removing these units does not increase donor unmet demand in any evaluated path."
                        if expiry_rescue
                        else "Share surplus within the planning horizon: recipient shortage decreases and donor demand scenarios remain protected.",
                    }
                    match = next(
                        (
                            m
                            for m in moves
                            if m["donor"] == donor
                            and m["recipient"] == recipient
                            and m["supply_id"] == sid
                            and m["purpose"] == move["purpose"]
                        ),
                        None,
                    )
                    apply(move)
                    if match:
                        match["quantity"] += pack
                        match["expiry_saved"] += move["expiry_saved"]
                        line = next((l for l in match["lines"] if l["batch_id"] == batch["id"]), None)
                        if line:
                            line["quantity"] += pack
                        else:
                            match["lines"].append({"batch_id": batch["id"], "quantity": pack})
                        match.update(after=after["stockout_days"], remaining_unmet=after["unmet"])
                    else:
                        moves.append(move)
                    found = True
                    break
                if found:
                    break
            if not found:
                break
        if not any(m["donor"] == donor and m["supply_id"] == sid for m in moves):
            rejected.append(
                {
                    "facility_id": donor,
                    "supply_id": sid,
                    "reason": "No recipient can consume the unused expiring stock while all donor, handling and shelf-life constraints hold",
                }
            )
    return moves, rejected
