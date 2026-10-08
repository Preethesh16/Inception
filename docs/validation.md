# Validation record

Measured in this workspace on 2026-10-08.

- **41 backend tests passed**: rubric arithmetic, FEFO expiry, fractional arrival timing, missing-data handling, no future leakage, anomaly clustering, competing recipients, donor protection, no-donor escalation, role scope, CSV atomicity, counteroffer caps, approval versioning, duplicate receipts, concurrent reservation, cancellation, expiry cleanup, structured OpenAI tool-loop mock, and forced inference request.
- **Browser transfer acceptance passed** on both ports: report, rejected over-limit counteroffer, buyer approval, donor approval, courier claim/pickup/transit/receipt, balanced ledger, dataset download, outcome replay.
- **390 px mobile check passed** after correcting action-button wrapping; no page-level horizontal overflow.
- **Production frontend build passed**, with chart/map/workflow code split into separate chunks.
- **Python static unused-name/import checks passed**.
- **Alembic initial schema migration passed** against the local demo database.
- **Fresh Chronos smoke test passed**: 18 series, model `chronos-2`, `source=live`, one regional incident, eight open feasible proposals, balanced ledger. Full fresh inference and historical validation took **12.33 seconds** with model weights already downloaded.

Model revision: `29ec3766d36d6f73f0696f85560a422f50e8498c1`.

Independent synthetic seeds 2027 and 2028 selected Chronos-2 over both baselines. Raw held-out MAE was 7.415 and 6.707 units respectively. Incident-adjusted WAPE was 10.71% and 9.72%. Anomaly precision was 91.67% and recall 84.62% on both test seeds, with two-day detection delays in the evaluated incidents. Full counts, horizons, interval coverage, shortage metrics and model-selection results are in `evaluation-reference.json`.

These tests are small synthetic scenarios, not clinical validation or evidence of generalisation to real hospital demand.

## Not externally verified

- A real OpenAI request was not executed because no API key was configured. The actual SDK integration is implemented; its strict tool loop is tested with a mock, and the no-key fallback was exercised in the browser/backend tests.
- CARTO tile service rendering was not exercised because no tile API key was configured. The labelled geographic fallback was exercised.
- Courier movement is an intentional simulation; no real dispatch or hospital-system integration is attempted.

## Three-hospital acceptance (current interface)

The browser journey verifies single-file Kaveri onboarding, stock edits, a nearby Chamundi offer, reports at both adjacent hospitals, donor rerouting to Mandya, rejected over-limit counteroffer, two hospital approvals, courier receipt, all six backend-driven stages, a balanced ledger and grounded chat. Backend tests additionally cover atomic bundle rejection, scoped login and knowledge, expiry-change idempotency and refusing edits to reserved stock.

## Forecast-gated redistribution and scoped console

Four browser tests pass: the complete three-hospital transfer, mobile layout, expiry edits, and controlled-hospital scoping across all three product charts. Backend coverage includes no search for adequate stock, no expiry search when a batch is needed locally, forecast-supported expiry rescue without a recipient shortage, rejection when recipient demand is absent, and persisted per-hospital search/skipped events.
