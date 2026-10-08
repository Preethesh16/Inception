# Hospital agents and operational knowledge

The agents use the [Open Knowledge Format v0.2 specification](https://github.com/GoogleCloudPlatform/open-knowledge-format/blob/main/SPEC.md): Markdown concepts with YAML frontmatter, concept-path identifiers and links. `backend/inception/knowledge.py` validates the required `type`, resolves local concept links within the bundle, and records each selected concept's version and SHA-256 content hash.

## What an agent reads

| Evidence | Source | Scope |
|---|---|---|
| Batch quantities, reservations, quarantine, expiry | SQLite inventory tools | Own hospital |
| Confirmed/scheduled arrivals | SQLite replenishments | Own hospital |
| Consumption history, raw and adjusted forecasts, stress path | Forecast run records | Own hospital |
| Exact donor reserve arithmetic | Same function used by the donor safety engine | Own hospital |
| Proposal quantity, limit, version and shared counteroffers | Negotiation records | Offers involving that hospital |
| Supply identity, expiry rules, donor policy, stock-out definition | Selected OKF concepts | Relevant supplies and policy links |
| Hospital profile and import provenance | OKF document generated from its validated CSV | Own hospital |

Other hospitals' batch inventories and private agent briefings are excluded. Imported profiles, including older imports, are normalized to the current OKF metadata format on retrieval. The buyer may read the offered quantity and its enforced cap, which are shared negotiation terms. Live balances are never taken from the CSV profile prose: those documents describe the import and explicitly direct the agent to current tools for stock.

The agent receives selected concepts with its initial evidence and can retrieve them again using `read_operational_policy`. Relevant supply concepts and incident guidance are selected by IDs; linked policy concepts are included. No vector database or embedding search is needed for this small, structured bundle.

## Negotiation and authority

Automatic briefings are generated separately for each proposal and hospital, with evidence restricted to that proposal’s product. Product-specific questions also select that product’s evidence. This prevents one supply’s reserve from being quoted for another. Each hospital reads its own state. Agents may submit at most one constrained counteroffer per proposal per automatic pass. The server enforces pack sizes, allocation limits, hospital scope and the overall three-round limit. A changed inventory invalidates pending offers. Agents cannot approve transfers or mutate stock.

The donor reserve is the sum of the higher demand path over the policy horizon **plus a buffer measured in normal-demand units**. It is not an additional day on the higher path. The engine supplies this arithmetic directly to the agent; expiry, arrivals and competing recipients may constrain the release further. Typed policy configuration remains authoritative over Markdown and model prose.

Each generated briefing stores policy version, selected concept IDs/content hashes, accepted citations, model mode and timestamp. The console displays actual messages and labels deterministic fallback output. Both administrators must approve the same proposal version before reservation.

## Reproducing the live test

Run `.venv/bin/python scripts/test_live_agents.py --live` to use the ignored local API key against a disposable database. This opt-in command makes paid OpenAI calls. It runs local Chronos inference, automatic two-hospital briefings, explicit inventory/policy tool retrieval, a real feasible model counteroffer, an over-limit backend check, and a donor-stock-change check. It also checks that no model call approved a transfer or moved inventory, and that the ledger balances.

The report is written to `artifacts/live-agent-test.json`. The regular pytest suite explicitly disables live credentials and uses mocks where appropriate. Synthetic integration tests establish workflow behavior, not general reliability on real hospital data; language-model explanations remain estimates grounded in supplied records, while transaction constraints are deterministic.
