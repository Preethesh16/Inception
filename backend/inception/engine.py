"""Pure, deterministic inventory and allocation calculations. No language model decisions."""

import math
from datetime import datetime, timedelta
from itertools import pairwise

from .config import POLICY


def dt(value):
    return datetime.fromisoformat(value)


def distance(a, b):
    lat1, lat2 = math.radians(a["lat"]), math.radians(b["lat"])
    dlat, dlon = lat2 - lat1, math.radians(b["lng"] - a["lng"])
    h = math.sin(dlat / 2) ** 2 + math.cos(lat1) * math.cos(lat2) * math.sin(dlon / 2) ** 2
    return 6371 * 2 * math.asin(min(1, math.sqrt(h)))


def travel_hours(a, b):
    return round(0.5 + distance(a, b) * 1.3 / 35, 2)


def usable(batch, supply, as_of):
    return (
        not batch.get("quarantined")
        and batch["storage"] == supply["storage"]
        and batch.get("unit") == supply["unit"]
        and dt(batch["expires_at"]) > dt(as_of)
    )


def simulate(batches, demand, as_of, arrivals=(), incoming=(), removals=None):
    """Event-segment FEFO simulation: fractional-day arrivals/expiry, constant daily burn."""
    start = dt(as_of)
    stock = []
    for b in batches:
        if b.get("quarantined"):
            continue
        qty = max(0, b["quantity"] - b.get("reserved", 0) - (removals or {}).get(b["id"], 0))
        stock.append(
            {
                "id": b["id"],
                "qty": float(qty),
                "expiry": (dt(b["expires_at"]) - start).total_seconds() / 86400,
                "arrival": 0.0,
            }
        )
    for a in list(arrivals) + list(incoming):
        if not a.get("confirmed", True) or a.get("status") in ("received", "cancelled"):
            continue
        stock.append(
            {
                "id": a["id"],
                "qty": float(a["quantity"]),
                "expiry": (dt(a["expires_at"]) - start).total_seconds() / 86400,
                "arrival": max(0, (dt(a["arrives_at"]) - start).total_seconds() / 86400),
            }
        )
    consumed = {b["id"]: 0.0 for b in stock}
    wasted = {b["id"]: 0.0 for b in stock}
    unmet, first, timeline = 0.0, None, []
    for day, rate in enumerate(demand):
        points = sorted(
            set(
                [float(day), float(day + 1)]
                + [v for b in stock for v in (b["expiry"], b["arrival"]) if day < v < day + 1]
            )
        )
        for t, end in pairwise(points):
            for b in stock:
                if b["expiry"] <= t and b["arrival"] <= t and b["qty"] > 0:
                    wasted[b["id"]] += b["qty"]
                    b["qty"] = 0
            remaining = max(0, rate) * (end - t)
            satisfied = 0.0
            for b in sorted(stock, key=lambda x: (x["expiry"], x["id"])):
                if b["arrival"] > t or b["expiry"] <= t:
                    continue
                take = min(remaining, b["qty"])
                b["qty"] -= take
                remaining -= take
                satisfied += take
                consumed[b["id"]] += take
            if remaining > 1e-6:
                if first is None:
                    first = t + satisfied / rate if rate > 0 else t
                unmet += remaining
        timeline.append(
            {
                "day": day + 1,
                "stock": round(
                    sum(b["qty"] for b in stock if b["arrival"] < day + 1 and b["expiry"] > day + 1), 2
                ),
                "unmet": round(unmet, 2),
            }
        )
    for b in stock:
        if b["expiry"] <= len(demand) and b["arrival"] <= len(demand) and b["qty"] > 0:
            wasted[b["id"]] += b["qty"]
            b["qty"] = 0
    return {
        "stockout_days": round(first, 3) if first is not None else None,
        "unmet": round(unmet, 3),
        "waste": round(sum(wasted.values()), 3),
        "batch_waste": wasted,
        "consumed": consumed,
        "remaining": round(sum(b["qty"] for b in stock if b["arrival"] <= len(demand)), 3),
        "timeline": timeline,
    }


