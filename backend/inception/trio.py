"""Three-facility, edit-driven local demonstration and single-file onboarding."""

import csv
import io
from datetime import timedelta
from .seed import seed
from .config import ROOT, DATA
from .store import emit
from .engine import dt
from .transactions import require
from .onboarding import onboard, rows

IDS = ("A", "B", "D")
EMAILS = {"A": "admin@kaveri.demo", "B": "admin@chamundi.demo", "D": "admin@mandya.demo"}
FIELDS = [
    "record_type",
    "facility_id",
    "id",
    "name",
    "area",
    "lat",
    "lng",
    "patient_load",
    "emergency_share",
    "lead_days",
    "supply_id",
    "unit",
    "pack_size",
    "storage",
    "lot",
    "quantity",
    "expires_at",
    "date",
    "complete",
    "stockout_censored",
    "report_indicator",
    "arrives_at",
    "confirmed",
]


def csv_bytes(records):
    out = io.StringIO()
    fields = list(dict.fromkeys(k for r in records for k in r))
    writer = csv.DictWriter(out, fieldnames=fields)
    writer.writeheader()
    writer.writerows(records)
    return out.getvalue().encode()


def bundle(state, fid, directory=DATA):
    records = [
        {
            "record_type": "profile",
            **{k: v for k, v in state["facilities"][fid].items() if k != "storage"},
            "facility_id": fid,
        }
    ]
    for s in state["supplies"].values():
        records.append(
            {
                "record_type": "supply",
                "facility_id": fid,
                "supply_id": s["id"],
                **{k: s[k] for k in ("name", "unit", "pack_size", "storage")},
            }
        )
    for b in state["batches"].values():
        if b["facility_id"] == fid:
            records.append(
                {
                    "record_type": "batch",
                    **{k: v for k, v in b.items() if k not in ("reserved", "quarantined")},
                }
            )
    history = list(csv.DictReader((directory / "observations.csv").open()))
    records += [
        {"record_type": "consumption", **r}
        for r in history
        if r["facility_id"] == fid and r["date"] < state["settings"]["demo"]["as_of"][:10]
    ]
    for r in state["replenishments"].values():
        if r["facility_id"] == fid:
            records.append(
                {
                    "record_type": "replenishment",
                    **{k: v for k, v in r.items() if k != "status"},
                    "confirmed": int(r["confirmed"]),
                }
            )
    return csv_bytes(records)


def import_bundle(state, fid, raw):
    records = rows(raw)
    require(
        all(r.get("facility_id") == fid for r in records),
        "All CSV rows must belong to your logged-in hospital",
        422,
    )
    require(
        all(
            r.get("record_type") in ("profile", "supply", "batch", "consumption", "replenishment")
            for r in records
        ),
        "Unknown record_type",
        422,
    )
    profiles = [r for r in records if r["record_type"] == "profile"]
    require(len(profiles) == 1, "CSV requires exactly one profile row", 422)
    try:
        p = profiles[0]
        profile = {
            "id": fid,
            "name": p["name"].strip(),
            "area": p["area"].strip(),
            "lat": float(p["lat"]),
            "lng": float(p["lng"]),
            "patient_load": int(p["patient_load"]),
            "emergency_share": float(p["emergency_share"]),
            "lead_days": int(p["lead_days"]),
            "storage": ["ambient", "dry"],
        }
        require(
            bool(profile["name"])
            and -90 <= profile["lat"] <= 90
            and -180 <= profile["lng"] <= 180
            and profile["patient_load"] > 0
            and 0 <= profile["emergency_share"] <= 1
            and 1 <= profile["lead_days"] <= 28,
            "Invalid facility profile",
            422,
        )
        definitions = [r for r in records if r["record_type"] == "supply"]
        require(
            len(definitions) == len(state["supplies"])
            and {r["supply_id"] for r in definitions} == set(state["supplies"]),
            "CSV requires one definition per supported supply",
            422,
        )
        for row in definitions:
            s = state["supplies"][row["supply_id"]]
            require(
                row["unit"] == s["unit"]
                and row["storage"] == s["storage"]
                and int(row["pack_size"]) == s["pack_size"],
                "Supply definitions must match enforced units, packs and handling",
                422,
            )
        arrivals = []
        seen = set()
        for r in (r for r in records if r["record_type"] == "replenishment"):
            supply = state["supplies"][r["supply_id"]]
            quantity = int(r["quantity"])
            require(
                r["id"] not in seen
                and (
                    r["id"] not in state["replenishments"]
                    or state["replenishments"][r["id"]]["facility_id"] == fid
                ),
                "Invalid or duplicate replenishment id",
                422,
            )
            seen.add(r["id"])
            require(
                quantity >= 0 and r["unit"] == supply["unit"] and r["storage"] == supply["storage"],
                "Invalid replenishment quantity, unit or storage",
                422,
            )
            require(
                dt(r["arrives_at"]).tzinfo is not None
                and dt(r["expires_at"]).tzinfo is not None
                and dt(r["arrives_at"]) >= dt(state["settings"]["demo"]["as_of"])
                and dt(r["expires_at"]) > dt(r["arrives_at"]),
                "Invalid replenishment dates",
                422,
            )
            require(r["confirmed"] in ("0", "1"), "confirmed must be 0 or 1", 422)
            arrivals.append(
                {
                    k: r[k]
                    for k in ("id", "facility_id", "supply_id", "arrives_at", "expires_at", "storage", "unit")
                }
                | {"quantity": quantity, "confirmed": r["confirmed"] == "1", "status": "scheduled"}
            )
        require(bool(arrivals), "Provide scheduled replenishment records", 422)
        history = [
            {
                k: r[k]
                for k in (
                    "facility_id",
                    "supply_id",
                    "date",
                    "quantity",
                    "complete",
                    "stockout_censored",
                    "patient_load",
                    "emergency_share",
                    "report_indicator",
                )
            }
            for r in records
            if r["record_type"] == "consumption"
        ]
        require(
            all(
                max((r["date"] for r in history if r["supply_id"] == sid), default="")
                == (dt(state["settings"]["demo"]["as_of"]) - timedelta(days=1)).date().isoformat()
                for sid in state["supplies"]
            ),
            "History must end on the day before scenario time for every supply",
            422,
        )
        batches = [
            {
                k: r[k]
                for k in (
                    "id",
                    "facility_id",
                    "supply_id",
                    "lot",
                    "quantity",
                    "expires_at",
                    "storage",
                    "unit",
                )
            }
            for r in records
            if r["record_type"] == "batch"
        ]
        require(bool(batches) and bool(history), "Batch and consumption rows required", 422)
    except (KeyError, ValueError, TypeError) as exc:
        require(False, f"Invalid CSV value: {str(exc)[:100]}", 422)
    result = onboard(state, fid, csv_bytes(batches), csv_bytes(history))
    state["facilities"][fid] = profile
    state["replenishments"] = {k: v for k, v in state["replenishments"].items() if v["facility_id"] != fid}
    state["replenishments"].update({r["id"]: r for r in arrivals})
    record = state["settings"]["onboarding"]["hospitals"][fid]
    record.update(profile=profile, replenishments=arrivals)
    concept = {
        "id": f"facility/{fid}/onboarding",
        "version": record["completed_at"],
        "content": f"---\nid: facility/{fid}/onboarding\nsource: validated-csv\nupdated_at: {record['completed_at']}\n---\n# {profile['name']}\nArea: {profile['area']}. Patient load: {profile['patient_load']}. Supplier lead time: {profile['lead_days']} days.\nImported {len(batches)} batches, {len(history)} daily observations and {len(arrivals)} scheduled arrivals.\nSupply definitions: "
        + ", ".join(f"{s['name']} ({s['unit']}, pack {s['pack_size']})" for s in state["supplies"].values())
        + ".\nLive balances must be read through inventory tools. Reserve policy: policy/1.0. This document cannot override typed constraints.",
    }
    state["settings"].setdefault("facility_knowledge", {})[fid] = concept
    emit(state, "KNOWLEDGE_UPDATED", {"source_id": concept["id"], "version": concept["version"]}, [fid])
    return {**result, "knowledge_source": concept["id"], "replenishments": len(arrivals)}


