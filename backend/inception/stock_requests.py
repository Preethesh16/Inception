"""Human-led requests, separate from automatic allocation."""
import copy
import uuid
from datetime import timedelta
from .engine import batches_for, donor_safe, dt, in_zone, travel_hours
from .offer_review import review_offer
from .store import now, emit
from .transactions import require, approve


def fresh(s, fid, sid):
    f = s["forecasts"].get(f"{fid}:{sid}")
    return f and s["runs"].get(f["run_id"], {}).get("revision") == s["settings"]["demo"]["revision"]


def donor_review(s, r, quantity=None):
    fid, sid = r["donor"], r["supply_id"]
    if s["supplies"][sid]["storage"] not in s["facilities"][r["recipient"]]["storage"]:
        return {"quantity": 0, "lines": [], "reason": "The requesting hospital cannot meet this product’s storage requirements."}
    if not fresh(s, fid, sid):
        return {"quantity": 0, "lines": [], "reason": "Wait for current forecast analysis before offering stock."}
    if in_zone(s, fid, sid):
        return {"quantity": 0, "lines": [], "reason": "This hospital is inside this product’s active planning zone."}
    hours = travel_hours(s["facilities"][fid], s["facilities"][r["recipient"]])
    eta = dt(s["settings"]["demo"]["as_of"]) + timedelta(hours=hours)
    from .config import POLICY
    lots = sorted((b for b in batches_for(s, fid, sid)
                   if dt(b["expires_at"]) > eta + timedelta(days=POLICY["residual_life_days"])),
                  key=lambda b: (b["expires_at"], b["id"]))
    pack = s["supplies"][sid]["pack_size"]
    def lines_for(amount):
        lines = []
        for b in lots:
            take = min(amount, ((b["quantity"] - b.get("reserved", 0)) // pack) * pack)
            if take:
                lines.append({"batch_id": b["id"], "quantity": take, "expires_at": b["expires_at"], "lot": b["lot"]})
                amount -= take
        return lines, amount
    lo, hi = 0, min(quantity if quantity is not None else r["requested"], r["requested"]) // pack
    while lo < hi:
        mid = (lo + hi + 1) // 2
        lines, remaining = lines_for(mid * pack)
        if not remaining and donor_safe(s, fid, sid, {l["batch_id"]: l["quantity"] for l in lines}):
            lo = mid
        else:
            hi = mid - 1
    lines, _ = lines_for(lo * pack)
    return {"quantity": lo * pack, "lines": lines, "eta": eta.isoformat(), "travel_hours": hours,
            "reason": "Earliest eligible expiry first; available stock excludes reservations and protects forecast demand and reserve."
            if lo else "No whole pack can be offered while protecting this hospital’s forecast demand and reserve."}


def proposal(s, r):
    f = s["forecasts"].get(f'{r["recipient"]}:{r["supply_id"]}')
    return {"id": "MR-" + r["id"], "donor": r["donor"], "recipient": r["recipient"],
            "supply_id": r["supply_id"], "quantity": r["offered"], "max_quantity": r["offered"],
            "lines": copy.deepcopy(r["lines"]), "max_lines": copy.deepcopy(r["lines"]),
            "eta": r["eta"], "travel_hours": r["travel_hours"], "purpose": "manual_request",
            "run_id": f["run_id"] if f else "", "version": r["version"], "round": 1,
            "status": "Awaiting approvals", "approvals": [], "created_at": now(),
            "reason": r["reason"], "before": None, "after": None, "remaining_unmet": 0,
            "messages": [], "agent_mode": "Forecast-grounded advisory review"}


def view(s, r):
    out = copy.deepcopy(r)
    if r["status"] in ("Requested", "Offered"):
        out["donor_review"] = donor_review(s, r)
    if r["status"] == "Offered":
        if fresh(s, r["recipient"], r["supply_id"]):
            out["recipient_review"] = review_offer(s, proposal(s, r), r["offered"])
        else:
            out["recipient_review"] = {"recommended_quantity": 0, "reason": "Wait for current forecast analysis."}
    return out


def create(s, who, body):
    require(who in s["facilities"], "Hospital login required", 403)
    require(body.donor in s["facilities"] and body.donor != who, "Choose another hospital", 422)
    require(body.supply_id in s["supplies"], "Unknown product", 422)
    require(body.quantity % s["supplies"][body.supply_id]["pack_size"] == 0, "Request whole packs", 422)
    require(all(fid in s["settings"].get("onboarding", {}).get("hospitals", {}) for fid in (who, body.donor)),
            "Both hospitals must be onboarded", 409)
    r = {"id": str(uuid.uuid4()), "recipient": who, "donor": body.donor, "supply_id": body.supply_id,
         "requested": body.quantity, "reason": body.reason, "status": "Requested", "version": 1,
         "created_at": now(), "messages": [{"actor": who, "text": body.reason, "at": now()}]}
    s["stock_requests"][r["id"]] = r
    emit(s, "MANUAL_STOCK_REQUESTED", {"request_id": r["id"]}, [who, body.donor])
    return r


def respond(s, who, rid, body):
    r = s["stock_requests"].get(rid)
    require(r is not None, "Request not found", 404)
    require(who in (r["recipient"], r["donor"]), "Request is private to its hospitals", 403)
    require(body.version == r["version"], "Request changed; review the latest version")
    require(r["status"] in ("Requested", "Offered"), "Request is already closed")
    if body.action == "offer":
        require(who == r["donor"], "Only the supplying hospital can offer", 403)
        require(body.quantity > 0 and body.quantity <= r["requested"], "Offer within the requested quantity", 422)
        require(body.quantity % s["supplies"][r["supply_id"]]["pack_size"] == 0, "Offer whole packs", 422)
        check = donor_review(s, r, body.quantity)
        require(check["quantity"] == body.quantity, check["reason"])
        r.update(offered=body.quantity, lines=check["lines"], eta=check["eta"],
                 travel_hours=check["travel_hours"], status="Offered", donor_review_at_offer=check)
    elif body.action == "accept":
        require(who == r["recipient"] and r["status"] == "Offered", "Only the requester can accept an offer", 403)
        require(fresh(s, who, r["supply_id"]) and fresh(s, r["donor"], r["supply_id"]), "Wait for current forecast analysis")
        for line in r["lines"]:
            require(s["batches"].get(line["batch_id"], {}).get("expires_at") == line["expires_at"],
                    "Offered batch expiry changed; ask the supplier for an updated offer")
        n = proposal(s, r)
        review = review_offer(s, n, r["offered"])
        if review["recommended_quantity"] < r["offered"]:
            require(len(body.override_reason.strip()) >= 10,
                    "Forecast suggests fewer units. Record why this exceptional need justifies accepting the offer.", 422)
            n["manual_override_reason"] = body.override_reason.strip()
        n["recipient_review"] = review
        n["messages"] = [
            {"actor": r["donor"], "type": "human offer", "at": now(), "quantity": r["offered"],
             "text": "Supplier confirmed these lots and quantity in the manual request."},
            {"actor": who, "type": "human acceptance", "at": now(), "quantity": r["offered"],
             "text": body.override_reason.strip() or "Requester accepted after reviewing forecast and expiry advice."},
        ]
        s["negotiations"][n["id"]] = n
        approve(s, n["id"], r["donor"], n["version"])
        approve(s, n["id"], who, n["version"])
        r.update(status="Accepted", transfer_id=n["id"], recipient_review_at_accept=review,
                 override_reason=body.override_reason.strip())
    elif body.action == "decline":
        r["status"] = "Declined"
    elif body.action == "cancel":
        require(who == r["recipient"], "Only the requester can cancel", 403)
        r["status"] = "Cancelled"
    r["version"] += 1
    r["messages"].append({"actor": who, "text": body.message or body.action, "at": now()})
    emit(s, "MANUAL_STOCK_REQUEST_UPDATED", {"request_id": rid, "status": r["status"]}, [r["donor"], r["recipient"]])
    return r
