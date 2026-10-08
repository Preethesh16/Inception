import copy
import pytest
from inception.onboarding import onboard, import_file, start_scenario, schedule_refresh
from inception.seed import seed
from inception.forecast import history_at
from inception.demo import reconciliation
from inception.transactions import DomainError
from inception.worker import enqueue, run_job


def test_onboarding_atomic_scope_and_history(store):
    seed(store)
    with store.transaction() as s:
        before = copy.deepcopy(s)
        with pytest.raises(DomainError):
            onboard(
                s,
                "A",
                import_file("D", "inventory").read_bytes(),
                import_file("A", "consumption").read_bytes(),
            )
        assert s == before
        result = onboard(
            s, "A", import_file("A", "inventory").read_bytes(), import_file("A", "consumption").read_bytes()
        )
        assert result["history_rows"] == 711
        assert reconciliation(s)["balanced"]
        h = history_at(s["settings"]["demo"]["as_of"], state=s)
        assert len(h[h.facility_id == "A"]) == 711
    with store.transaction() as s:
        with pytest.raises(DomainError, match="already onboarded"):
            onboard(
                s,
                "A",
                import_file("A", "inventory").read_bytes(),
                import_file("A", "consumption").read_bytes(),
            )


def test_import_invalid_history_rolls_back(store):
    seed(store)
    with store.transaction() as s:
        original = copy.deepcopy(s)
        raw = import_file("A", "consumption").read_bytes().replace(b"2026-02-10", b"2027-02-10")
        with pytest.raises(DomainError, match="Future observations"):
            onboard(s, "A", import_file("A", "inventory").read_bytes(), raw)
        assert s == original


def test_scenarios_preserve_onboarding_and_ledger(store):
    seed(store)
    with store.transaction() as s:
        for fid in ("A", "D"):
            onboard(
                s,
                fid,
                import_file(fid, "inventory").read_bytes(),
                import_file(fid, "consumption").read_bytes(),
            )
    for name in ("surge", "delay", "no-donor", "baseline"):
        start_scenario(store, name)
        s = store.read()
        assert set(s["settings"]["onboarding"]["hospitals"]) == {"A", "D"}
        assert reconciliation(s)["balanced"]
        assert s["settings"]["demo"]["day"] == (240 if name in ("surge", "no-donor") else 237)
        if name == "no-donor":
            assert all(
                b["quarantined"]
                for b in s["batches"].values()
                if b["facility_id"] == "D" and b["supply_id"] == "ORS"
            )


def test_refresh_preserves_proposals_and_approvals(store):
    before = store.read()
    pending = next(n for n in before["negotiations"].values() if n["status"] == "Awaiting approvals")
    with store.transaction() as s:
        s["negotiations"][pending["id"]]["approvals"] = [pending["recipient"]]
    run_job(store, enqueue(store))
    after = store.read()
    assert set(after["negotiations"]) == set(before["negotiations"])
    assert after["negotiations"][pending["id"]]["approvals"] == [pending["recipient"]]
    schedule_refresh(store)
    jobs = len(store.jobs())
    schedule_refresh(store)
    assert len(store.jobs()) == jobs
    assert store.read()["settings"]["refresh"]["interval_seconds"] == 300
