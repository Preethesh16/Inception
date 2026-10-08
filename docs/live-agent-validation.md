# Live hospital-agent integration validation

Measured 2026-10-08T12:41:11.235097+00:00 using gpt-4.1-mini and local chronos-2. The final integration run took 63.18 seconds. All tests used a disposable SQLite database; the running demo was not reseeded or modified.

- Automatic agent briefings succeeded for both hospitals on the ORS proposal: B donating to A, with a computed cap of 510 sachets.
- Both agents called their own inventory and OKF policy tools. Evidence contained only their hospital’s batches, arrivals and forecasts and only the negotiated product. Peer private briefings were excluded.
- The final donor explanation quoted approximately 548 protected ORS units, matching the engine's calculation. A cross-product reserve mix-up found in an earlier run was corrected by restricting each automatic briefing to one proposal and product; a regression check now tests the scope and live quoted reserve.
- The model successfully called the counteroffer tool to reduce 510 units to 500. Stock and approvals remained unchanged.
- The deterministic server rejected a 520-unit request above the 510-unit cap.
- After the test driver reduced B’s ORS inventory to zero and invalidated stale offers, the live donor agent read zero usable stock and explained that it could not donate the old offer.
- Every automatic briefing retained OKF concept IDs, versions and content hashes. The inventory ledger balanced.

The regular backend suite has 46 passing tests, including hospital scope, product scope, OKF metadata validation and reserve arithmetic. The raw local report is `artifacts/live-agent-test.json`; reproduce with `.venv/bin/python scripts/test_live_agents.py --live` (makes real API calls).

This is measured synthetic integration behavior, not a guarantee that all language-model explanations are correct. Typed policy and transactional validation remain authoritative; human approvals are required.
