"""Small OKF v0.2 bundle reader; SQLite remains authoritative for live stock."""

import hashlib
import re
from pathlib import PurePosixPath
import yaml
from .config import ROOT, POLICY


def document(concept_id, content):
    parts = content.split("---", 2)
    if len(parts) != 3 or parts[0].strip():
        raise ValueError(f"Missing OKF frontmatter: {concept_id}")
    metadata = yaml.safe_load(parts[1])
    if not isinstance(metadata, dict) or not isinstance(metadata.get("type"), str):
        raise ValueError(f"Missing OKF type: {concept_id}")
    return {
        "id": concept_id,
        "version": str(metadata.get("version", POLICY["version"])),
        "sha256": hashlib.sha256(content.encode()).hexdigest(),
        "metadata": metadata,
        "content": content,
    }


def facility_document(state, fid):
    record = state["settings"].get("onboarding", {}).get("hospitals", {}).get(fid)
    if not record:
        return None
    profile = state["facilities"][fid]
    metadata = {
        "type": "Hospital Profile",
        "title": profile["name"],
        "resource": f"inception://facility/{fid}",
        "version": record["completed_at"],
        "generated": {"by": "process:validated-csv-import", "at": record["completed_at"]},
        "sources": [
            {
                "resource": f"inception://imports/{fid}/{record['completed_at']}",
                "title": "Validated hospital onboarding CSV",
            }
        ],
    }
    text = (
        "---\n" + yaml.safe_dump(metadata, sort_keys=False) + "---\n"
        f"# {profile['name']}\nArea: {profile['area']}. Inventory-only demand planning.\n"
        f"Imported {record['history_rows']} consumption observations and {len(record['batches'])} batches.\n"
        "This profile is an import snapshot, not a current inventory balance. Read live batches, "
        "reservations, arrivals and forecasts from the scoped inventory tool.\n"
        "See [donor protection](/policies/donor-protection.md) and [expiry](/policies/expiry.md).\n"
    )
    return document(f"facility/{fid}/onboarding", text)


def retrieve(state, actor, supply_ids, incident=False):
    root = ROOT / "knowledge"
    selected = {"policies/donor-protection", "policies/expiry", "metrics/stockout"}
    selected.update(f"supplies/{sid}" for sid in supply_ids)
    if incident:
        selected.add("playbooks/incidents")
    docs = {}
    while selected:
        name = min(selected)
        selected.remove(name)
        path = (root / (name + ".md")).resolve()
        if not path.is_relative_to(root.resolve()) or not path.is_file() or name in docs:
            continue
        entry = document(name, path.read_text())
        docs[name] = entry
        for link in re.findall(r"\]\(([^)#]+\.md)(?:#[^)]*)?\)", entry["content"]):
            target = root / link.lstrip("/") if link.startswith("/") else path.parent / link
            target = target.resolve()
            if target.is_relative_to(root.resolve()) and target.is_file():
                selected.add(str(PurePosixPath(target.relative_to(root)).with_suffix("")))
    for fid in state["facilities"] if actor == "judge" else [actor]:
        entry = facility_document(state, fid)
        if entry:
            docs[entry["id"]] = entry
    return list(docs.values())
