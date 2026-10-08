"""Generate the tracked import kit from the same reproducible opening scenario."""

import csv
import json
import tempfile
from pathlib import Path
from inception.store import Store
from inception.seed import seed
from inception.config import ROOT


def write_csv(path, rows):
    with path.open("w") as f:
        writer = csv.DictWriter(f, fieldnames=list(rows[0]))
        writer.writeheader()
        writer.writerows(rows)


with tempfile.TemporaryDirectory() as tmp:
    directory = Path(tmp)
    store = Store(directory / "seed.db")
    seed(store, directory)
    state = store.read()
    history = list(csv.DictReader((directory / "observations.csv").open()))
    for fid in ("A", "D"):
        out = ROOT / "demo-data" / fid
        out.mkdir(parents=True, exist_ok=True)
        (out / "profile.json").write_text(json.dumps(state["facilities"][fid], indent=2))
        inventory = [
            {
                k: b[k]
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
            for b in state["batches"].values()
            if b["facility_id"] == fid
        ]
        write_csv(out / "inventory.csv", inventory)
        write_csv(
            out / "consumption.csv",
            [
                r
                for r in history
                if r["facility_id"] == fid and r["date"] < state["settings"]["demo"]["as_of"][:10]
            ],
        )
        write_csv(
            out / "replenishments.csv",
            [r for r in state["replenishments"].values() if r["facility_id"] == fid],
        )
