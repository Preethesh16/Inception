import copy
import uuid
from datetime import timedelta, datetime, timezone
from .store import now, emit
from .config import POLICY
from .engine import donor_safe, usable, dt, batches_for, arrivals_for, simulate, in_zone


class DomainError(Exception):
    def __init__(self, message, status=409):
        self.message, self.status = message, status


def require(condition, message, status=409):
    if not condition:
        raise DomainError(message, status)


def invalidate(state, reason):
    state["settings"]["demo"]["revision"] += 1
    for n in state["negotiations"].values():
        if n["status"] in ("Awaiting approvals", "Negotiating", "Proposed"):
            n["status"] = "Needs re-evaluation"
            n["invalidated_reason"] = reason


def movement(state, batch, kind, quantity, reason, key=None):
    key = key or str(uuid.uuid4())
    if key in state["movements"]:
        return
    state["movements"][key] = {
        "id": key,
        "batch_id": batch["id"],
        "facility_id": batch["facility_id"],
        "supply_id": batch["supply_id"],
        "kind": kind,
        "quantity": quantity,
        "at": state["settings"]["demo"]["as_of"],
        "recorded_at": now(),
        "reason": reason,
    }


def relevant(n, actor):
    require(actor in (n["donor"], n["recipient"]), "This proposal belongs to another facility", 403)


def counter(state, id, actor, quantity):
    n = state["negotiations"].get(id)
    require(n is not None, "Proposal not found", 404)
    relevant(n, actor)
    require(n["status"] in ("Awaiting approvals", "Negotiating"), "Proposal is not open")
    require(
        quantity > 0 and quantity % state["supplies"][n["supply_id"]]["pack_size"] == 0,
        "Quantity must be a positive whole pack",
        422,
    )
    if any(
        m["type"] == "counterproposal" and m["actor"] == actor and m["quantity"] == quantity
        for m in n["messages"]
    ):
        return n
    require(
        n["round"] < POLICY["max_rounds"],
        "Three rounds reached. Accept the current offer or request a fresh analysis.",
    )
    n["round"] += 1
    n["messages"].append(
        {
            "actor": actor,
            "type": "counterproposal",
            "quantity": quantity,
            "at": now(),
            "text": f"Requested {quantity} units.",
        }
    )
    if quantity > n["max_quantity"]:
        n["messages"].append(
            {
                "actor": n["donor"],
                "type": "constraint",
                "quantity": n["quantity"],
                "at": now(),
                "text": f"Cannot offer {quantity}. The allocation limit is {n['max_quantity']} units; other recipients and donor coverage are protected. Current offer remains {n['quantity']}.",
            }
        )
    elif quantity != n["quantity"]:
        n["quantity"] = quantity
        remain, lines = quantity, []
        for line in n["max_lines"]:
            q = min(remain, line["quantity"])
            if q:
                lines.append({"batch_id": line["batch_id"], "quantity": q})
            remain -= q
        n["lines"] = lines
        n["version"] += 1
        n["approvals"] = []
        incoming = [
            {
                "id": f"impact-{line['batch_id']}",
                "quantity": line["quantity"],
                "expires_at": state["batches"][line["batch_id"]]["expires_at"],
                "arrives_at": n["eta"],
            }
            for line in n["lines"]
        ]
        impact = simulate(
            batches_for(state, n["recipient"], n["supply_id"]),
            state["forecasts"][f"{n['recipient']}:{n['supply_id']}"]["planning"],
            state["settings"]["demo"]["as_of"],
            arrivals_for(state, n["recipient"], n["supply_id"]),
            incoming,
        )
        n["after"], n["remaining_unmet"] = impact["stockout_days"], impact["unmet"]
    n["status"] = "Awaiting approvals"
    emit(
        state,
        "COUNTEROFFER_CREATED",
        {"requested": quantity, "offered": n["quantity"], "version": n["version"]},
        [n["donor"], n["recipient"]],
        n["run_id"],
        id,
    )
    return n


