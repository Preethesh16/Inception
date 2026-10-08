"""Start the local demo's four processes and clean up children on exit."""

import os
import signal
import socket
from dotenv import load_dotenv
import subprocess
import sys
import time
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
load_dotenv(ROOT / ".env")
port = int(os.getenv("INCEPTION_API_PORT", "8000"))
while True:
    with socket.socket() as sock:
        try:
            sock.bind(("127.0.0.1", port))
            break
        except OSError:
            port += 1
env = {
    **os.environ,
    "VITE_API_TARGET": f"http://127.0.0.1:{port}",
    "PYTHONPATH": str(ROOT / "backend"),
    "PYTHONUNBUFFERED": "1",
}
commands = [
    (
        [
            str(ROOT / ".venv/bin/python"),
            "-m",
            "uvicorn",
            "inception.api:app",
            "--host",
            "127.0.0.1",
            "--port",
            str(port),
        ],
        ROOT,
    ),
    ([str(ROOT / ".venv/bin/python"), "-m", "inception.worker"], ROOT),
    (["npm", "run", "dev", "--", "--port", "5173"], ROOT / "frontend"),
    (["npm", "run", "dev", "--", "--port", "5174"], ROOT / "frontend"),
]
children = []


def stop(*_):
    for p in children:
        if p.poll() is None:
            p.terminate()
    for p in children:
        try:
            p.wait(timeout=6)
        except subprocess.TimeoutExpired:
            p.kill()
    sys.exit(0)


signal.signal(signal.SIGINT, stop)
signal.signal(signal.SIGTERM, stop)
try:
    for command, cwd in commands:
        children.append(subprocess.Popen(command, cwd=cwd, env=env))
    print(
        f"\nHospital: http://localhost:5173\nWorkflow: http://localhost:5174\nAPI: http://localhost:{port}/docs\n",
        flush=True,
    )
    while all(p.poll() is None for p in children):
        time.sleep(1)
finally:
    stop()
