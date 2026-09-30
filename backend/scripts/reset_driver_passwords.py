"""One-time reset: every fleet owner's password (--who drivers = duty drivers) becomes the LAST 6 DIGITS of their primary mobile number.

    python scripts/reset_driver_passwords.py                       # dry run: counts + sample, changes nothing
    python scripts/reset_driver_passwords.py --apply               # really reset (writes a backup file first)
    python scripts/reset_driver_passwords.py --restore backup.json # put the old password hashes back

Point it at the real database with the usual env overrides (DB_HOST / DB_PORT / DB_NAME / DB_USER / DB_PASSWORD) - the
password is never stored in this file.

Safety: before --apply the old hashes are saved to a JSON backup (kept OUTSIDE git; delete it afterwards, it holds
credentials). token_version is not touched, so logged-in devices stay logged in. Drivers whose number has fewer than 6
digits are skipped and listed.
"""
import argparse
import json
import os
import re
import sys
from datetime import datetime

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from app.core.security import get_password_hash  # noqa: E402
from app.database.session import SessionLocal  # noqa: E402
import pkgutil  # noqa: E402
import importlib  # noqa: E402
import app.models as _models  # noqa: E402

# Load every model so the foreign keys (car_driver -> vehicle_owner ...) resolve.
for _m in pkgutil.iter_modules(_models.__path__):
    try:
        importlib.import_module(f"app.models.{_m.name}")
    except Exception:
        pass
from app.models.car_driver import CarDriver  # noqa: E402
from app.models.vehicle_owner import VehicleOwnerCredentials  # noqa: E402


def last6(number):
    digits = re.sub(r"\D", "", number or "")
    return digits[-6:] if len(digits) >= 6 else None


def main():
    p = argparse.ArgumentParser()
    p.add_argument("--who", choices=["owners", "drivers"], default="owners", help="fleet owners (vehicle_owner) or duty drivers (car_driver)")
    p.add_argument("--apply", action="store_true", help="actually reset (default is a dry run)")
    p.add_argument("--restore", help="backup JSON file to restore old hashes from")
    p.add_argument("--backup-dir", default=os.path.expanduser("~"), help="where to write the backup file")
    a = p.parse_args()

    Model = VehicleOwnerCredentials if a.who == "owners" else CarDriver
    db = SessionLocal()
    try:
        if a.restore:
            with open(a.restore, encoding="utf-8") as f:
                old = json.load(f)
            n = 0
            for row in db.query(Model).filter(Model.id.in_(list(old.keys()))).all():
                row.hashed_password = old[str(row.id)]
                n += 1
            db.commit()
            print(f"Restored {n} rows from {a.restore}")
            return

        drivers = db.query(Model).all()
        todo, skipped = [], []
        for d in drivers:
            (todo if last6(d.primary_number) else skipped).append(d)
        print(f"Total: {len(drivers)} | will reset: {len(todo)} | skipped (number < 6 digits): {len(skipped)}")
        for d in skipped:
            print("  skipped:", d.reg_id, getattr(d, "full_name", ""), d.primary_number)
        for d in todo[:5]:
            print(f"  e.g. {d.reg_id} {getattr(d, 'full_name', '')}  {d.primary_number} -> password {last6(d.primary_number)}")

        if not a.apply:
            print("\nDRY RUN - nothing changed. Re-run with --apply to reset.")
            return

        backup = os.path.join(a.backup_dir, f"{a.who}_password_backup_{datetime.now():%Y%m%d_%H%M%S}.json")
        with open(backup, "w", encoding="utf-8") as f:
            json.dump({str(d.id): d.hashed_password for d in todo}, f)
        print("Backup written:", backup)

        for d in todo:
            d.hashed_password = get_password_hash(last6(d.primary_number))
        db.commit()
        print(f"Done. {len(todo)} {a.who} passwords reset to the last 6 digits of their primary number.")
    finally:
        db.close()


if __name__ == "__main__":
    main()
