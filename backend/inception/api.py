import asyncio
import copy
import csv
import io
import json
import uuid
from datetime import timedelta, datetime
from typing import Literal
from fastapi import FastAPI, Depends, Header, Query, HTTPException, UploadFile, File, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse, StreamingResponse
from pydantic import BaseModel, Field
from .config import DATA, POLICY, ROOT
from .store import Store, now, emit
from .seed import seed
from .worker import enqueue
from .engine import risk_for, dt
from .forecast import history_at
from .transactions import DomainError, require, invalidate, counter, approve, transfer_action, movement
from .demo import advance, reconciliation, outcomes
from .agent import answer

from contextlib import asynccontextmanager


@asynccontextmanager
async def lifespan(app):
    startup()
    yield


app = FastAPI(title="Inception — Medical Supply Intelligence", version="0.1.0", lifespan=lifespan)
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:5173",
        "http://127.0.0.1:5173",
        "http://localhost:5174",
        "http://127.0.0.1:5174",
    ],
    allow_methods=["*"],
    allow_headers=["*"],
)
store = Store()


@app.exception_handler(DomainError)
async def domain_error(_, exc):
    return JSONResponse(status_code=exc.status, content={"detail": exc.message})


def actor(x_demo_session: str | None = Header(default=None), session: str | None = Query(default=None)):
    token = x_demo_session or session
    if token and token.startswith("local-"):
        record = store.read()["settings"].get("sessions", {}).get(token)
        if record:
            return record["facility_id"]
    if token in [f"demo-{x}" for x in ("A", "B", "C", "D", "E", "F", "judge")]:
        return token[5:]
    raise HTTPException(401, "Select a seeded local demo session")


def judge(who=Depends(actor)):
    if who != "judge":
        raise HTTPException(403, "Judge console role required")
    return who


def scoped(values, who, key="facility_id"):
    return [v for v in values if who == "judge" or v.get(key) == who]


def negotiations_visible(state, who):
    rows = []
    for n in state["negotiations"].values():
        if who == "judge" or who in (n["donor"], n["recipient"]):
            row = copy.deepcopy(n)
            if who != "judge":
                row["messages"] = [
                    m for m in row["messages"] if not m.get("briefing_for") or m["briefing_for"] == who
                ]
            if who != "judge" and who != n["donor"]:
                row["lines"] = [
                    {
                        "quantity": l["quantity"],
                        "expires_at": state["batches"][l["batch_id"]]["expires_at"],
                        "lot": state["batches"][l["batch_id"]]["lot"],
                    }
                    for l in n["lines"]
                ]
                row.pop("max_lines", None)
            rows.append(row)
    return rows


def startup():
    if not store.read()["facilities"]:
        from .trio import seed_trio

        seed_trio(store)
    if not store.read()["forecasts"]:
        enqueue(store)


@app.get("/health")
def health():
    return {"status": "ok", "service": "inception", "synthetic": True}


@app.get("/snapshot")
def snapshot(who=Depends(actor)):
    s = store.read()
    demo = s["settings"]["demo"]
    forecasts = scoped(s["forecasts"].values(), who)
    risks = [risk_for(s, f) for f in forecasts]
    rows = negotiations_visible(s, who)
    events = store.recent_events(300)
    visible_events = [e for e in events if who == "judge" or who in e["facilities"]]
    return {
        "demo": demo,
        "actor": who,
        "facilities": list(s["facilities"].values()),
        "supplies": list(s["supplies"].values()),
        "inventory": scoped(s["batches"].values(), who),
        "risks": risks,
        "forecasts": forecasts,
        "replenishments": scoped(s["replenishments"].values(), who),
        "incidents": list(s["incidents"].values()),
        "reports": scoped(s["reports"].values(), who),
        "negotiations": rows,
        "transfers": [
            t for t in s["transfers"].values() if who == "judge" or who in (t["donor"], t["recipient"])
        ],
        "jobs": [
            {k: v for k, v in j.items() if k != "generation"}
            for j in store.jobs()
            if j.get("generation") == demo["generation"]
        ][-12:],
        "events": visible_events[-80:],
        "allocation": s["allocations"].get(demo["latest_run"]) if who == "judge" else None,
        "run": s["runs"].get(demo["latest_run"]) if who == "judge" else None,
        "reconciliation": reconciliation(s) if who == "judge" else None,
        "movements": scoped(list(s["movements"].values()), who)[-100:],
    }


