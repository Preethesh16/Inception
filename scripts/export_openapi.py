import json
from pathlib import Path
from inception.api import app

Path("artifacts").mkdir(exist_ok=True)
Path("artifacts/openapi.json").write_text(json.dumps(app.openapi(), indent=2))
