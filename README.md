# Inception

**Medical supply intelligence: know before the shortage.**

A working local prototype for the Singularity medical-supply track. Two interfaces share a single transactional inventory ledger:

- **Hospital workspace:** http://localhost:5173 — inventory, forecasts, outbreak reports, recommendations, approvals and deliveries.
- **Workflow console:** http://localhost:5174 — regional map, actual execution events, negotiation, evidence and outcome replay.

The current demonstration uses three fictional hospitals around Mysuru, three supplies, 237 historical days at onboarding and a separate future evaluation stream. The original six-facility synthetic generator remains available for evaluation. All data and courier actions are synthetic. Reports and consumption anomalies indicate suspected incidents, not clinically confirmed outbreaks.

## Run

Requirements: Python 3.12 via `uv`, Node 20+, npm, approximately 2 GB of dependency/model storage. The first model download needs internet access.

```sh
make setup
make setup-forecast
cp .env.example .env
make dev
```

The launcher starts FastAPI, the separate CPU worker, and the two Vite frontends. It prefers backend port 8000 but automatically chooses the next available port and configures both frontend proxies. The terminal prints the actual API documentation URL.

The application generates its data and queues its first analysis automatically. `Ctrl+C` shuts down the child processes. Restarting retains the ledger. Use **Reset onboarding demo** in the console for a reproducible fresh start.

Logging out of Hospital A clears its CSV import, inventory, usage history, forecasts, outbreak reports, and active workflow. Its open console becomes empty until the next CSV upload. Hospital B and D logouts preserve their data. A's prior transfer records are archived locally; pending reservations are released, and partner stock stays at its current quantity. This is a demo reset, including for unfinished simulated deliveries, not a production shipment-cancellation workflow.

For exact Python dependency reproduction after creating the virtual environment:

```sh
uv pip sync requirements.lock --extra-index-url https://download.pytorch.org/whl/cpu --index-strategy unsafe-best-match
```

The two indexes are PyPI and the official PyTorch CPU wheel repository. The lock uses CPU-only PyTorch. npm dependencies are pinned in `frontend/package-lock.json`.

### Optional credentials

Edit `.env`, then restart:

```dotenv
OPENAI_API_KEY=your_key
OPENAI_MODEL=gpt-4.1-mini
VITE_CARTO_KEY=your_key
```

Without OpenAI credentials the assistant clearly reports **deterministic fallback** and explains current computed evidence. With a key it uses OpenAI Responses, strict function schemas and a structured decision response. The API key stays on the backend.