@app.get("/inventory")
def inventory(who=Depends(actor)):
    return scoped(store.read()["batches"].values(), who)


@app.get("/forecasts")
def forecasts(who=Depends(actor)):
    return scoped(store.read()["forecasts"].values(), who)


@app.get("/risks")
def risks(who=Depends(actor)):
    s = store.read()
    return [risk_for(s, f) for f in scoped(s["forecasts"].values(), who)]


@app.get("/incidents")
def incidents(who=Depends(actor)):
    return list(store.read()["incidents"].values())


@app.get("/negotiations")
def negotiations(who=Depends(actor)):
    return negotiations_visible(store.read(), who)


@app.get("/transfers")
def transfers(who=Depends(actor)):
    return [
        t for t in store.read()["transfers"].values() if who == "judge" or who in (t["donor"], t["recipient"])
    ]


@app.get("/allocation-plans")
def allocations(who=Depends(judge)):
    return list(store.read()["allocations"].values())


class AnalysisRequest(BaseModel):
    force: bool = False


@app.post("/analysis-runs", status_code=202)
def analyze(body: AnalysisRequest | None = None, who=Depends(actor)):
    return enqueue(store, force=body.force if body else False)


@app.get("/analysis-runs")
def jobs(who=Depends(actor)):
    generation = store.read()["settings"]["demo"]["generation"]
    return [j for j in store.jobs() if j.get("generation") == generation]


class Report(BaseModel):
    onset_at: datetime
    category: str = Field(min_length=2, max_length=100)
    case_count: int | None = Field(default=None, ge=0, le=100000)
    supply_ids: list[str] = Field(min_length=1)
    additional_units: dict[str, int] = Field(default_factory=dict)
    note: str = Field(default="", max_length=1000)
    facility_id: str | None = None


@app.post("/outbreak-reports", status_code=201)
def report(body: Report, who=Depends(actor)):
    fid = body.facility_id if who == "judge" else who
    with store.transaction() as s:
        require(fid in s["facilities"], "Unknown facility", 422)
        require(body.onset_at.tzinfo is not None, "Onset requires a timezone", 422)
        require(
            body.onset_at <= dt(s["settings"]["demo"]["as_of"]), "Onset cannot be in the scenario future", 422
        )
        require(all(k in s["supplies"] for k in body.supply_ids), "Unknown supply", 422)
        require(
            all(k in body.supply_ids and 0 <= v <= 1000000 for k, v in body.additional_units.items()),
            "Invalid additional units",
            422,
        )
        id = "R-" + str(uuid.uuid4())[:8]
        row = {
            **body.model_dump(mode="json"),
            "id": id,
            "facility_id": fid,
            "status": "active",
            "created_at": now(),
            "expires_at": (
                dt(s["settings"]["demo"]["as_of"]) + timedelta(hours=POLICY["report_hours"])
            ).isoformat(),
        }
        s["reports"][id] = row
        invalidate(s, "New suspected outbreak report")
        emit(s, "REPORT_SUBMITTED", row, [fid], entity_id=id)
    job = enqueue(store)
    return {"report": row, "job": job}


