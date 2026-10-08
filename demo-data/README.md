# Hospital onboarding kit

Use `A/` for Kaveri General Hospital and `D/` for Mandya Regional Hospital.

Upload **inventory.csv** and **consumption.csv** together in the hospital's Inventory & onboarding section. Each kit contains 6 batches and 711 completed daily consumption observations for the 5 October 2026 opening scenario. The **profile.json** and **replenishments.csv** files document the seeded facility and supplier configuration; they are reference files, not extra uploads.

All records are synthetic and reproducible. See [the presenter walkthrough](../docs/demo-walkthrough.md). Regenerate with `.venv/bin/python scripts/create_onboarding_files.py`.