def detect(history, state):
    detected = []
    for (fid, sid), group in history.groupby(["facility_id", "supply_id"]):
        g = group.sort_values("date")
        g = g[(g.complete == 1) & (g.stockout_censored == 0)]
        evidence = []
        for _, row in g.tail(3).iterrows():
            previous = g[(g.date < row.date) & (g.date.dt.dayofweek == row.date.dayofweek)].tail(8)
            if len(previous) < 4:
                continue
            median = float(previous.quantity.median())
            mad = float((previous.quantity - median).abs().median())
            score = (float(row.quantity) - median) / max(1, 1.4826 * mad)
            if (
                score > POLICY["anomaly_score"]
                and row.quantity > median * POLICY["anomaly_ratio"]
                and row.quantity - median >= POLICY["anomaly_absolute"]
            ):
                evidence.append(
                    {
                        "date": row.date.isoformat(),
                        "quantity": int(row.quantity),
                        "baseline": round(median, 2),
                        "score": round(score, 2),
                    }
                )
        if (
            len(evidence) >= 2
            and (
                dt(state["settings"]["demo"]["as_of"]).replace(tzinfo=None) - g.iloc[-1].date.to_pydatetime()
            ).days
            <= 2
        ):
            detected.append(
                {"facility_id": fid, "supply_id": sid, "evidence": evidence, "status": "Detected"}
            )
    incidents = []
    as_of = dt(state["settings"]["demo"]["as_of"])
    active_reports = [
        r
        for r in state["reports"].values()
        if r["status"] == "active" and dt(r["onset_at"]) <= as_of < dt(r["expires_at"])
    ]
    for signal in detected:
        peers = [
            p
            for p in detected
            if p["supply_id"] == signal["supply_id"]
            and distance(state["facilities"][p["facility_id"]], state["facilities"][signal["facility_id"]])
            <= POLICY["cluster_km"]
        ]
        reports = [
            r
            for r in active_reports
            if r["facility_id"] == signal["facility_id"] and signal["supply_id"] in r["supply_ids"]
        ]
        ids = sorted({p["facility_id"] for p in peers})
        key = f"{signal['supply_id']}-{'-'.join(ids)}"
        if any(x["id"] == key for x in incidents):
            continue
        center = {
            "lat": sum(state["facilities"][f]["lat"] for f in ids) / len(ids),
            "lng": sum(state["facilities"][f]["lng"] for f in ids) / len(ids),
        }
        radius = max(distance(center, state["facilities"][f]) for f in ids) + POLICY["zone_buffer_km"]
        incidents.append(
            {
                "id": key,
                "supply_id": signal["supply_id"],
                "facilities": ids,
                "center": center,
                "radius_km": round(radius, 2),
                "status": "Corroborated signal" if len(peers) > 1 or reports else "Detected",
                "evidence": peers,
                "report_ids": [
                    r["id"]
                    for r in active_reports
                    if r["facility_id"] in ids and signal["supply_id"] in r["supply_ids"]
                ],
                "label": "Operational planning zone — not confirmed disease spread",
            }
        )
    for r in active_reports:
        for sid in r["supply_ids"]:
            if not any(r["facility_id"] in i["facilities"] and sid == i["supply_id"] for i in incidents):
                # Matching reports within 48 hours form a continuous operational
                # envelope, including distant reporting hospitals. This is not
                # a claim of confirmed disease spread between locations.
                peers = [
                    p
                    for p in active_reports
                    if sid in p["supply_ids"]
                    and abs((dt(p["onset_at"]) - dt(r["onset_at"])).total_seconds()) <= 48 * 3600
                ]
                ids = sorted({p["facility_id"] for p in peers})
                center = {
                    "lat": sum(state["facilities"][fid]["lat"] for fid in ids) / len(ids),
                    "lng": sum(state["facilities"][fid]["lng"] for fid in ids) / len(ids),
                }
                incidents.append(
                    {
                        "id": f"report-{'-'.join(ids)}-{sid}",
                        "supply_id": sid,
                        "facilities": ids,
                        "center": center,
                        "radius_km": round(
                            max(distance(center, state["facilities"][fid]) for fid in ids)
                            + POLICY["zone_buffer_km"],
                            2,
                        ),
                        "status": "Corroborated signal" if len(ids) > 1 else "Reported",
                        "evidence": [],
                        "report_ids": [p["id"] for p in peers],
                        "label": "Operational planning zone — reported evidence, not confirmed disease spread",
                    }
                )
    return incidents


