.PHONY: setup setup-forecast dev test build seed types evaluate
setup:
	uv venv --python 3.12 .venv
	uv pip install -e '.[dev]'
	cd frontend && npm ci
setup-forecast:
	uv pip install torch --index-url https://download.pytorch.org/whl/cpu
	uv pip install 'chronos-forecasting==2.3.2'
dev:
	.venv/bin/python scripts/dev.py
test:
	.venv/bin/python -m pytest -q
build:
	cd frontend && npm run build
seed:
	.venv/bin/python -c 'from inception.store import Store; from inception.seed import seed; seed(Store())'
types:
	.venv/bin/python scripts/export_openapi.py
	cd frontend && npx openapi-typescript ../artifacts/openapi.json -o src/lib/generated-api.d.ts
evaluate:
	.venv/bin/python scripts/evaluate.py