def verify(state, n, reserved=False):
    require(n["run_id"] in state["runs"], "Forecast evidence unavailable")
    as_of = state["settings"]["demo"]["as_of"]
    require(
        dt(as_of) - dt(state["runs"][n["run_id"]]["cutoff"]) < timedelta(days=1),
        "Forecast is stale; refresh before transfer",
    )
    require(not in_zone(state, n["donor"], n["supply_id"]), "Donor is inside active planning zone")
    supply = state["supplies"][n["supply_id"]]
    require(
        supply["storage"] in state["facilities"][n["recipient"]]["storage"],
        "Recipient cannot meet handling requirement",
    )
    working = copy.deepcopy(state) if reserved else state
    if reserved:
        for line in n["lines"]:
            working["batches"][line["batch_id"]]["reserved"] -= line["quantity"]
    removals, incoming = {}, []
    eta = dt(as_of) + timedelta(hours=n["travel_hours"])
    for line in n["lines"]:
        b = working["batches"][line["batch_id"]]
        require(usable(b, supply, as_of), "Batch no longer eligible")
        require(
            b["facility_id"] == n["donor"] and b["supply_id"] == n["supply_id"], "Batch identity mismatch"
        )
        require(b["quantity"] - b["reserved"] >= line["quantity"], "Stock already reserved or consumed")
        require(
            dt(b["expires_at"]) > eta + timedelta(days=POLICY["residual_life_days"]),
            "Insufficient residual shelf life",
        )
        removals[b["id"]] = line["quantity"]
        incoming.append(
            {
                "id": f"validate-{b['id']}",
                "quantity": line["quantity"],
                "expires_at": b["expires_at"],
                "arrives_at": eta.isoformat(),
            }
        )
    require(
        donor_safe(working, n["donor"], n["supply_id"], removals),
        "Transfer would compromise protected donor coverage",
    )
    fc = working["forecasts"][f"{n['recipient']}:{n['supply_id']}"]
    arrivals = arrivals_for(working, n["recipient"], n["supply_id"])
    if reserved:
        arrivals = [a for a in arrivals if not a["id"].startswith(f"incoming-{n['id']}-")]
    result = simulate(
        batches_for(working, n["recipient"], n["supply_id"]), fc["planning"], as_of, arrivals, incoming
    )
    require(
        all(result["consumed"].get(a["id"], 0) >= a["quantity"] - 1e-6 for a in incoming),
        "Recipient cannot consume the offered batch before expiry",
    )
    return eta.isoformat()


def approve(state, id, actor, version):
    n = state["negotiations"].get(id)
    require(n is not None, "Proposal not found", 404)
    relevant(n, actor)
    require(version == n["version"], "Terms changed; review the new proposal")
    if id in state["transfers"]:
        return n
    require(n["status"] == "Awaiting approvals", "Proposal needs fresh evaluation or is closed")
    require(
        datetime.now(timezone.utc) - dt(n["created_at"]) < timedelta(hours=24),
        "Proposal expired; request fresh analysis",
    )
    verify(state, n)
    if actor not in n["approvals"]:
        n["approvals"].append(actor)
    emit(
        state,
        "APPROVAL_RECORDED",
        {"actor": actor, "version": version},
        [n["donor"], n["recipient"]],
        n["run_id"],
        id,
    )
    if set(n["approvals"]) == {n["donor"], n["recipient"]}:
        eta = verify(state, n)
        for line in n["lines"]:
            b = state["batches"][line["batch_id"]]
            b["reserved"] += line["quantity"]
            movement(
                state,
                b,
                "reservation",
                0,
                f"Reserved {line['quantity']} units for {id}",
                f"reserve-{id}-{b['id']}",
            )
        n["status"] = "Reserved"
        state["transfers"][id] = {
            **copy.deepcopy(n),
            "status": "Reserved",
            "eta": eta,
            "courier": None,
            "updated_at": now(),
        }
        state["settings"]["demo"]["revision"] += 1
        emit(
            state,
            "TRANSFER_RESERVED",
            {"quantity": n["quantity"], "version": version},
            [n["donor"], n["recipient"]],
            n["run_id"],
            id,
        )
    return n


