"""Add every current route to tests/routes_snapshot.txt (never removes a line). Run from backend/:  python -m scripts.update_route_snapshot"""
import pathlib
from tests.test_route_snapshot import SNAPSHOT, _current

have = {ln.strip() for ln in SNAPSHOT.read_text(encoding="utf-8").splitlines() if ln.strip()} if SNAPSHOT.exists() else set()
now = _current()
SNAPSHOT.write_text("# every METHOD path the API has had - see tests/test_route_snapshot.py\n" + "\n".join(sorted(have | now)) + "\n", encoding="utf-8")
print(f"{len(now - have)} new route(s) added; {len(have | now)} in the snapshot")