@app.patch("/outbreak-reports/{id}")
def amend_report(id: str, body: Report, who=Depends(actor)):
    with store.transaction() as s:
        r = s["reports"].get(id)
        require(r is not None, "Report not found", 404)
        require(who == "judge" or r["facility_id"] == who, "Report belongs to another facility", 403)
        require(
            body.onset_at.tzinfo is not None and body.onset_at <= dt(s["settings"]["demo"]["as_of"]),
            "Invalid onset",
            422,
        )
        require(
            all(k in s["supplies"] for k in body.supply_ids)
            and all(k in body.supply_ids and 0 <= v <= 1000000 for k, v in body.additional_units.items()),
            "Invalid supplies or quantities",
            422,
        )
        emit(s, "REPORT_CORRECTED", {"previous": copy.deepcopy(r)}, [r["facility_id"]], entity_id=id)
        r.update(
            {
                **body.model_dump(mode="json"),
                "facility_id": r["facility_id"],
                "status": "active",
                "expires_at": (
                    dt(s["settings"]["demo"]["as_of"]) + timedelta(hours=POLICY["report_hours"])
                ).isoformat(),
            }
        )
        invalidate(s, "Report corrected")
    return {"job": enqueue(store)}


@app.delete("/outbreak-reports/{id}")
def withdraw(id: str, who=Depends(actor)):
    with store.transaction() as s:
        r = s["reports"].get(id)
        require(r is not None, "Report not found", 404)
        require(who == "judge" or r["facility_id"] == who, "Report belongs to another facility", 403)
        r["status"] = "withdrawn"
        invalidate(s, "Report withdrawn")
        emit(s, "REPORT_WITHDRAWN", {"id": id}, [r["facility_id"]])
    return {"job": enqueue(store)}


class Counter(BaseModel):
    quantity: int = Field(gt=0)


@app.post("/negotiations/{id}/counteroffer")
def counteroffer(id: str, body: Counter, who=Depends(actor)):
    with store.transaction() as s:
        result = copy.deepcopy(counter(s, id, who, body.quantity))
    return {
        "id": result["id"],
        "quantity": result["quantity"],
        "version": result["version"],
        "messages": result["messages"],
    }


class Approval(BaseModel):
    version: int = Field(ge=1)


@app.post("/negotiations/{id}/approve")
def approval(id: str, body: Approval, who=Depends(actor)):
    with store.transaction() as s:
        result = approve(s, id, who, body.version)
        result = {"id": result["id"], "status": result["status"], "approvals": result["approvals"]}
    return result


@app.post("/negotiations/{id}/reject")
def reject(id: str, who=Depends(actor)):
    with store.transaction() as s:
        n = s["negotiations"].get(id)
        require(n is not None, "Proposal not found", 404)
        require(who in (n["donor"], n["recipient"]), "Proposal belongs to another facility", 403)
        require(
            n["status"] in ("Awaiting approvals", "Negotiating", "Needs re-evaluation"),
            "Transfer already committed",
        )
        n["status"] = "Rejected"
        emit(s, "PROPOSAL_REJECTED", {"actor": who}, [n["donor"], n["recipient"]], n["run_id"], id)
    return {"status": "Rejected"}


@app.post("/transfers/{id}/{action}")
def delivery(id: str, action: Literal["claim", "pickup", "transit", "receive", "cancel"], who=Depends(actor)):
    with store.transaction() as s:
        result = copy.deepcopy(transfer_action(s, id, action, who))
    return {"id": result["id"], "status": result["status"]}


class Ask(BaseModel):
    question: str = Field(min_length=2, max_length=1500)


@app.post("/assistant/query")
def assistant(body: Ask, who=Depends(actor)):
    return answer(store, who, body.question)


class InventoryMovement(BaseModel):
    batch_id: str
    kind: Literal["consumption", "adjustment"]
    quantity: int
    reason: str = Field(min_length=3, max_length=300)
    idempotency_key: str = Field(min_length=8, max_length=100)


