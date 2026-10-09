"""Pre-approval negotiation: both parties must pass the real transfer checks."""
import copy

from .offer_review import review_offer
from .engine import simulate, batches_for, arrivals_for
from .transactions import approve, verify, DomainError


def negotiate_offer(committed, planned, proposal, pending_ids=()):
    """Find the largest feasible whole-pack offer within the allocator's limit.

    planned is a private simulation including earlier offers as reservations.
    Nothing in this function approves or reserves real hospital inventory.
    """
    review = review_offer(planned, proposal, proposal["quantity"])
    pack = planned["supplies"][proposal["supply_id"]]["pack_size"]

    def evaluate(quantity):
        candidate = copy.deepcopy(proposal)
        candidate.update(quantity=quantity, max_quantity=quantity, approvals=[])
        remaining, lines = quantity, []
        for line in proposal["max_lines"]:
            take = min(remaining, line["quantity"])
            if take:
                lines.append({**line, "quantity": take})
                remaining -= take
        if remaining or not quantity:
            return None
        candidate["lines"] = lines
        candidate["max_lines"] = copy.deepcopy(lines)
        trial = copy.deepcopy(planned)
        trial["negotiations"][candidate["id"]] = copy.deepcopy(candidate)
        try:
            # The offer must work on its own as well as alongside other offers.
            verify(committed, candidate)
            approve(trial, candidate["id"], candidate["donor"], candidate["version"])
            approve(trial, candidate["id"], candidate["recipient"], candidate["version"])
            # Later arrivals may displace earlier ones in FEFO order.
            for nid in pending_ids:
                verify(trial, trial["negotiations"][nid], reserved=True)
        except DomainError:
            return None
        return candidate, trial

    lo, hi = 0, review["recommended_quantity"] // pack
    best = None
    while lo < hi:
        middle = (lo + hi + 1) // 2
        result = evaluate(middle * pack)
        if result:
            lo, best = middle, result
        else:
            hi = middle - 1
    if not lo:
        return None, planned
    candidate, trial = best or evaluate(lo * pack)
    recipient, supply = candidate["recipient"], candidate["supply_id"]
    impact = simulate(batches_for(planned, recipient, supply),
                      planned["forecasts"][f"{recipient}:{supply}"]["planning"],
                      planned["settings"]["demo"]["as_of"],
                      arrivals_for(trial, recipient, supply))
    candidate["after"], candidate["remaining_unmet"] = impact["stockout_days"], impact["unmet"]
    candidate["recipient_review"] = review_offer(planned, candidate, candidate["quantity"])
    candidate["negotiation_check"] = {
        "offered_quantity": proposal["quantity"],
        "agreed_quantity": candidate["quantity"],
        "other_pending_offers": len(pending_ids),
        "reason": "Both hospitals passed forecast, protected reserve, expiry, handling and combined-offer checks. No stock has been reserved; both administrators must approve.",
    }
    return candidate, trial
