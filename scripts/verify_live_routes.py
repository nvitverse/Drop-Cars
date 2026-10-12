"""Is what is LIVE the same backend as this repo? Compares the routes of the running Cloud Run service with the routes of this checkout.

    python scripts/verify_live_routes.py            (run from the repo root, with the backend venv)

Prints routes that exist in this repo but not live (a deploy from an older tree wipes features - this is how that is caught) and routes that are live
but missing here (someone deployed work that is not in the repo). Exit code 1 when either list is not empty (docs / openapi paths are ignored)."""
import json, os, re, sys, urllib.request, warnings

warnings.filterwarnings("ignore")
LIVE = os.getenv("LIVE_API", "https://drop-cars-api-207918408785.asia-south2.run.app")
root = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "backend")
sys.path.insert(0, root)
os.chdir(root)
from app.main import app  # noqa: E402

norm = lambda p: re.sub(r"\{[^}]+\}", "{}", p)
SKIP = ("/docs", "/redoc", "/openapi.json")
mine = {norm(r.path) for r in app.routes if getattr(r, "path", None) and not r.path.startswith(SKIP) and getattr(r, "include_in_schema", True) and r.__class__.__name__ != "APIWebSocketRoute"}   # hidden / websocket routes are not in openapi
live = set(norm(p) for p in json.load(urllib.request.urlopen(LIVE + "/openapi.json", timeout=60)).get("paths", {}) if not p.startswith(SKIP))
missing_live = sorted(mine - live)
missing_repo = sorted(live - mine)
print(f"repo routes {len(mine)} | live routes {len(live)}")
print(f"In this repo but NOT live ({len(missing_live)}):")
for p in missing_live:
    print("  -", p)
print(f"Live but NOT in this repo ({len(missing_repo)}):")
for p in missing_repo:
    print("  +", p)
sys.exit(1 if (missing_live or missing_repo) else 0)