@app.post("/inventory/movements")
def record_movement(body: InventoryMovement, who=Depends(actor)):
    with store.transaction() as s:
        b = s["batches"].get(body.batch_id)
        require(b is not None, "Batch not found", 404)
        require(who == "judge" or b["facility_id"] == who, "Batch belongs to another facility", 403)
        if body.idempotency_key in s["movements"]:
            old = s["movements"][body.idempotency_key]
            require(
                old["batch_id"] == body.batch_id
                and old["quantity"] == body.quantity
                and old["kind"] == body.kind,
                "Idempotency key reused with different payload",
            )
            return {"status": "already recorded"}
        require(body.kind != "consumption" or body.quantity < 0, "Consumption must be a negative change", 422)
        require(
            b["quantity"] + body.quantity >= b["reserved"], "Cannot consume reserved or unavailable stock"
        )
        b["quantity"] += body.quantity
        movement(s, b, body.kind, body.quantity, body.reason, body.idempotency_key)
        invalidate(s, "Inventory changed")
        emit(s, "INVENTORY_UPDATED", {"batch_id": b["id"], "quantity": body.quantity}, [b["facility_id"]])
    return {"job": enqueue(store)}


@app.post("/imports")
async def imports(file: UploadFile = File(...), who=Depends(actor)):
    raw = await file.read(2_000_001)
    require(len(raw) <= 2_000_000, "CSV exceeds 2 MB", 422)
    try:
        reader = csv.DictReader(io.StringIO(raw.decode("utf-8-sig")))
        rows = list(reader)
    except Exception:
        raise DomainError("Invalid UTF-8 CSV", 422)
    expected = {"id", "facility_id", "supply_id", "lot", "quantity", "expires_at", "storage", "unit"}
    require(
        expected.issubset(set(reader.fieldnames or [])),
        "Required columns: " + ", ".join(sorted(expected)),
        422,
    )
    errors, valid, ids = [], [], set()
    with store.transaction() as s:
        for i, row in enumerate(rows, 2):
            try:
                require(
                    row["id"] and row["id"] not in ids and row["id"] not in s["batches"],
                    "Duplicate or empty batch ID",
                )
                require(
                    row["facility_id"] in s["facilities"] and (who == "judge" or row["facility_id"] == who),
                    "Unknown or unauthorized facility",
                )
                supply = s["supplies"].get(row["supply_id"])
                require(supply is not None, "Unknown supply")
                qty = int(row["quantity"])
                require(qty >= 0, "Quantity cannot be negative")
                expiry = dt(row["expires_at"])
                require(
                    expiry.tzinfo is not None and expiry > dt(s["settings"]["demo"]["as_of"]),
                    "Expiry must be a future timestamp with timezone",
                )
                require(
                    row["unit"] == supply["unit"] and row["storage"] == supply["storage"],
                    "Unit or storage mismatch",
                )
                valid.append(
                    {**{k: row[k] for k in expected}, "quantity": qty, "reserved": 0, "quarantined": False}
                )
                ids.add(row["id"])
            except Exception as exc:
                errors.append({"row": i, "error": getattr(exc, "message", str(exc))})
        if errors:
            return JSONResponse(status_code=422, content={"detail": "No rows imported", "errors": errors})
        for b in valid:
            s["batches"][b["id"]] = b
            movement(s, b, "receipt", b["quantity"], "Validated CSV import")
        invalidate(s, "CSV inventory imported")
        emit(s, "INVENTORY_IMPORTED", {"rows": len(valid)}, list({b["facility_id"] for b in valid}))
    return {"rows": len(valid), "job": enqueue(store)}


@app.get("/events/stream")
async def stream(request: Request, after: int = 0, who=Depends(actor)):
    try:
        cursor = max(after, int(request.headers.get("last-event-id", "0")))
    except ValueError:
        cursor = after

    async def generator():
        nonlocal cursor
        while not await request.is_disconnected():
            for e in store.events(cursor):
                cursor = e["id"]
                if who == "judge" or who in e["facilities"]:
                    yield f"id: {cursor}\ndata: {json.dumps(e)}\n\n"
                else:
                    yield f"id: {cursor}\nevent: heartbeat\ndata: {{}}\n\n"
            yield ": keepalive\n\n"
            await asyncio.sleep(1)

    return StreamingResponse(
        generator(), media_type="text/event-stream", headers={"Cache-Control": "no-cache"}
    )


