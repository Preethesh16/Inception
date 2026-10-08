"""Reproducible synthetic observations; future targets are never model inputs."""

import csv
from datetime import datetime, timedelta, timezone
from pathlib import Path
import numpy as np
from .config import DATA, POLICY
from .store import now, emit

SEED = 2026
START = datetime(2026, 2, 10, tzinfo=timezone.utc)
FACILITIES = [
    ("A", "Kaveri General Hospital", "Nazarbad", 12.305, 76.670, 240, 0.34, 12),
    ("B", "Chamundi Community Hospital", "Chamundi foothills", 12.278, 76.683, 180, 0.22, 11),
    ("C", "Mysuru Central Hospital", "Ittigegud", 12.291, 76.657, 300, 0.29, 10),
    ("D", "Mandya Regional Hospital", "Mandya", 12.522, 76.897, 210, 0.12, 7),
    ("E", "Hunsur District Hospital", "Hunsur", 12.306, 76.290, 150, 0.10, 7),
    ("F", "Nanjangud Care Centre", "Nanjangud", 12.119, 76.682, 160, 0.16, 9),
]
SUPPLIES = [
    {
        "id": "ORS",
        "name": "Oral rehydration salts",
        "unit": "sachet",
        "pack_size": 10,
        "critical": True,
        "alternative": False,
        "storage": "ambient",
        "family": "gastrointestinal",
    },
    {
        "id": "SAL",
        "name": "IV saline 500 ml",
        "unit": "bag",
        "pack_size": 5,
        "critical": True,
        "alternative": False,
        "storage": "ambient",
        "family": "hydration",
    },
    {
        "id": "MSK",
        "name": "Surgical masks",
        "unit": "mask",
        "pack_size": 50,
        "critical": False,
        "alternative": True,
        "storage": "dry",
        "family": "respiratory",
    },
]
BASE = {
    "ORS": [35, 30, 32, 24, 20, 27],
    "SAL": [22, 15, 18, 13, 16, 14],
    "MSK": [160, 140, 180, 110, 95, 120],
}


def generate(directory=DATA, seed=SEED):
    directory = Path(directory)
    directory.mkdir(parents=True, exist_ok=True)
    rng = np.random.default_rng(seed)
    observations, ledger = [], []
    for i, facility in enumerate(FACILITIES):
        for supply in SUPPLIES:
            base = BASE[supply["id"]][i]
            balance = base * 30
            ledger.append(
                {
                    "facility_id": facility[0],
                    "supply_id": supply["id"],
                    "date": START.date().isoformat(),
                    "kind": "opening",
                    "quantity": balance,
                    "balance": balance,
                }
            )
            for day in range(268):
                date = START + timedelta(days=day)
                weekly = [1.12, 1.05, 1.03, 1.0, 1.09, 0.88, 0.82][date.weekday()]
                surge = 1.0
                if facility[0] in ("A", "B") and supply["id"] == "ORS":
                    if 100 <= day < 110 or 180 <= day < 190 or 237 <= day < 250:
                        surge = 3.1 if facility[0] == "A" else 2.8
                if facility[0] == "F" and day == 220 and supply["id"] == "MSK":
                    surge = 3.5  # isolated false alarm
                demand = max(0, int(rng.poisson(base * weekly * (1 + day / 2400) * surge)))
                complete = not (day in (46, 141) and facility[0] == "C")
                censored = day in (72, 73) and facility[0] == "F" and supply["id"] == "SAL"
                observed = min(demand, 4) if censored else demand
                observations.append(
                    {
                        "facility_id": facility[0],
                        "supply_id": supply["id"],
                        "date": date.date().isoformat(),
                        "quantity": observed,
                        "complete": int(complete),
                        "stockout_censored": int(censored),
                        "patient_load": max(1, int(facility[5] * weekly * (1 + 0.25 * (surge - 1)))),
                        "emergency_share": facility[6],
                        "report_indicator": 0,
                    }
                )
                if day < 237:
                    if balance < observed + base * 7:
                        receipt = base * 30
                        balance += receipt
                        ledger.append(
                            {
                                "facility_id": facility[0],
                                "supply_id": supply["id"],
                                "date": date.date().isoformat(),
                                "kind": "receipt",
                                "quantity": receipt,
                                "balance": balance,
                            }
                        )
                    balance -= observed
                    ledger.append(
                        {
                            "facility_id": facility[0],
                            "supply_id": supply["id"],
                            "date": date.date().isoformat(),
                            "kind": "consumption",
                            "quantity": -observed,
                            "balance": balance,
                        }
                    )
    for name, rows in (("observations.csv", observations), ("historical_ledger.csv", ledger)):
        with (directory / name).open("w") as f:
            writer = csv.DictWriter(f, fieldnames=list(rows[0]))
            writer.writeheader()
            writer.writerows(rows)
    return observations


def seed(store, directory=DATA):
    generate(directory)
    as_of = START + timedelta(days=237)
    with store.transaction() as state:
        for key in list(state):
            if not key.startswith("_"):
                state[key].clear()
        state["settings"]["demo"] = {
            "as_of": as_of.isoformat(),
            "day": 237,
            "seed": SEED,
            "generation": now(),
            "revision": 1,
            "latest_run": None,
            "phase": "baseline",
            "policy": POLICY,
        }
        for i, (id, name, area, lat, lng, load, emergency, lead) in enumerate(FACILITIES):
            state["facilities"][id] = {
                "id": id,
                "name": name,
                "area": area,
                "lat": lat,
                "lng": lng,
                "patient_load": load,
                "emergency_share": emergency,
                "lead_days": lead,
                "storage": ["ambient", "dry"],
            }
        for s in SUPPLIES:
            state["supplies"][s["id"]] = s
        for i, f in enumerate(FACILITIES):
            for s in SUPPLIES:
                base = BASE[s["id"]][i]
                qty = [460, 470, 1400, 1050, 730, 570][i] if s["id"] == "ORS" else base * 22
                near = [120, 100, 150, 330, 140, 70][i] if s["id"] == "ORS" else base * 3
                for suffix, amount, days in (
                    ("01", near, 7 if f[0] in ("D", "E") else 12),
                    ("02", qty - near, 75),
                ):
                    id = f"{f[0]}-{s['id']}-{suffix}"
                    state["batches"][id] = {
                        "id": id,
                        "facility_id": f[0],
                        "supply_id": s["id"],
                        "lot": f"LOT-{id}",
                        "quantity": amount,
                        "reserved": 0,
                        "expires_at": (as_of + timedelta(days=days)).isoformat(),
                        "storage": s["storage"],
                        "quarantined": False,
                        "unit": s["unit"],
                    }
                    state["movements"][f"OPEN-{id}"] = {
                        "id": f"OPEN-{id}",
                        "batch_id": id,
                        "facility_id": f[0],
                        "supply_id": s["id"],
                        "kind": "opening",
                        "quantity": amount,
                        "at": as_of.isoformat(),
                        "reason": "Synthetic demo opening snapshot; historical ledger exported separately",
                    }
                id = f"PO-{f[0]}-{s['id']}"
                state["replenishments"][id] = {
                    "id": id,
                    "facility_id": f[0],
                    "supply_id": s["id"],
                    "quantity": base * 24,
                    "arrives_at": (as_of + timedelta(days=f[7])).isoformat(),
                    "confirmed": f[0] != "F",
                    "status": "scheduled",
                    "expires_at": (as_of + timedelta(days=100)).isoformat(),
                    "storage": s["storage"],
                    "unit": s["unit"],
                }
        emit(state, "DEMO_RESET", {"seed": SEED, "as_of": as_of.isoformat(), "synthetic": True})
