"""Small local repository: versioned domain records, atomic writes, and append-only events."""

import copy
import json
from contextlib import contextmanager
from datetime import datetime, timezone
from sqlalchemy import create_engine, MetaData, Table, Column, String, Integer, Text, select, event
from .config import DATA

COLLECTIONS = (
    "facilities",
    "supplies",
    "batches",
    "movements",
    "replenishments",
    "reports",
    "forecasts",
    "negotiations",
    "transfers",
    "runs",
    "incidents",
    "allocations",
    "settings",
)
metadata = MetaData()
tables = {
    n: Table(
        n,
        metadata,
        Column("id", String, primary_key=True),
        Column("version", Integer, default=1),
        Column("payload", Text, nullable=False),
    )
    for n in COLLECTIONS
}
events = Table(
    "events",
    metadata,
    Column("id", Integer, primary_key=True, autoincrement=True),
    Column("payload", Text, nullable=False),
)
jobs = Table(
    "jobs", metadata, Column("id", String, primary_key=True), Column("payload", Text, nullable=False)
)


def now():
    return datetime.now(timezone.utc).isoformat()


class Store:
    def __init__(self, path=None):
        self.engine = create_engine(
            f"sqlite:///{path or DATA / 'inception.db'}", connect_args={"timeout": 30}
        )

        @event.listens_for(self.engine, "connect")
        def pragmas(connection, _):
            connection.execute("PRAGMA journal_mode=WAL")
            connection.execute("PRAGMA busy_timeout=30000")

        metadata.create_all(self.engine)

    def _read(self, conn):
        return {
            name: {r.id: json.loads(r.payload) for r in conn.execute(select(table))}
            for name, table in tables.items()
        }

    def read(self):
        with self.engine.connect() as conn:
            return self._read(conn)

    @contextmanager
    def transaction(self):
        with self.engine.connect() as conn:
            conn.exec_driver_sql("BEGIN IMMEDIATE")
            state = self._read(conn)
            previous = copy.deepcopy(state)
            state["_events"] = []
            try:
                yield state
                for name, table in tables.items():
                    for key, value in state[name].items():
                        if previous[name].get(key) != value:
                            payload = json.dumps(value, allow_nan=False)
                            if key in previous[name]:
                                conn.execute(
                                    table.update()
                                    .where(table.c.id == key)
                                    .values(payload=payload, version=table.c.version + 1)
                                )
                            else:
                                conn.execute(table.insert().values(id=key, version=1, payload=payload))
                    removed = set(previous[name]) - set(state[name])
                    if removed:
                        conn.execute(table.delete().where(table.c.id.in_(removed)))
                for item in state["_events"]:
                    conn.execute(events.insert().values(payload=json.dumps(item, allow_nan=False)))
                conn.commit()
            except Exception:
                conn.rollback()
                raise

    def emit(self, kind, details=None, facilities=None, run_id=None, entity_id=None):
        with self.transaction() as state:
            emit(state, kind, details, facilities, run_id, entity_id)

    def events(self, after=0, limit=500):
        with self.engine.connect() as conn:
            rows = conn.execute(select(events).where(events.c.id > after).order_by(events.c.id).limit(limit))
            return [{"id": r.id, **json.loads(r.payload)} for r in rows]

    def recent_events(self, limit=200):
        with self.engine.connect() as conn:
            rows = list(conn.execute(select(events).order_by(events.c.id.desc()).limit(limit)))
            return [{"id": r.id, **json.loads(r.payload)} for r in reversed(rows)]

    def enqueue(self, job):
        with self.engine.begin() as conn:
            conn.execute(jobs.insert().values(id=job["id"], payload=json.dumps(job)))

    def jobs(self):
        with self.engine.connect() as conn:
            return [json.loads(r.payload) for r in conn.execute(select(jobs))]

    def update_job(self, job):
        with self.engine.begin() as conn:
            conn.execute(jobs.update().where(jobs.c.id == job["id"]).values(payload=json.dumps(job)))

    def claim_job(self):
        from datetime import timedelta

        with self.engine.connect() as conn:
            conn.exec_driver_sql("BEGIN IMMEDIATE")
            candidates = [json.loads(r.payload) for r in conn.execute(select(jobs))]
            cutoff = datetime.now(timezone.utc) - timedelta(minutes=30)
            for job in candidates:
                if job["status"] == "queued" or (
                    job["status"] == "running" and datetime.fromisoformat(job["lease"]) < cutoff
                ):
                    job.update(status="running", lease=now())
                    conn.execute(jobs.update().where(jobs.c.id == job["id"]).values(payload=json.dumps(job)))
                    conn.commit()
                    return job
            conn.commit()


def emit(state, kind, details=None, facilities=None, run_id=None, entity_id=None):
    state["_events"].append(
        {
            "type": kind,
            "at": now(),
            "details": details or {},
            "facilities": facilities or [],
            "run_id": run_id,
            "entity_id": entity_id,
        }
    )