@app.post("/demo/reset")
def reset(who=Depends(judge)):
    # Old queued work is generation-checked before it can commit.
    seed(store)
    return {"job": enqueue(store)}


class Advance(BaseModel):
    days: int = Field(default=3, ge=1, le=3)


@app.post("/demo/advance")
def advance_demo(body: Advance, who=Depends(judge)):
    with store.transaction() as s:
        advance(s, body.days)
    return {"job": enqueue(store)}


@app.get("/demo/outcomes")
def compare(reveal: bool = False, facility: str | None = None, who=Depends(judge)):
    s = store.read()
    if facility:
        require(facility in s["facilities"], "Unknown hospital", 404)
        s["forecasts"] = {k: v for k, v in s["forecasts"].items() if v["facility_id"] == facility}
    return {**outcomes(s, reveal), "facility_id": facility}


@app.get("/evaluation")
def evaluation(who=Depends(judge)):
    s = store.read()
    run = s["runs"].get(s["settings"]["demo"]["latest_run"])
    return {
        "run": run,
        "reconciliation": reconciliation(s),
        "rubric_case": {
            "units": 20000,
            "normal_weekly": 2000,
            "surge_weekly": 5500,
            "normal_days": 70,
            "surge_days": 20000 / (5500 / 7),
        },
        "policy": POLICY,
        "scope": "Synthetic validation; not evidence of clinical performance",
        "held_out_tests": json.loads((ROOT / "artifacts/evaluation.json").read_text())
        if (ROOT / "artifacts/evaluation.json").exists()
        else None,
    }


@app.get("/dataset")
def dataset(who=Depends(judge), limit: int = Query(default=80, ge=1, le=500)):
    s = store.read()
    h = history_at(s["settings"]["demo"]["as_of"], state=s)
    return {
        "rows": json.loads(h.tail(limit).to_json(orient="records", date_format="iso")),
        "row_count": len(h),
        "seed": 2026,
        "history_days": s["settings"]["demo"]["day"],
        "future_days": 28,
        "dictionary": {
            "quantity": "Observed consumed base units; not unmet demand",
            "complete": "1 means complete daily observation",
            "stockout_censored": "1 means consumption was constrained by stock",
            "patient_load": "Synthetic relevant patient count",
            "report_indicator": "Observed historical report flag",
            "date": "Completed calendar day (UTC)",
        },
        "synthetic": True,
    }


@app.get("/exports/{kind}")
def export(
    kind: Literal[
        "inventory",
        "observations",
        "movements",
        "forecasts",
        "evaluation",
        "historical-ledger",
        "allocation",
        "policy",
    ],
    who=Depends(actor),
):
    s = store.read()
    if kind in ("evaluation", "historical-ledger", "allocation", "policy"):
        require(who == "judge", "Judge role required", 403)
    if kind == "historical-ledger":
        text = (DATA / "historical_ledger.csv").read_text()
    elif kind in ("evaluation", "allocation", "policy"):
        payload = (
            evaluation("judge")
            if kind == "evaluation"
            else s["allocations"].get(s["settings"]["demo"]["latest_run"], {})
            if kind == "allocation"
            else POLICY
        )
        return JSONResponse(payload, headers={"Content-Disposition": f'attachment; filename="{kind}.json"'})
    else:
        if kind == "observations":
            h = history_at(s["settings"]["demo"]["as_of"], state=s)
            if who != "judge":
                h = h[h.facility_id == who]
            text = h.to_csv(index=False)
        else:
            collection = "batches" if kind == "inventory" else kind
            rows = scoped(s[collection].values(), who)
            if kind == "forecasts":
                rows = [
                    {
                        "facility_id": f["facility_id"],
                        "supply_id": f["supply_id"],
                        "run_id": f["run_id"],
                        "model": f["model"],
                        "date": (dt(f["cutoff"]) + timedelta(days=i)).date().isoformat(),
                        "p10": f["p10"][i],
                        "p50": f["p50"][i],
                        "p90": f["p90"][i],
                        "planning": f["planning"][i],
                        "stress": f["stress"][i],
                    }
                    for f in rows
                    for i in range(28)
                ]
            buf = io.StringIO()
            if rows:
                writer = csv.DictWriter(buf, fieldnames=sorted(set().union(*(r.keys() for r in rows))))
                writer.writeheader()
                writer.writerows(rows)
            text = buf.getvalue()
    return StreamingResponse(
        iter([text]),
        media_type="text/csv",
        headers={"Content-Disposition": f'attachment; filename="inception-{kind}.csv"'},
    )


