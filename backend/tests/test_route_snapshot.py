"""No API route may disappear unnoticed. On 2026-10-02 and 2026-10-11 an older backend was deployed over the newer one and the live API lost
up to 73 routes without any error. tests/routes_snapshot.txt lists every METHOD + path the API has had; this test fails when one is gone.
New routes are fine. If you REMOVE a route on purpose, delete its line from the snapshot in the same commit and say why in the commit message.
(Refresh the list after adding routes:  python -m scripts.update_route_snapshot   from backend/ - it only ever adds lines.)"""
import pathlib

SNAPSHOT = pathlib.Path(__file__).with_name("routes_snapshot.txt")


def _current():
    from app.main import app
    out = set()
    for r in app.routes:
        path = getattr(r, "path", None)
        for m in (getattr(r, "methods", None) or []):
            if m in ("HEAD", "OPTIONS"):
                continue
            out.add(f"{m} {path}")
    return out


def test_no_route_has_been_lost():
    wanted = {ln.strip() for ln in SNAPSHOT.read_text(encoding="utf-8").splitlines() if ln.strip() and not ln.startswith("#")}
    missing = sorted(wanted - _current())
    assert not missing, f"{len(missing)} API route(s) that used to exist are gone (an older backend over a newer one?):\n" + "\n".join(missing[:40])
