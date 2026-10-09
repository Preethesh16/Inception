# Validation record

## Current integration: 9 October 2026

Implementation reference: [`17ad6f4`](https://github.com/Preethesh16/Inception/commit/17ad6f4731ade526c4901c391e784ed020746145).

| Check | Result and scope |
| --- | --- |
| Backend | **80 tests passed** in the final full run. Covers API scope, atomic imports, chronological forecasting, uncertainty, FEFO, donor/recipient checks, concurrent approvals, idempotent movements and resets. |
| Browser | **18 distinct acceptance checks passed across the initial run and focused reruns.** Includes landing sections, login, upload validation, usage/expiry views, agreements, mobile layout and the full transfer journey. This was not one uninterrupted green run. |
| Build | TypeScript and Vite production build passed. Vite reports a large Three.js chunk; this does not fail compilation. |
| Live assistant | Explicit OpenAI query returned an answer with eight source references and no fallback error. |
| Real forecasting | The browser acceptance backend ran Chronos-2 on CPU. Final focused agreement/transfer checks used explicitly disabled OpenAI automatic briefings, with labelled deterministic explanations; the live assistant was checked separately. |

The integration exposed an API mismatch: the new network-status view still read a removed delivery-based risk field. The fix uses current stockout, stress and uncertainty-review fields. Regression tests cover risk levels without exposing another hospital's private inventory. Browser checks were also aligned with the current landing content and login animation.

The complete browser journey verifies CSV upload, stock reductions, reports at two nearby hospitals, donor rerouting, an over-limit counteroffer, approvals by both hospitals, simulated receipt, exact stock changes and ledger reconciliation.

### Additional earlier live checks on 9 October

Before the latest UI integration, the full 15-check browser suite passed in 4.3 minutes, alongside 77 backend tests. Separate live checks verified browser SSE connectivity, scoped events, rejection of a partially invalid CSV without partial writes, duplicate stock movements applying once, and cross-hospital movement rejection. These are historical checks for the preceding interface, not additional tests in the current count.

## Evidence boundaries

- Test hospitals, consumption and courier actions are synthetic. Passing software tests does not establish real-world forecast accuracy or clinical effectiveness.
- Browser acceptance blocks public map tiles and exercises the labelled geographic fallback. It does not establish CARTO or OpenStreetMap tile availability.
- The committed `evaluation-reference.json` is an older synthetic evaluation artifact. Its historical model-selection metrics do not describe the current Chronos-only policy, and its scores should not be presented as fresh measurements.
- Current pinned Chronos revision: `29ec3766d36d6f73f0696f85560a422f50e8498c`. An older validation note included an extra trailing character; the current configuration is authoritative.
- No hosted CI run or coverage percentage is claimed here. Results were recorded locally.

## Reproduce the checks

From the repository root:

```bash
make test
make build
```

For browser acceptance, keep `make dev` running for the two frontend ports. Run a separate API and **one** worker against a disposable directory. Commands below assume port 8013 is free.

Terminal 2, repository root:

```bash
INCEPTION_DATA_DIR="$PWD/data/e2e" \
INCEPTION_FORECAST=chronos \
OPENAI_API_KEY='' \
PYTHONPATH=backend \
.venv/bin/python -m uvicorn inception.api:app --host 127.0.0.1 --port 8013
```

Terminal 3, repository root, using the same data directory:

```bash
INCEPTION_DATA_DIR="$PWD/data/e2e" \
INCEPTION_FORECAST=chronos \
OPENAI_API_KEY='' \
PYTHONPATH=backend \
.venv/bin/python -m inception.worker
```

Terminal 4:

```bash
cd frontend
npx playwright install chromium
E2E_API_TARGET=http://127.0.0.1:8013 npm run test:e2e
```

The explicit empty OpenAI key isolates acceptance tests from paid-service latency. Chronos remains real. Omitting that override enables configured live OpenAI calls, which can materially increase test duration. The active demo's database is preserved because browser and test API requests are routed to the disposable backend.

Stop the disposable API and worker after testing. The disposable `data/e2e` directory is ignored by Git and contains generated demo state and caches.

For opt-in live agent checks, see [agent knowledge](agent-knowledge.md). For separate synthetic forecasting evaluation, run `make evaluate` and inspect the generated artifact rather than quoting archived scores as current results.