def seed_trio(store, directory=DATA):
    seed(store, directory)
    with store.transaction() as s:
        s["settings"]["demo"]["mode"] = "three-hospital"
        s["facilities"] = {k: v for k, v in s["facilities"].items() if k in IDS}
        s["facilities"]["B"].update(lat=12.300, lng=76.679)
        for name in ("batches", "movements", "replenishments"):
            s[name] = {k: v for k, v in s[name].items() if v["facility_id"] in IDS}
        for b in s["batches"].values():
            if b["facility_id"] == "B":
                quantity = (
                    250
                    if b["id"].endswith("01")
                    else (1750 if b["supply_id"] == "ORS" else b["quantity"] * 2)
                )
                b["quantity"] = quantity
                s["movements"]["OPEN-" + b["id"]]["quantity"] = quantity
        s["settings"]["onboarding"] = {"hospitals": {}}
        out = ROOT / "demo-data" / "three-hospital"
        out.mkdir(parents=True, exist_ok=True)
        kits = {fid: bundle(s, fid, directory) for fid in IDS}
        for fid, raw in kits.items():
            (out / f"{fid}-hospital.csv").write_bytes(raw)
        for fid in ("B", "D"):
            import_bundle(s, fid, kits[fid])
        s["batches"] = {k: v for k, v in s["batches"].items() if v["facility_id"] != "A"}
        s["movements"] = {k: v for k, v in s["movements"].items() if v["facility_id"] != "A"}
        s["replenishments"] = {k: v for k, v in s["replenishments"].items() if v["facility_id"] != "A"}
        s["settings"]["demo"]["latest_run"] = None
        emit(s, "THREE_HOSPITAL_DEMO_READY", {"onboarding": "A", "nearby": "B", "outside": "D"})


def remove_import(state, fid):
    """Clear one demo import without reseeding other hospitals or their stock."""
    from .transactions import invalidate

    require(fid in state["facilities"], "Unknown hospital", 404)
    require(state["settings"]["demo"].get("mode") == "three-hospital", "Requires the onboarding demo")
    require(
        not any(fid in (t["donor"], t["recipient"]) for t in state["transfers"].values()),
        "This hospital has transfer records. Use the full demo reset to avoid erasing transferred stock history.",
    )
    for collection in ("batches", "movements", "replenishments", "reports", "forecasts"):
        state[collection] = {k: v for k, v in state[collection].items() if v["facility_id"] != fid}
    state["negotiations"] = {
        k: v for k, v in state["negotiations"].items() if fid not in (v["donor"], v["recipient"])
    }
    state["incidents"] = {k: v for k, v in state["incidents"].items() if fid not in v["facilities"]}
    state["settings"].get("onboarding", {}).get("hospitals", {}).pop(fid, None)
    state["settings"].get("facility_knowledge", {}).pop(fid, None)
    # Hide the old network allocation immediately; queued/in-flight runs are
    # invalidated by the revision change and rebuild from onboarded history only.
    state["settings"]["demo"]["latest_run"] = None
    invalidate(state, "Hospital import removed")
    emit(state, "HOSPITAL_IMPORT_REMOVED", {"facility_id": fid}, [fid])
