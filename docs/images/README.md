# README screenshots

These are actual application screenshots captured on 9 October 2026 using fictional hospital data. They are checked in here because runtime `artifacts/` is intentionally ignored by Git.

| File | Source | What it shows |
| --- | --- | --- |
| `hero.png` | Fresh read-only browser capture of the local landing page after integration | Hospital network and Pip guide. |
| `inventory.png` | `artifacts/inventory-management.png`, upload/browser acceptance | Expiry watch and an inspected ORS batch. |
| `usage.png` | Fresh read-only browser capture of the hospital workspace after integration | Product-level consumption exploration. |
| `workflow.png` | `artifacts/five-stage-search.png`, full workflow acceptance | Real Chronos forecast, conditional simulation metrics and geographic fallback. |
| `transfer-agreement.png` | `artifacts/transfer-agreement.png`, agreement acceptance | Proposed quantities, batches, explanations and human approvals. |

Screenshots span different test scenarios. Displayed quantities and proposal IDs are illustrative runtime results, not a single continuous transaction. The agreement capture uses labelled deterministic agent briefings; it is not presented as a live LLM response. The workflow map is explicitly labelled as a geographic schematic when public tiles are blocked.

When replacing these images, use synthetic data, retain visible model/fallback labels, and update this record. Do not include `.env` files, API tokens or real patient information in captures.