@app.get("/demo/guide")
def demo_guide(who=Depends(actor)):
    from .onboarding import SCENARIOS

    state = store.read()
    records = state["settings"].get("onboarding", {}).get("hospitals", {})
    return {
        "scenarios": SCENARIOS,
        "refresh": state["settings"].get("refresh", {"enabled": True, "interval_seconds": 300}),
        "hospitals": [
            {
                **state["facilities"][fid],
                "onboarded": fid in records,
                "history_rows": records.get(fid, {}).get("history_rows", 0),
            }
            for fid in ("A", "B", "D")
            if fid in state["facilities"]
        ],
    }


@app.get("/demo/files/{facility}/{kind}")
def onboarding_file(facility: str, kind: str, who=Depends(actor)):
    from .onboarding import import_file
    from fastapi.responses import FileResponse

    require(who == "judge" or who == facility, "Hospital scope mismatch", 403)
    path = import_file(facility, kind)
    return FileResponse(path, filename=f"{facility}-{path.name}")


@app.post("/onboarding", status_code=201)
async def complete_onboarding(
    inventory: UploadFile = File(...), consumption: UploadFile = File(...), who=Depends(actor)
):
    from .onboarding import onboard

    inventory_raw = await inventory.read(2_000_001)
    history_raw = await consumption.read(2_000_001)
    with store.transaction() as state:
        result = onboard(state, who, inventory_raw, history_raw)
    return {**result, "job": enqueue(store)}


@app.post("/demo/onboarding-reset")
def onboarding_reset(who=Depends(judge)):
    from .trio import seed_trio

    seed_trio(store)
    with store.transaction() as s:
        emit(s, "ONBOARDING_DEMO_STARTED", {})
    return {"job": enqueue(store)}


@app.post("/demo/scenarios/{name}", status_code=202)
def select_scenario(name: str, who=Depends(judge)):
    from .onboarding import start_scenario

    start_scenario(store, name)
    return {"scenario": name, "job": enqueue(store)}


class RefreshSettings(BaseModel):
    enabled: bool = True
    interval_seconds: int = Field(default=300, ge=30, le=3600)


@app.post("/demo/refresh")
def configure_refresh(body: RefreshSettings, who=Depends(judge)):
    with store.transaction() as s:
        s["settings"]["refresh"] = {**body.model_dump(), "next_at": now()}
    return body.model_dump()


@app.get("/demo/readiness")
def readiness(who=Depends(judge)):
    import os
    from importlib.util import find_spec

    s = store.read()
    last = s["runs"].get(s["settings"]["demo"].get("latest_run"), {})
    return {
        "openai": {
            "configured": bool(os.getenv("OPENAI_API_KEY")),
            "model": os.getenv("OPENAI_MODEL", "gpt-4.1-mini"),
            "mode": "Live calls enabled; verify with a proposal or assistant question"
            if os.getenv("OPENAI_API_KEY")
            else "Deterministic fallback; no key configured",
        },
        "maps": {
            "configured": bool(os.getenv("VITE_CARTO_KEY")),
            "mode": "Tile key configured; verify rendering in Network"
            if os.getenv("VITE_CARTO_KEY")
            else "Geographic schematic; no tile key configured",
        },
        "forecast": {
            "installed": find_spec("chronos") is not None,
            "key_required": False,
            "model": last.get("evaluation", {}).get("selected"),
            "completed_at": last.get("at"),
        },
        "refresh": s["settings"].get("refresh", {"enabled": True, "interval_seconds": 300}),
        "ledger": reconciliation(s),
        "roles": "Local demo sessions; production authentication is not implemented",
        "courier": "Simulated courier; no delivery-provider API required",
    }


