# Single-file hospital imports

- **A-hospital.csv**: Kaveri General Hospital; upload this once after login.
- **B-hospital.csv**: Chamundi Community Hospital; already parsed on demo reset.
- **D-hospital.csv**: Mandya Regional Hospital; already parsed on demo reset.

Each CSV contains profile, supply definitions, inventory batches, 237 daily consumption observations per supply, and scheduled replenishments. `record_type` identifies the section. All quantities use explicit supply units; transfers use the defined pack sizes. Opening date: 5 October 2026. All records are synthetic.

Login password for all three demonstration accounts: `Demo@2026`. See `docs/demo-walkthrough.md` for the complete presentation sequence. Resetting the demo regenerates these reproducible files and preloads the partner CSVs through the same importer.