Without a CARTO key, the map uses OpenStreetMap tiles with attribution and normal browser caching, following the [tile usage policy](https://operations.osmfoundation.org/policies/tiles/). With a key, CARTO Positron is used. If tiles are unavailable, a labelled geographic schematic retains markers, planning zones and connections. Browser tests block public tiles and verify this fallback.

`INCEPTION_FORECAST=baseline` deliberately disables Chronos for fast development. The normal default, `auto`, loads the pinned `amazon/chronos-2` revision on CPU and validates it against two baselines. A missing model or failed download is labelled rather than disguised. Results may be cached; their original compute time and input hash remain visible. **Run live analysis** explicitly bypasses the cache so judges can observe a fresh inference. Report-only updates reuse unchanged raw forecasts and recalculate the planning adjustment.

## Demonstrate the current three-hospital journey

Follow [the presenter walkthrough](docs/demo-walkthrough.md). Kaveri starts with empty inventory; upload [its single CSV](demo-data/three-hospital/A-hospital.csv). Chamundi (nearby) and Mandya (outside the planning zone) are preloaded using the same importer. All local demonstration accounts use `Demo@2026`.

Change quantities and expiry dates in **Inventory management**, report affected supplies and explicit additional outbreak requirements, then select the product and press **Refresh workflow** in the console. Its five stages show actual forecast calculations, mapped partner search, agent messages, dual approvals, and a rider simulation backed by transfer events. Hospital navigation has four tabs: Onboarding, Past usage, Inventory management, and Approvals. No approval card is displayed without a stored proposal. Stock reductions affect projected coverage without falsely changing the consumption history.

## What is implemented

### Forecasting and evidence

- Real Chronos-2 CPU inference for 9 onboarded facility–supply series in the three-hospital demo (18 in the original evaluation network): context 180, horizon 28, batch 8, daily P10/P50/P90.
- Historical patient-load, emergency-share and report covariates; known-future weekday covariates only.
- Causal seasonal imputation of missing or stock-out-censored observations.
- Seasonal-naive and recent-level baseline comparison at two historical cutoffs and two horizons; lowest mean validation MAE selects the operational model.
- A seven-day surge planning floor, separately plotted from the raw forecast. Overlapping reported requirements and observed surges are not added twice.
- Robust median/MAD anomaly detection, persistence checks, nearby-facility corroboration, scoped incident reports with correction/withdrawal APIs and 72-scenario-hour expiry.
- Fixed-seed synthetic generator; historical ledger export is separately reconciled from the live demo opening snapshot. The artificial stock reset between these two datasets is explicit.

### Inventory and redistribution

- Fractional-day FEFO simulation handles expiry, confirmed arrivals, reservations and incoming transfers.
- Whole-pack allocation by urgency tier, coverage, emergency demand and relevant patient load.
- Donor protection over the larger of seven days or lead time plus two, with a normal-day reserve. Protection is bounded by the 28-day forecast.
- Automatic donors are outside the active planning zone and have no projected shortage within the evaluated horizon; the latter is a conservative extra safeguard against circular borrowing.
- Recipient batch-consumption checks, unit and storage matching, quarantine exclusions, and a two-day residual-life requirement.
- Each proposal shows the effect of **that proposal alone**, not the sum of unrelated unapproved recommendations.
- Symmetric simulated travel times derived from straight-line distance, a road factor and handling time. Dashed map lines are transfer connections, not navigation routes.

### Agents and transactions

- Initial requests/counteroffers are generated by the deterministic policy negotiator and labelled accordingly. Each involved hospital automatically receives a scoped briefing on new proposals. OpenAI supplies these briefings when configured, plus on-demand explanations and user-requested constrained counteroffers through validated tools. Automatic agents may submit a bounded counteroffer through server-validated tools, but cannot approve, move stock or start recursive analysis jobs.
- Three rounds per proposal, repeated-request deduplication, exact-term approvals, and fresh proposal records after reanalysis.
- Two distinct hospital approvals atomically reserve batches. Concurrent or repeated approvals cannot duplicate a reservation.
- Dispatch decrements donor stock; receipt credits recipient stock. Duplicate pickup and receipt commands are idempotent.
- Cancellation before pickup releases reservations. Uncollected reservations expire after 30 wall-clock minutes; open offers expire after 24 hours. In-transit stock is never automatically credited.
- Append-only movement/event records, SQLite WAL, short `BEGIN IMMEDIATE` transactions, optimistic analysis revisions and generation checks after reset.
- Durable jobs with a 30-minute lease, refreshed at inference milestones; a single worker can recover abandoned jobs.
- SSE live events with event IDs and reconnect recovery, plus periodic snapshot refresh.

### Knowledge

`knowledge/` is a small OKF v0.2 bundle. It contains policy explanations, metric definitions and an incident playbook. Live quantities and approvals stay in the database. The backend’s executable policy configuration is authoritative. No vector database is required for four relevant documents.

## Verify

```sh
make test
make build
make types
make evaluate
cd frontend
npx playwright install chromium
npm run test:e2e
```

The browser tests expect `make dev` to be running. They **reset and modify the local synthetic demo**, perform the complete cross-hospital transfer, download evidence and check mobile overflow.

`make evaluate` runs independent synthetic seeds 2027 and 2028. Its artifact includes forecast errors, daily interval coverage, shortage-alert precision/recall and lead times, anomaly precision/recall and delays. It is visible in the console and included in the evaluation export.

- Backend tests: `backend/tests/`
- Browser journey: `frontend/tests/demo.spec.ts`
- Generated OpenAPI contract: `artifacts/openapi.json`
- Generated request types: `frontend/src/lib/generated-api.d.ts`
- Evaluation and screenshots: `artifacts/`

Daily P90 values form a stress path; their sum is **not** a calibrated 90% total-demand bound. Synthetic results establish reproducibility and software behaviour, not performance on real hospitals.

## API and persistence

Open the printed `/docs` URL for typed API requests. Demo sessions use the `X-Demo-Session` header (`demo-A` through `demo-F`, or `demo-judge`). Browser downloads and SSE use the equivalent query token. These are intentionally selectable **local demonstration roles**, not production authentication.

The SQLite database contains separate versioned record tables for facilities, supplies, batches, movements, replenishments, reports, forecasts, negotiations, transfers, runs, incidents, allocations and settings, plus dedicated jobs and events tables. Payloads are JSON within the per-domain tables for prototype flexibility. Alembic’s initial migration creates the schema idempotently.

The forecast worker reads only `history_at(cutoff)`. Evaluation reads the future data through a separate path. The worker computes outside write transactions and commits only if its scenario generation and inventory revision are still current.

No EHR connectivity, public deployment, production identity provider, real disease feed, payment system or live courier integration is implied. No code has been pushed automatically to GitHub.

## Current implementation and limits

The three-hospital flow supersedes the earlier two-hospital and scenario-button presentation. [Single-file datasets](demo-data/three-hospital/) and [the walkthrough](docs/demo-walkthrough.md) are the current demo reference.

Demand forecasts refresh every five minutes and after data changes. Cache provenance remains visible. Unchanged refreshes preserve current approvals. Hospital facts from the CSV enter source-linked knowledge; numerical policy enforcement remains in typed code.

No additional paid service is required for the deterministic local demonstration. Live OpenAI calls and CARTO tile rendering need their optional keys and external verification. This is a local hackathon prototype: production authentication, real hospital feeds, real courier dispatch and public deployment remain outside its scope.

### Search triggers and console scope

Search is forecast-gated per facility and supply. Pack-sized unmet demand triggers donor search; genuinely unused expiring stock triggers recipient search, preserving protected donor demand and requiring recipient consumption before expiry. No actionable risk means no search. Partner agents use their own imported history and forecast evidence. The console selects one controlled hospital and shows each of its products separately.


### Agent knowledge and live tests

See [hospital agents and OKF knowledge](docs/agent-knowledge.md) for retrieval, per-hospital/product scoping, policy provenance and the opt-in live API test. `make test` does not use paid API credentials.