class DemoLogin(BaseModel):
    email: str
    password: str


@app.post("/auth/login")
def login(body: DemoLogin):
    import secrets
    from .trio import EMAILS

    fid = next((k for k, v in EMAILS.items() if v == body.email.strip().lower()), None)
    require(
        fid is not None and secrets.compare_digest(body.password, "Demo@2026"),
        "Invalid demo email or password",
        401,
    )
    token = "local-" + secrets.token_urlsafe(24)
    with store.transaction() as s:
        require(fid in s["facilities"], "Hospital is not available", 404)
        s["settings"].setdefault("sessions", {})[token] = {"facility_id": fid, "created_at": now()}
    return {"session": token, "facility_id": fid, "mode": "local demo login"}


@app.get("/onboarding/template/{fid}")
def template(fid: str, who=Depends(actor)):
    from fastapi.responses import FileResponse

    require(fid == who or who == "judge", "Hospital scope mismatch", 403)
    require(fid in ("A", "B", "D"), "Unknown hospital", 404)
    return FileResponse(
        ROOT / "demo-data" / "three-hospital" / f"{fid}-hospital.csv", filename=f"{fid}-hospital.csv"
    )


@app.post("/onboarding/csv", status_code=201)
async def onboarding_csv(file: UploadFile = File(...), who=Depends(actor)):
    from .trio import import_bundle

    raw = await file.read(2_000_001)
    with store.transaction() as s:
        result = import_bundle(s, who, raw)
    return {**result, "job": enqueue(store)}


class BatchEdit(BaseModel):
    quantity: int = Field(ge=0)
    expires_at: datetime
    reason: str = Field(min_length=3, max_length=300)
    expected_quantity: int
    expected_expiry: str
    command_id: str = Field(min_length=8, max_length=100)


@app.post("/inventory/batches/{batch_id}")
def edit_batch(batch_id: str, body: BatchEdit, who=Depends(actor)):
    with store.transaction() as s:
        b = s["batches"].get(batch_id)
        require(b is not None, "Batch not found", 404)
        require(b["facility_id"] == who, "Hospital scope mismatch", 403)
        commands = s["settings"].setdefault("inventory_commands", {})
        signature = json.dumps({"batch": batch_id, **body.model_dump(mode="json")}, sort_keys=True)
        if body.command_id in commands:
            require(commands[body.command_id] == signature, "Command id reused with different terms")
            return {"status": "already recorded"}
        require(
            b["quantity"] == body.expected_quantity and b["expires_at"] == body.expected_expiry,
            "Inventory changed; reload the batch and retry",
        )
        require(b["reserved"] == 0, "Cancel or complete reserved transfers before editing this batch")
        require(body.expires_at.tzinfo is not None, "Expiry must include timezone", 422)
        old = copy.deepcopy(b)
        delta = body.quantity - b["quantity"]
        movement(s, b, "adjustment", delta, body.reason, body.command_id)
        b.update(quantity=body.quantity, expires_at=body.expires_at.isoformat())
        commands[body.command_id] = signature
        invalidate(s, "Inventory quantity or expiry changed")
        emit(
            s,
            "INVENTORY_UPDATED",
            {"batch_id": batch_id, "before": old, "after": copy.deepcopy(b), "reason": body.reason},
            [who],
        )
    return {"status": "updated", "job": enqueue(store)}