def transfer_action(state, id, action, actor):
    t = state["transfers"].get(id)
    require(t is not None, "Transfer not found", 404)
    require(actor == "judge" or actor in (t["donor"], t["recipient"]), "Transfer not visible", 403)
    status = t["status"]
    if action == "claim":
        require(actor == "judge", "Use courier demo controls", 403)
        if status == "Assigned":
            return t
        require(status == "Reserved", "Job is already claimed or unavailable")
        t.update(status="Assigned", courier="Demo courier 01")
    elif action == "pickup":
        require(actor in ("judge", t["donor"]), "Only the donor can release stock", 403)
        if status in ("Picked up", "In transit", "Received"):
            return t
        require(status == "Assigned", "Assign a courier first")
        t["eta"] = verify(state, t, reserved=True)
        for line in t["lines"]:
            b = state["batches"][line["batch_id"]]
            b["reserved"] -= line["quantity"]
            b["quantity"] -= line["quantity"]
            movement(
                state,
                b,
                "dispatch",
                -line["quantity"],
                f"In transit to {t['recipient']}",
                f"dispatch-{id}-{b['id']}",
            )
        t["status"] = "Picked up"
        emit(
            state,
            "DISPATCHED",
            {"quantity": t["quantity"], "eta": t["eta"]},
            [t["donor"], t["recipient"]],
            t["run_id"],
            id,
        )
    elif action == "transit":
        if status in ("In transit", "Received"):
            return t
        require(status == "Picked up", "Pickup must precede transit")
        t["status"] = "In transit"
    elif action == "receive":
        require(actor in ("judge", t["recipient"]), "Only the recipient can receive stock", 403)
        if status == "Received":
            return t
        require(status in ("Picked up", "In transit"), "Stock has not been picked up")
        for line in t["lines"]:
            original = state["batches"][line["batch_id"]]
            bid = f"received-{id}-{original['id']}"
            batch = {
                **original,
                "id": bid,
                "facility_id": t["recipient"],
                "quantity": line["quantity"],
                "reserved": 0,
                "quarantined": dt(original["expires_at"]) <= dt(state["settings"]["demo"]["as_of"]),
            }
            state["batches"][bid] = batch
            movement(
                state,
                batch,
                "receipt",
                line["quantity"],
                f"Received from {t['donor']} (simulated courier)",
                f"receive-{id}-{bid}",
            )
        t["status"] = "Received"
        emit(
            state,
            "RECEIVED",
            {"quantity": t["quantity"], "simulated": True},
            [t["donor"], t["recipient"]],
            t["run_id"],
            id,
        )
    elif action == "cancel":
        if status == "Cancelled":
            return t
        require(status in ("Reserved", "Assigned"), "Cannot cancel inventory already in transit")
        for line in t["lines"]:
            b = state["batches"][line["batch_id"]]
            b["reserved"] -= line["quantity"]
            movement(state, b, "release", 0, f"Released {line['quantity']} units", f"release-{id}-{b['id']}")
        t["status"] = "Cancelled"
    else:
        raise DomainError("Unknown transfer action", 422)
    t["updated_at"] = now()
    state["negotiations"][id]["status"] = t["status"]
    state["settings"]["demo"]["revision"] += 1
    emit(
        state,
        "TRANSFER_UPDATED",
        {"status": t["status"], "action": action},
        [t["donor"], t["recipient"]],
        t["run_id"],
        id,
    )
    return t


def expire_pending(state):
    """Expire uncommitted offers and release abandoned reservations without moving stock."""
    current_time = datetime.now(timezone.utc)
    for n in state["negotiations"].values():
        if n["status"] in ("Awaiting approvals", "Negotiating") and current_time - dt(
            n["created_at"]
        ) >= timedelta(hours=24):
            n["status"] = "Expired"
            emit(
                state,
                "PROPOSAL_EXPIRED",
                {"reason": "24-hour offer lifetime"},
                [n["donor"], n["recipient"]],
                n["run_id"],
                n["id"],
            )
    for t in state["transfers"].values():
        if t["status"] in ("Reserved", "Assigned") and current_time - dt(t["updated_at"]) >= timedelta(
            minutes=30
        ):
            transfer_action(state, t["id"], "cancel", "judge")
            t["status"] = "Expired"
            state["negotiations"][t["id"]]["status"] = "Expired"
            emit(
                state,
                "RESERVATION_EXPIRED",
                {"reason": "30-minute uncollected reservation lifetime"},
                [t["donor"], t["recipient"]],
                t["run_id"],
                t["id"],
            )
