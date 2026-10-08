# Three-hospital, edit-driven demonstration

Open **http://localhost:5173** for hospital login and **http://localhost:5174** for the operations console. Run `make dev` if stopped.

## Accounts and starting state

All local demo accounts use **Demo@2026**. Selecting a hospital fills its email.

| Hospital | Email | Initial state |
|---|---|---|
| Kaveri General (A) | admin@kaveri.demo | Empty inventory; upload one CSV |
| Chamundi Community (B) | admin@chamundi.demo | CSV already imported; nearby potential donor |
| Mandya Regional (D) | admin@mandya.demo | CSV already imported; outside-zone potential donor |

These are synthetic facilities and local demonstration accounts, not production identity management. Use separate browser tabs for the hospitals; sessions are hospital-scoped. The console is a local judge role and cannot approve for a hospital.

## 1. Upload Kaveri's one-file dataset

Log into Kaveri. In **Inventory**, download its hospital CSV or use:

`demo-data/three-hospital/A-hospital.csv`

Choose the file and click **Import hospital**. It contains one profile, three supply definitions, six inventory batches, 711 completed daily consumption observations, and three scheduled replenishments. Its `record_type` column determines how each row is parsed. All sections are validated before any changes commit.

The import creates a versioned, source-linked facility knowledge document containing profile and dataset provenance. Agents read it alongside the OKF policy bundle and current database facts. Live stock stays in the ledger; Markdown does not become a second inventory database. The CSV does not contain future demand.

Partner CSVs are in the same folder (`B-hospital.csv`, `D-hospital.csv`). They are imported by the same parser when the demo is reset.

## 2. Demonstrate a stock shortage

Keep the operations console open. In Kaveri → **Manage inventory**:

1. Edit `A-ORS-01`, set on-hand quantity to **10**, save.
2. Edit `A-ORS-02`, set on-hand quantity to **10**, save.
3. Wait for analysis to complete.

The raw consumption forecast need not change: stock edits are not evidence of changed demand. The inventory simulator recalculates FEFO coverage, stock-out timing and unmet demand. The allocator searches nearest eligible donors, protecting their forecast demand and reserve.

In **Approvals**, inspect the nearby Chamundi offer. Quantities come from the allocator; do not expect a hard-coded offer size. The backend tests verify that the nearby hospital is chosen before an outbreak excludes it.

## 3. Demonstrate outbreak-aware rerouting

In Kaveri, click **Report outbreak**. Select oral rehydration sachets (ORS), enter **140 additional units over seven days**, and submit. You can select multiple supplies and enter separate quantities.

Log into Chamundi in another tab and submit the same ORS requirement. Nearby reports produce a shared operational planning zone, labelled as reported/corroborated evidence—not confirmed infection. Both nearby hospitals are excluded as donors for affected supplies. A single report's two-kilometre buffer can already encompass the adjacent hospital; two reports provide corroborating evidence.

The system reruns planning and replaces stale recommendations. Mandya becomes the outside-zone donor if its supply, expiry and protected reserve constraints pass. The console shows the zone, rejected donors, feasible offers and unresolved need.

## 4. Negotiate, approve and deliver

1. Kaveri → **Approvals**: expand the conversation. Test a quantity above the displayed limit; the backend rejects it with a constrained response.
2. Approve feasible terms as Kaveri.
3. Log into Mandya → **Approvals**, inspect its own explanation and approve the same proposal version.
4. The reservation occurs only after both approvals. Any material counteroffer clears previous approvals.
5. Console → final stage: **Claim courier job → Confirm pickup → Start transit → Confirm receipt**.
6. Inspect **Ledger balanced** and compare projected or simulated realised outcomes.

Automatic hospital briefings are generated when new offers appear. With `OPENAI_API_KEY`, they use the Responses API and scoped tools, with at most one counteroffer per proposal per agent pass and the existing three-round limit. Without it, the conversation clearly labels deterministic explanations. User-requested counteroffers are server-validated. Neither model nor console can bypass administrator approval.

## 5. Demonstrate expiry risk

In Mandya → **Manage inventory**, edit the expiry of `D-ORS-01` to **6 October 2026** while the scenario is at 5 October. Analysis will recalculate expiry exposure and reject that batch for transfers that cannot satisfy the two-day residual-life policy. You can also edit quantities.

Reserved batches cannot be edited: complete or cancel the relevant transfer first. Every edit records the before/after state, reason and idempotent ledger movement.

## Dashboard tabs

- **Inventory:** onboarding and current supply position.
- **Past records:** consumed quantities, movement history and downloads.
- **Manage inventory:** edit batch quantities and expiry dates.
- **AI chat:** ask forecasting and operational questions; inspect the forecast chart and arithmetic.
- **Approvals:** conversations, constrained counteroffers, approvals and incoming/outgoing delivery state.

The console follows evidence → demand and risk → outbreak-aware donor search → negotiations → dual approvals → delivery/outcomes. Its automatic scrolling is optional and follows persisted backend events. While a new job runs, older completed results remain visible until replaced.

Forecasts refresh every five wall-clock minutes, and imports, edits and reports queue an immediate run. Unchanged raw inputs may reuse explicitly labelled cached output. Stock edits do not mutate consumption history. The scenario clock does not advance automatically.

## Reset and keys

Use **Reset onboarding demo** in the console. It clears synthetic transactions, reports and login sessions, leaves Kaveri empty and reloads the two partner CSVs. Log in again after resetting.

- `OPENAI_API_KEY`: live language-model briefings and chat; backend only.
- `VITE_CARTO_KEY`: optional CARTO basemap tiles; otherwise the labelled geographic schematic still shows facilities, zones and routes. This browser variable is public configuration, not a secret backend key.
- Local Chronos-2: no AWS key. Public model download needs internet on the first run.

Edit `.env` and restart `make dev` after configuring keys. Live external calls still need verification with your credentials. The remainder of the local demo works without them.

## Forecast-gated searches and focused console

The console's **Controlled hospital** selector scopes product charts, evidence, proposals and outcomes to one hospital. Opening it from a hospital dashboard passes that hospital in the link. All of that hospital's products have a separate chart and a separate decision: **Find a donor**, **Find a recipient**, or **No search**. Partner forecasts still run from their own imported consumption histories; agents receive their own recent history, planning demand, input hash and model provenance.

A donor search requires projected unmet demand of at least one supply pack within the 28-day supported horizon. A recipient search requires at least one whole pack of stock projected to expire unused locally, with no projected shortage at the donor. Expiry alone is not a trigger: stock needed locally is kept. An expiry-rescue recipient must consume the incoming stock before expiry without increasing its own waste. The donor's stress-demand protection, shelf-life margin, handling checks and outbreak exclusions still apply. If no recipient qualifies, the system explains why and does not create a proposal.

Expiry-rescue transfers may serve a hospital whose stock is currently adequate: they use that hospital's forecast consumption to prevent waste, and do not claim the recipient has a shortage. Approvals revalidate local surplus and recipient use. No search or negotiation is started when neither trigger is present.
