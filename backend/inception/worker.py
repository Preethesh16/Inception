"""Durable single CPU worker. Forecasts are computed outside database write transactions."""

import copy
import math
import time
import traceback
import uuid
from .store import Store, now, emit
from .forecast import history_at, build_forecasts
from .engine import detect, allocate


def run_job(store, job):
    state = store.read()
    generation = state["settings"]["demo"]["generation"]
    revision = state["settings"]["demo"]["revision"]
    run_id = job["id"]
    if job.get("generation") != generation or job.get("revision") != revision:
        job.update(status="superseded", completed_at=now())
        store.update_job(job)
        return

    def progress(kind, detail):
        job["lease"] = now()
        store.update_job(job)
        store.emit(kind, detail, run_id=run_id)

    progress("ANALYSIS_STARTED", {"cutoff": state["settings"]["demo"]["as_of"]})
    history = history_at(state["settings"]["demo"]["as_of"], state=state)
    incidents = detect(history, state)
    state["incidents"] = {i["id"]: i for i in incidents}
    progress("INCIDENTS_EVALUATED", {"count": len(incidents), "statuses": [i["status"] for i in incidents]})
    forecasts, evaluation = build_forecasts(history, state, run_id, progress, force=job.get("force", False))
    state["forecasts"] = forecasts
    progress(
        "FORECAST_COMPLETED",
        {
            "model": evaluation["selected"],
            "source": next(iter(forecasts.values()))["source"],
            "validation": evaluation["evaluation"],
            "fallback_reason": evaluation["error"],
        },
    )
    result = allocate(state)
    with store.transaction() as current:
        if (
            current["settings"]["demo"]["generation"] != generation
            or current["settings"]["demo"]["revision"] != revision
        ):
            job.update(status="superseded", completed_at=now())
            emit(current, "ANALYSIS_SUPERSEDED", {"reason": "Inputs changed during analysis"}, run_id=run_id)
        else:
            current["incidents"] = state["incidents"]
            current["forecasts"] = forecasts
            current["runs"][run_id] = {
                "id": run_id,
                "status": "completed",
                "at": now(),
                "cutoff": state["settings"]["demo"]["as_of"],
                "revision": revision,
                "evaluation": evaluation,
            }
            current["allocations"][run_id] = {"id": run_id, **result}
            emit(
                current,
                "RISK_UPDATED",
                {"at_risk": sum(r["stockout_days"] is not None for r in result["risks"].values())},
                run_id=run_id,
            )
            emit(
                current,
                "ALLOCATION_CREATED",
                {
                    "moves": len(result["moves"]),
                    "deficits": result["deficits"],
                    "rejected": result["rejected"],
                },
                run_id=run_id,
            )
            for key, decision in result["searches"].items():
                emit(
                    current,
                    "SEARCH_SKIPPED" if decision["kind"] == "none" else "SEARCH_COMPLETED",
                    decision,
                    [decision["facility_id"]],
                    run_id,
                    key,
                )
            previous_run = current["runs"].get(current["settings"]["demo"].get("latest_run"), {})
            unchanged = previous_run.get("revision") == revision and "searches" in current["allocations"].get(
                previous_run.get("id"), {}
            )
            for old in [] if unchanged else current["negotiations"].values():
                if old["status"] in ("Awaiting approvals", "Negotiating", "Proposed"):
                    old["status"] = "Needs re-evaluation"
            for i, move in enumerate([] if unchanged else result["moves"]):
                id = f"N-{run_id[:8]}-{i + 1}"
                n = {
                    "id": id,
                    **move,
                    "max_quantity": move["quantity"],
                    "max_lines": copy.deepcopy(move["lines"]),
                    "run_id": run_id,
                    "revision": revision,
                    "agent_mode": "deterministic constrained negotiation; OpenAI explanations on request",
                    "version": 1,
                    "round": 1,
                    "status": "Awaiting approvals",
                    "approvals": [],
                    "policy_version": "1.0",
                    "messages": [],
                    "created_at": now(),
                }
                n["messages"] = [
                    {
                        "actor": move["recipient"],
                        "type": "request",
                        "quantity": move["quantity"]
                        if move.get("purpose") == "expiry_rescue"
                        else int(
                            math.ceil(
                                move["before_unmet"] / current["supplies"][move["supply_id"]]["pack_size"]
                            )
                            * current["supplies"][move["supply_id"]]["pack_size"]
                        ),
                        "text": f"Forecast-supported expiry rescue for {move['quantity']} units. {move['reason']}"
                        if move.get("purpose") == "expiry_rescue"
                        else f"Forecasted unmet demand is {move['before_unmet']:.0f} units. Request support for forecasted shortage. {move['reason']}",
                        "at": now(),
                    },
                    {
                        "actor": move["donor"],
                        "type": "counteroffer",
                        "quantity": move["quantity"],
                        "text": f"Offer {move['quantity']} units within the allocation limit. Protected donor demand and reserve retained.",
                        "at": now(),
                    },
                ]
                if move.get("purpose") == "expiry_rescue":
                    n["messages"][0].update(
                        actor=move["donor"],
                        type="expiry offer",
                        text=f"Offer {move['quantity']} units projected to expire unused locally. Donor stress demand and reserve remain protected.",
                    )
                    n["messages"][1].update(
                        actor=move["recipient"],
                        type="consumption check",
                        text=f"Our own history-based planning forecast can consume these {move['quantity']} units before expiry without increasing waste. This is an expiry-rescue proposal, not a claim of shortage. Administrator approval is required.",
                    )
                current["negotiations"][id] = n
                emit(
                    current,
                    "APPROVAL_REQUIRED",
                    {"quantity": move["quantity"], "supply_id": move["supply_id"], "reason": move["reason"]},
                    [move["recipient"], move["donor"]],
                    run_id,
                    id,
                )
            current["settings"]["demo"]["latest_run"] = run_id
            job.update(status="completed", completed_at=now())
    store.update_job(job)
    if job["status"] == "completed":
        from .agent import brief_new_proposals

        brief_new_proposals(store, run_id)


def enqueue(store, force=False):
    s = store.read()["settings"]["demo"]
    # Coalesce equivalent queued requests.
    for job in store.jobs():
        if (
            job["status"] in ("queued", "running")
            and job.get("generation") == s["generation"]
            and job.get("revision") == s["revision"]
            and (not force or job.get("force", False))
        ):
            return job
    job = {
        "id": str(uuid.uuid4()),
        "status": "queued",
        "created_at": now(),
        "generation": s["generation"],
        "revision": s["revision"],
        "force": force,
    }
    store.enqueue(job)
    store.emit("ANALYSIS_QUEUED", {"revision": s["revision"]}, run_id=job["id"])
    return job


def main():
    store = Store()
    last_cleanup = 0.0
    while True:
        if time.monotonic() - last_cleanup > 60:
            from .transactions import expire_pending

            with store.transaction() as state:
                expire_pending(state)
            last_cleanup = time.monotonic()
        from .onboarding import schedule_refresh

        schedule_refresh(store)
        job = store.claim_job()
        if job:
            try:
                run_job(store, job)
            except Exception as exc:
                traceback.print_exc()
                job.update(status="failed", error=str(exc)[:500], completed_at=now())
                store.update_job(job)
                store.emit("ANALYSIS_FAILED", {"error": str(exc)[:500]}, run_id=job["id"])
        else:
            time.sleep(1)


if __name__ == "__main__":
    main()
