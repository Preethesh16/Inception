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
