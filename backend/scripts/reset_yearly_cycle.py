"""Restart the yearly period of every member who has paid.

  python scripts/reset_yearly_cycle.py                       -> PREVIEW only (nothing is changed)
  python scripts/reset_yearly_cycle.py --start 2026-09-25 --apply

IMPORTANT: backend/.env points at a fake local database. Run with the REAL DB_HOST / DB_PASSWORD in the environment.
"""
import argparse
import json
import sys
from datetime import date
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.database.session import SessionLocal  # noqa: E402
from app.crud.billing import reset_yearly_cycle  # noqa: E402

ap = argparse.ArgumentParser()
ap.add_argument("--start", help="first day of the new year, YYYY-MM-DD (default: tomorrow)")
ap.add_argument("--apply", action="store_true", help="really change the data (default is preview only)")
ap.add_argument("--exclude-lapsed", action="store_true", help="leave members whose year already ran out")
a = ap.parse_args()

db = SessionLocal()
try:
    res = reset_yearly_cycle(db, start_date=date.fromisoformat(a.start) if a.start else None, dry_run=not a.apply,
                             include_lapsed=not a.exclude_lapsed)
    print(json.dumps(res, indent=2, ensure_ascii=False))
    print("\nAPPLIED" if a.apply else "\nPREVIEW ONLY - nothing was changed. Add --apply to change it.")
finally:
    db.close()
