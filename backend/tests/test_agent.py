import json
from types import SimpleNamespace
from inception.agent import answer, AgentDecision
from inception.transactions import expire_pending, approve
from inception.demo import reconciliation
from datetime import datetime, timezone, timedelta


def test_openai_tool_loop_and_structured_output(store, monkeypatch):
    calls = []

    class FakeResponses:
        def parse(self, **kwargs):
            calls.append(kwargs)
            if len(calls) == 1:
                return SimpleNamespace(
                    output=[
                        SimpleNamespace(
                            type="function_call", name="read_own_position", arguments="{}", call_id="c1"
                        )
                    ]
                )
            tool = next(
                m for m in kwargs["input"] if isinstance(m, dict) and m.get("type") == "function_call_output"
            )
            evidence = json.loads(tool["output"])
            assert all(r["facility_id"] == "A" for r in evidence["risks"])
            return SimpleNamespace(
                output=[],
                output_parsed=AgentDecision(
                    summary="Review the current ORS offer.", next_action="review", source_ids=["policy/1.0"]
                ),
            )

    import openai

    monkeypatch.setenv("OPENAI_API_KEY", "test-only-fake-key")
    monkeypatch.setattr(openai, "OpenAI", lambda **kwargs: SimpleNamespace(responses=FakeResponses()))
    result = answer(store, "A", "Explain my offers")
    assert result["mode"].startswith("OpenAI")
    assert result["answer"] == "Review the current ORS offer."
    assert result["traces"][0]["scope"] == "A"
    assert len(calls) == 2


def test_abandoned_reservation_released(state):
    n = next(n for n in state["negotiations"].values() if n["status"] == "Awaiting approvals")
    approve(state, n["id"], n["donor"], 1)
    approve(state, n["id"], n["recipient"], 1)
    state["transfers"][n["id"]]["updated_at"] = (
        datetime.now(timezone.utc) - timedelta(minutes=31)
    ).isoformat()
    expire_pending(state)
    assert state["transfers"][n["id"]]["status"] == "Expired"
    assert all(b["reserved"] == 0 for b in state["batches"].values())
    assert reconciliation(state)["balanced"]


def test_automatic_negotiation_cannot_exceed_limit_or_start_recursive_jobs(store, monkeypatch):
    import openai

    n = next(n for n in store.read()["negotiations"].values() if n["status"] == "Awaiting approvals")
    count = 0

    class Responses:
        def parse(self, **kwargs):
            nonlocal count
            count += 1
            assert "request_analysis" not in {t["name"] for t in kwargs["tools"]}
            if count == 1:
                return SimpleNamespace(
                    output=[
                        SimpleNamespace(
                            type="function_call",
                            name="counterpropose_transfer",
                            arguments=json.dumps(
                                {"proposal_id": n["id"], "quantity": n["max_quantity"] + 10000}
                            ),
                            call_id="cap",
                        ),
                        SimpleNamespace(
                            type="function_call", name="request_analysis", arguments="{}", call_id="recursive"
                        ),
                    ]
                )
            return SimpleNamespace(
                output=[],
                output_parsed=AgentDecision(
                    summary="The enforced allocation limit remains unchanged.",
                    next_action="review",
                    source_ids=[n["id"]],
                ),
            )

    monkeypatch.setenv("OPENAI_API_KEY", "fake-test-only")
    monkeypatch.setattr(openai, "OpenAI", lambda **kwargs: SimpleNamespace(responses=Responses()))
    before_jobs = len(store.jobs())
    result = answer(store, n["donor"], "Negotiate this offer within its safe limit.", automatic_ids={n["id"]})
    after = store.read()["negotiations"][n["id"]]
    assert after["quantity"] == n["quantity"] and after["approvals"] == []
    assert len(store.jobs()) == before_jobs
    assert any("recursive" in str(t["result"]) for t in result["traces"])


def test_agent_reads_only_own_batches_and_scoped_negotiation_history(state):
    from inception.agent import context

    n = next(n for n in state["negotiations"].values() if n["status"] == "Awaiting approvals")
    n["messages"].append(
        {
            "actor": n["donor"],
            "type": "agent briefing",
            "briefing_for": n["donor"],
            "text": "PRIVATE DONOR STOCK",
            "at": "now",
        }
    )
    buyer = context(state, n["recipient"])
    assert buyer["inventory"]
    assert all(b["facility_id"] == n["recipient"] for b in buyer["inventory"])
    assert all(r["facility_id"] == n["recipient"] for r in buyer["replenishments"])
    assert "PRIVATE DONOR STOCK" not in json.dumps(buyer)
    assert n["id"] in {o["id"] for o in buyer["offers"]}
    for b in state["batches"].values():
        if b["facility_id"] == n["donor"] and b["supply_id"] == n["supply_id"]:
            b["quantity"] = 0
            b["reserved"] = 0
    donor = context(state, n["donor"])
    assert next(r for r in donor["risks"] if r["supply_id"] == n["supply_id"])["stock"] == 0


def test_okf_metadata_links_scoping_and_content_versions(store):
    from inception.knowledge import retrieve, document
    from inception.trio import seed_trio
    from inception.config import ROOT
    import pytest

    seed_trio(store)
    state = store.read()
    docs = retrieve(state, "D", {"ORS"})
    ids = {d["id"] for d in docs}
    assert "supplies/ORS" in ids and "supplies/MSK" not in ids
    assert "playbooks/incidents" not in ids
    assert "facility/D/onboarding" in ids
    assert not any(i.startswith("facility/B/") for i in ids)
    assert all(d["metadata"]["type"] and len(d["sha256"]) == 64 for d in docs)
    for path in (ROOT / "knowledge").rglob("*.md"):
        if path.name != "index.md":
            document(str(path), path.read_text())
    source = next(d for d in docs if d["id"] == "supplies/ORS")
    changed = document(source["id"], source["content"] + "\nUpdated guidance.\n")
    assert changed["sha256"] != source["sha256"]
    assert "playbooks/incidents" in {d["id"] for d in retrieve(state, "D", {"ORS"}, incident=True)}
    with pytest.raises(ValueError):
        document("bad", "---\ntitle: Missing required type\n---\nText")


def test_agent_reserve_arithmetic_matches_enforced_donor_path(state):
    from inception.agent import context
    from inception.engine import donor_protection

    f = state["forecasts"]["A:ORS"]
    state["facilities"]["A"]["lead_days"] = 10
    f["stress"] = [10.0] * 28
    f["normal_daily"] = 5.0
    expected = donor_protection(state, f)
    assert expected["horizon_days"] == 28
    assert expected["higher_path_units"] == 280
    assert expected["normal_day_buffer_units"] == 5
    assert expected["protected_units"] == 285
    supplied = next(f for f in context(state, "A")["forecast_evidence"] if f["supply_id"] == "ORS")
    assert supplied["donor_protection"] == expected


def test_product_focused_evidence_excludes_other_supplies(state):
    from inception.agent import context

    own = context(state, "A", {"ORS"})
    assert {v["supply_id"] for v in own["inventory"]} == {"ORS"}
    assert {v["supply_id"] for v in own["forecast_evidence"]} == {"ORS"}
    assert {v["id"] for v in own["supply_definitions"]} == {"ORS"}
    assert all(v["supply_id"] == "ORS" for v in own["offers"])