def batches_for(state, fid, sid):
    return [
        b
        for b in state["batches"].values()
        if b["facility_id"] == fid
        and b["supply_id"] == sid
        and usable(b, state["supplies"][sid], state["settings"]["demo"]["as_of"])
    ]


def arrivals_for(state, fid, sid):
    result = [
        a for a in state["replenishments"].values() if a["facility_id"] == fid and a["supply_id"] == sid
    ]
    for t in state["transfers"].values():
        if (
            t["recipient"] == fid
            and t["supply_id"] == sid
            and t["status"] not in ("Received", "Cancelled", "Rejected", "Expired")
        ):
            for line in t["lines"]:
                b = state["batches"][line["batch_id"]]
                result.append(
                    {
                        "id": f"incoming-{t['id']}-{b['id']}",
                        "quantity": line["quantity"],
                        "expires_at": b["expires_at"],
                        "arrives_at": t["eta"],
                        "confirmed": True,
                    }
                )
    return result


def risk_for(state, forecast):
    fid, sid = forecast["facility_id"], forecast["supply_id"]
    as_of = state["settings"]["demo"]["as_of"]
    batches, arrivals = batches_for(state, fid, sid), arrivals_for(state, fid, sid)
    central = simulate(batches, forecast["planning"], as_of, arrivals)
    stress = simulate(batches, forecast["stress"], as_of, arrivals)
    # Fixed inventory planning horizon, independent of supplier delivery delays.
    from .uncertainty import inventory_distribution

    uncertainty = inventory_distribution(batches, forecast, as_of, arrivals)
    horizon = POLICY["planning_days"]
    protected = donor_protection(state, forecast)["protected_units"]
    stock = sum(b["quantity"] - b.get("reserved", 0) for b in batches)
    pack = state["supplies"][sid]["pack_size"]
    # Candidate only. Batch simulation and recipient usefulness determine actual release.
    surplus = max(0, math.floor((stock - protected) / pack) * pack)
    days = central["stockout_days"]
    supply = state["supplies"][sid]
    tier = (
        1
        if days is not None and days < 2 and supply["critical"] and not supply["alternative"]
        else (2 if days is not None and days < horizon else 3)
    )
    return {
        "id": f"{fid}:{sid}",
        "facility_id": fid,
        "supply_id": sid,
        "stock": sum(b["quantity"] - b.get("reserved", 0) for b in batches),
        "reserved": sum(b.get("reserved", 0) for b in batches),
        "demand_7": round(sum(forecast["planning"][:7])),
        "stockout_days": days,
        "stress_stockout_days": stress["stockout_days"],
        "expiry_units": round(central["waste"], 3),
        "uncertainty": uncertainty,
        "risk_review_required": uncertainty["available"]
        and (
            uncertainty["shortage_probability"] > POLICY["shortage_probability_limit"]
            or uncertainty["expected_unmet"] > pack * POLICY["expected_unmet_pack_limit"]
        ),
        "surplus_candidate_units": surplus,
        "planning_horizon_days": horizon,
        "surge_stress": {
            name: {k: result[k] for k in ("unmet", "stockout_days", "waste")}
            for name, path in forecast.get("surge_scenarios", {}).items()
            for result in [simulate(batches, path, as_of, arrivals)]
        },
        "batch_waste": central["batch_waste"],
        "unmet": central["unmet"],
        "tier": tier,
        "timeline": central["timeline"],
        "model": forecast["model"],
        "run_id": forecast["run_id"],
    }


def in_zone(state, fid, sid):
    return state.get("forecasts", {}).get(f"{fid}:{sid}", {}).get("spike_monitor", {}).get(
        "alert", False
    ) or any(
        i["supply_id"] == sid and distance(state["facilities"][fid], i["center"]) <= i["radius_km"]
        for i in state["incidents"].values()
    )


