"""Validated demo onboarding, reproducible scenario controls and refresh scheduling."""

import copy
import csv
from datetime import timedelta
from .store import now, emit
from .engine import dt
from .transactions import require, movement, invalidate
from .config import ROOT

SCENARIOS = [
    {
        "id": "expiry",
        "title": "Expiry rescue",
        "description": "Kaveri has low ORS stock while Mandya holds stock expiring in four days. Transfer only what can be used safely.",
    },
    {
        "id": "baseline",
        "title": "Normal operations",
        "description": "Opening inventory and routine demand. Explain the forecast and reserve policy.",
    },
    {
        "id": "surge",
        "title": "Outbreak demand surge",
        "description": "Reveal three days of rising consumption. Follow detection, forecasts and competing requests.",
    },
    {
        "id": "delay",
        "title": "Supplier delay",
        "description": "Delay Kaveri’s ORS replenishment by 14 days. A shortage without an outbreak.",
    },
    {
        "id": "no-donor",
        "title": "No safe donor",
        "description": "Reveal the surge and quarantine outside-zone ORS stock. Show the unresolved deficit.",
    },
]


def rows(raw):
    require(len(raw) <= 2_000_000, "CSV exceeds 2 MB", 422)
    try:
        result = list(csv.DictReader(raw.decode("utf-8-sig").splitlines()))
        require(bool(result), "CSV is empty", 422)
        return result
    except UnicodeDecodeError:
        require(False, "CSV must be UTF-8", 422)


def onboard(state, who, inventory_raw, history_raw):
    require(who in ("A", "B", "D"), "Guided onboarding supports Kaveri and Mandya", 403)
    require(
        not state["settings"].get("onboarding", {}).get("hospitals", {}).get(who),
        "This hospital is already onboarded. Start a fresh onboarding demo to import again.",
    )
    require(
        state["settings"]["demo"]["day"] == 237, "Start a fresh onboarding demo before importing opening data"
    )
    require(not state["transfers"], "Start a fresh onboarding demo before replacing inventory")
    batches, observations, errors, seen = [], [], [], set()
    for i, row in enumerate(rows(inventory_raw), 2):
        try:
            assert row["facility_id"] == who, "Wrong hospital"
            supply = state["supplies"][row["supply_id"]]
            quantity = int(row["quantity"])
            assert quantity >= 0, "Quantity must be nonnegative"
            assert row["unit"] == supply["unit"] and row["storage"] == supply["storage"], (
                "Unit or storage mismatch"
            )
            assert dt(row["expires_at"]).tzinfo and dt(row["expires_at"]) > dt(
                state["settings"]["demo"]["as_of"]
            ), "Expiry must be after scenario start and include timezone"
            assert row["id"] not in seen, "Duplicate batch"
            assert row["id"] not in state["batches"] or state["batches"][row["id"]]["facility_id"] == who, (
                "Batch belongs to another hospital"
            )
            seen.add(row["id"])
            batches.append({**row, "quantity": quantity, "reserved": 0, "quarantined": False})
        except (KeyError, ValueError, AssertionError, TypeError) as exc:
            errors.append(f"Inventory row {i}: {str(exc) or 'Invalid data'}")
    seen = set()
    for i, row in enumerate(rows(history_raw), 2):
        try:
            assert row["facility_id"] == who, "Wrong hospital"
            assert row["supply_id"] in state["supplies"], "Unknown supply"
            date = dt(row["date"] + "T00:00:00+00:00")
            assert date < dt(state["settings"]["demo"]["as_of"]), "Future observations are not allowed"
            key = (row["supply_id"], row["date"])
            assert key not in seen, "Duplicate daily observation"
            seen.add(key)
            for k in ("quantity", "patient_load", "complete", "stockout_censored", "report_indicator"):
                row[k] = int(row[k])
                assert row[k] >= 0, f"Negative {k}"
            assert all(row[k] in (0, 1) for k in ("complete", "stockout_censored", "report_indicator")), (
                "Flags must be 0 or 1"
            )
            row["emergency_share"] = float(row["emergency_share"])
            assert 0 <= row["emergency_share"] <= 1, "Invalid emergency share"
            observations.append(row)
        except (KeyError, ValueError, AssertionError, TypeError) as exc:
            errors.append(f"Consumption row {i}: {str(exc) or 'Invalid data'}")
    require(not errors, "; ".join(errors[:12]), 422)
    require(
        {b["supply_id"] for b in batches} == set(state["supplies"]),
        "Inventory must cover all three supplies",
        422,
    )
    require(
        all(sum(r["supply_id"] == sid for r in observations) >= 28 for sid in state["supplies"]),
        "Provide at least 28 historical days per supply",
        422,
    )
    for b in state["batches"].values():
        if b["facility_id"] == who:
            movement(
                state,
                b,
                "adjustment",
                -b["quantity"],
                "Replace demonstration opening balance during onboarding",
            )
            b["quantity"] = 0
    for b in batches:
        state["batches"][b["id"]] = b
        movement(state, b, "receipt", b["quantity"], "Validated onboarding CSV")
    record = {
        "facility_id": who,
        "completed_at": now(),
        "batches": copy.deepcopy(batches),
        "observations": observations,
        "history_rows": len(observations),
    }
    state["settings"].setdefault("onboarding", {"hospitals": {}})["hospitals"][who] = record
    invalidate(state, "Hospital onboarding completed")
    emit(state, "HOSPITAL_ONBOARDED", {"batches": len(batches), "history_rows": len(observations)}, [who])
    return {k: v for k, v in record.items() if k not in ("batches", "observations")}