def donor_protection(state, forecast):
    """Exact reserve arithmetic shared by donor validation and agent evidence."""
    horizon = POLICY["planning_days"]
    supported = horizon <= POLICY["horizon"]
    stress_units = sum(forecast["stress"][:horizon]) if supported else None
    buffer = forecast["normal_daily"] * POLICY["donor_buffer_days"]
    return {
        "horizon_days": horizon,
        "supported": supported,
        "higher_path_units": stress_units,
        "normal_day_buffer_units": buffer,
        "protected_units": stress_units + buffer if supported else None,
        "note": "Protect the higher demand path plus a normal-demand unit buffer; do not describe this as an extra stress-coverage day. This requirement alone is not a transfer cap: batch expiry, arrivals, reservations and other recipients also constrain release.",
    }


def donor_safe(state, fid, sid, removals):
    fc = state["forecasts"].get(f"{fid}:{sid}")
    if not fc:
        return False
    protection = donor_protection(state, fc)
    horizon = protection["horizon_days"]
    if not protection["supported"]:
        return False
    demand = fc["stress"][:horizon].copy()
    demand[-1] += protection["normal_day_buffer_units"]
    sim = simulate(
        batches_for(state, fid, sid),
        demand,
        state["settings"]["demo"]["as_of"],
        arrivals_for(state, fid, sid),
        removals=removals,
    )
    from .uncertainty import inventory_distribution

    distribution = inventory_distribution(
        batches_for(state, fid, sid),
        fc,
        state["settings"]["demo"]["as_of"],
        arrivals_for(state, fid, sid),
        removals=removals,
    )
    budget = state["supplies"][sid]["pack_size"] * POLICY["expected_unmet_pack_limit"]
    return sim["unmet"] < 1e-6 and (
        not distribution["available"]
        or (
            distribution["shortage_probability"] <= POLICY["shortage_probability_limit"] + 1e-9
            and distribution["expected_unmet"] <= budget + 1e-9
        )
    )


def expiry_donor_safe(state, fid, sid, removals):
    """Permit expiry rescue despite a later deficit only if no evaluated path is harmed."""
    fc = state["forecasts"].get(f"{fid}:{sid}")
    if not fc:
        return False
    batches, arrivals = batches_for(state, fid, sid), arrivals_for(state, fid, sid)
    as_of = state["settings"]["demo"]["as_of"]
    for path in [fc["planning"], fc["stress"], *fc.get("scenarios", {}).get("paths", [])]:
        before = simulate(batches, path, as_of, arrivals)
        # Every offered unit must otherwise expire in EACH evaluated path.
        if any(before["batch_waste"].get(bid, 0) < qty - 1e-6 for bid, qty in removals.items()):
            return False
        after = simulate(batches, path, as_of, arrivals, removals=removals)
        if after["unmet"] > before["unmet"] + 1e-6:
            return False
    return True


def recipient_safe(state, fid, sid, incoming, arrivals=None):
    from .uncertainty import inventory_distribution

    fc = state["forecasts"][f"{fid}:{sid}"]
    batches = batches_for(state, fid, sid)
    arrivals = arrivals_for(state, fid, sid) if arrivals is None else arrivals
    as_of = state["settings"]["demo"]["as_of"]
    before = inventory_distribution(batches, fc, as_of, arrivals)
    after = inventory_distribution(batches, fc, as_of, arrivals, incoming)
    if not before["available"]:
        return True  # Legacy/offline forecasts retain deterministic checks.
    return (
        after["expected_waste"] <= before["expected_waste"] + 1e-6
        and after["expected_unmet"] <= before["expected_unmet"] + 1e-6
    )


def allocate(state):
    as_of = state["settings"]["demo"]["as_of"]
    risks = {key: risk_for(state, fc) for key, fc in state["forecasts"].items()}
    from .redistribution import expiry_matches, search_decisions

    searches = search_decisions(state, risks)
    moves, rejected, deficits = [], [], []
    demo = state["settings"]["demo"]
    if demo.get("mode") == "three-hospital" and not demo.get("workflow_started", False):
        for decision in searches.values():
            decision.update(kind="none", reason="Baseline imported. Start a demo by reporting demand or updating inventory.")
        return {"moves": [], "rejected": [], "deficits": [], "risks": risks, "searches": searches}

    for sid, supply in state["supplies"].items():
        recipients = [
            r for r in risks.values() if r["supply_id"] == sid and searches[r["id"]]["kind"] == "donor_search"
        ]
        if not recipients:
            continue
        incoming = {r["facility_id"]: [] for r in recipients}
        removed = {}
        candidates = []
        for fid in state["facilities"]:
            if in_zone(state, fid, sid):
                rejected.append(
                    {
                        "facility_id": fid,
                        "supply_id": sid,
                        "reason": "Inside active operational planning zone",
                    }
                )
                continue
            if risks.get(f"{fid}:{sid}", {}).get("stockout_days") is not None:
                rejected.append(
                    {
                        "facility_id": fid,
                        "supply_id": sid,
                        "reason": "Own projected shortage within the evaluated horizon",
                    }
                )
                continue
            if not donor_safe(state, fid, sid, {}):
                rejected.append(
                    {
                        "facility_id": fid,
                        "supply_id": sid,
                        "reason": "Protected demand and reserve leave no safe donation",
                    }
                )
                continue
            for b in batches_for(state, fid, sid):
                if b["quantity"] - b.get("reserved", 0) >= supply["pack_size"]:
                    candidates.append(b)
        blocked = set()
        for _ in range(10000):
            eligible = []
            for r in recipients:
                fid = r["facility_id"]
                if fid in blocked:
                    continue
                fc = state["forecasts"][f"{fid}:{sid}"]
                sim = simulate(
                    batches_for(state, fid, sid),
                    fc["planning"],
                    as_of,
                    arrivals_for(state, fid, sid),
                    incoming[fid],
                )
                if sim["unmet"] < supply["pack_size"] or sim["stockout_days"] is None:
                    continue
                eligible.append(
                    (
                        (r["tier"], sim["stockout_days"], -sim["unmet"], fid),
                        r,
                        sim,
                    )
                )
            if not eligible:
                break
            _, recipient, before = min(eligible, key=lambda x: x[0])
            fid = recipient["facility_id"]
            ordered = sorted(
                candidates,
                key=lambda b: (
                    travel_hours(state["facilities"][b["facility_id"]], state["facilities"][fid])
                    if state["settings"]["demo"].get("mode") == "three-hospital"
                    else 0,
                    -min(
                        supply["pack_size"], risks[f"{b['facility_id']}:{sid}"]["batch_waste"].get(b["id"], 0)
                    ),
                    travel_hours(state["facilities"][b["facility_id"]], state["facilities"][fid]),
                    b["expires_at"],
                    b["id"],
                ),
            )
            found = False

            def reject_batch(batch, reason, fid=fid, sid=sid):
                entry = {
                    "facility_id": batch["facility_id"],
                    "recipient_id": fid,
                    "supply_id": sid,
                    "batch_id": batch["id"],
                    "reason": reason,
                }
                if entry not in rejected:
                    rejected.append(entry)

            for b in ordered:
                if (
                    b["facility_id"] == fid
                    or b["quantity"] - b.get("reserved", 0) - removed.get(b["id"], 0) < supply["pack_size"]
                ):
                    continue
                hours = travel_hours(state["facilities"][b["facility_id"]], state["facilities"][fid])
                eta = dt(as_of) + timedelta(hours=hours)
                if dt(b["expires_at"]) <= eta + timedelta(days=POLICY["residual_life_days"]):
                    reject_batch(b, "Batch would arrive with insufficient remaining shelf life")
                    continue
                if b["storage"] not in state["facilities"][fid]["storage"]:
                    reject_batch(b, "Recipient cannot meet this batch's storage requirement")
                    continue
                proposal = {**removed, b["id"]: removed.get(b["id"], 0) + supply["pack_size"]}
                if not donor_safe(state, b["facility_id"], sid, proposal):
                    reject_batch(
                        b,
                        f"Cannot release another {supply['pack_size']}-unit pack: the donor would fall below its protected demand and safety reserve",
                    )
                    continue
                inc = {
                    "id": f"planned-{b['id']}-{fid}-{len(incoming[fid])}",
                    "quantity": supply["pack_size"],
                    "arrives_at": eta.isoformat(),
                    "expires_at": b["expires_at"],
                }
                fc = state["forecasts"][f"{fid}:{sid}"]
                after = simulate(
                    batches_for(state, fid, sid),
                    fc["planning"],
                    as_of,
                    arrivals_for(state, fid, sid),
                    incoming[fid] + [inc],
                )
                if (
                    after["consumed"].get(inc["id"], 0) < supply["pack_size"] - 1e-6
                    or after["unmet"] >= before["unmet"] - 1e-6
                    or after["waste"] > before["waste"] + 1e-6
                    or not recipient_safe(state, fid, sid, incoming[fid] + [inc])
                ):
                    reject_batch(
                        b,
                        "This batch would not reduce the recipient's shortage without leaving stock unused or increasing expiry waste",
                    )
                    continue
                removed = proposal
                incoming[fid].append(inc)
                match = next(
                    (
                        m
                        for m in moves
                        if m["donor"] == b["facility_id"] and m["recipient"] == fid and m["supply_id"] == sid
                    ),
                    None,
                )
                if match is None:
                    match = {
                        "purpose": "shortage",
                        "donor": b["facility_id"],
                        "recipient": fid,
                        "supply_id": sid,
                        "quantity": 0,
                        "lines": [],
                        "travel_hours": hours,
                        "eta": eta.isoformat(),
                        "tier": recipient["tier"],
                        "before": recipient["stockout_days"],
                        "before_unmet": recipient["unmet"],
                        "reason": f"Priority {recipient['tier']}; lowest coverage first, then unmet inventory demand. Donor demand scenarios and reserve protected.",
                    }
                    moves.append(match)
                line = next((line for line in match["lines"] if line["batch_id"] == b["id"]), None)
                if line:
                    line["quantity"] += supply["pack_size"]
                else:
                    match["lines"].append({"batch_id": b["id"], "quantity": supply["pack_size"]})
                match["quantity"] += supply["pack_size"]
                match["after"] = after["stockout_days"]
                match["remaining_unmet"] = after["unmet"]
                found = True
                break
            if not found:
                blocked.add(fid)
        for r in recipients:
            fid = r["facility_id"]
            fc = state["forecasts"][f"{fid}:{sid}"]
            final = simulate(
                batches_for(state, fid, sid),
                fc["planning"],
                as_of,
                arrivals_for(state, fid, sid),
                incoming[fid],
            )
            deficits.append(
                {
                    "facility_id": fid,
                    "supply_id": sid,
                    "unmet": round(final["unmet"]),
                    "action": "Expedite procurement for residual deficit"
                    if final["unmet"]
                    else "Covered within evaluated horizon",
                }
            )
    expiry_moves, expiry_rejected = expiry_matches(state, risks, searches, moves)
    moves.extend(expiry_moves)
    rejected.extend(expiry_rejected)
    # Each offer shows its own incremental effect, not the benefit of unrelated unapproved offers.
    for move in moves:
        fid, sid = move["recipient"], move["supply_id"]
        incoming = [
            {
                "id": f"impact-{line['batch_id']}",
                "quantity": line["quantity"],
                "expires_at": state["batches"][line["batch_id"]]["expires_at"],
                "arrives_at": move["eta"],
            }
            for line in move["lines"]
        ]
        own = simulate(
            batches_for(state, fid, sid),
            state["forecasts"][f"{fid}:{sid}"]["planning"],
            as_of,
            arrivals_for(state, fid, sid),
            incoming,
        )
        move["after"] = own["stockout_days"]
        move["remaining_unmet"] = own["unmet"]
    for deficit in deficits:
        fid, sid = deficit["facility_id"], deficit["supply_id"]
        planned = [
            {
                "id": f"final-{index}-{line['batch_id']}",
                "quantity": line["quantity"],
                "expires_at": state["batches"][line["batch_id"]]["expires_at"],
                "arrives_at": m["eta"],
            }
            for index, m in enumerate(moves)
            if m["recipient"] == fid and m["supply_id"] == sid
            for line in m["lines"]
        ]
        final = simulate(
            batches_for(state, fid, sid),
            state["forecasts"][f"{fid}:{sid}"]["planning"],
            as_of,
            arrivals_for(state, fid, sid),
            planned,
        )
        deficit.update(
            unmet=round(final["unmet"]),
            action="Expedite procurement for residual deficit"
            if final["unmet"]
            else "Covered within evaluated horizon",
        )
    return {"moves": moves, "rejected": rejected, "deficits": deficits, "risks": risks, "searches": searches}