def schedule_refresh(store):
    """Wall-clock scheduling never advances the synthetic observation clock."""
    state = store.read()
    if not state["facilities"]:
        return
    config = state["settings"].get("refresh", {})
    if not config.get("enabled", True) or (config.get("next_at") and dt(config["next_at"]) > dt(now())):
        return
    from .worker import enqueue

    job = enqueue(store)
    with store.transaction() as s:
        config = s["settings"].setdefault("refresh", {"enabled": True, "interval_seconds": 300})
        config.update(
            last_check_at=now(),
            next_at=(dt(now()) + timedelta(seconds=config["interval_seconds"])).isoformat(),
            job_id=job["id"],
        )


def import_file(facility, kind):
    require(
        facility in ("A", "D") and kind in ("inventory", "consumption", "profile", "replenishments"),
        "Unknown demo file",
        404,
    )
    return ROOT / "demo-data" / facility / (kind + (".json" if kind == "profile" else ".csv"))


def start_scenario(store, name):
    from .seed import seed
    from .demo import advance

    require(name in {s["id"] for s in SCENARIOS}, "Unknown scenario", 422)
    previous = store.read()
    require(
        not any(
            t["status"] in ("Reserved", "Assigned", "Picked up", "In transit")
            for t in previous["transfers"].values()
        ),
        "Finish or cancel active deliveries before switching scenarios",
    )
    onboarding = copy.deepcopy(previous["settings"].get("onboarding", {"hospitals": {}}))
    refresh = copy.deepcopy(previous["settings"].get("refresh", {}))
    seed(store)
    with store.transaction() as state:
        state["settings"]["onboarding"] = onboarding
        if refresh:
            state["settings"]["refresh"] = refresh
        for record in onboarding["hospitals"].values():
            fid = record["facility_id"]
            for b in state["batches"].values():
                if b["facility_id"] == fid:
                    movement(state, b, "adjustment", -b["quantity"], "Restore onboarded starting inventory")
                    b["quantity"] = 0
            for b in copy.deepcopy(record["batches"]):
                state["batches"][b["id"]] = b
                movement(state, b, "receipt", b["quantity"], "Restore onboarded starting inventory")
        if name in ("surge", "no-donor"):
            advance(state, 3)
        if name == "expiry":
            for b in state["batches"].values():
                if b["facility_id"] == "A" and b["supply_id"] == "ORS":
                    target = min(b["quantity"], 30)
                    movement(
                        state,
                        b,
                        "adjustment",
                        target - b["quantity"],
                        "Expiry-rescue scenario: opening ORS shortage",
                    )
                    b["quantity"] = target
                if b["facility_id"] == "D" and b["supply_id"] == "ORS" and b["id"].endswith("01"):
                    b["expires_at"] = (dt(state["settings"]["demo"]["as_of"]) + timedelta(days=4)).isoformat()
                    emit(
                        state,
                        "BATCH_EXPIRY_SCENARIO_SET",
                        {"batch_id": b["id"], "expires_at": b["expires_at"]},
                        ["D"],
                    )
            invalidate(state, "Expiry rescue: low recipient stock and four-day donor batch")
        if name == "delay":
            for r in state["replenishments"].values():
                if r["facility_id"] == "A" and r["supply_id"] == "ORS":
                    r["arrives_at"] = (dt(r["arrives_at"]) + timedelta(days=14)).isoformat()
            invalidate(state, "Supplier delay: 14 days")
        if name == "no-donor":
            for b in state["batches"].values():
                if b["facility_id"] in ("D", "E", "F") and b["supply_id"] == "ORS":
                    b["quarantined"] = True
            invalidate(state, "Outside-zone ORS stock quarantined")
        state["settings"]["demo"]["scenario"] = name
        emit(state, "SCENARIO_SELECTED", {"scenario": name})
