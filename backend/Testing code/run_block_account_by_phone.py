"""Block an account for good by phone number (what the Admin App's 'Block for good' does), from a terminal.

    python "Testing code/run_block_account_by_phone.py" 9884628317 "Left the platform - subscription refunded, account closed"            # dry run
    python "Testing code/run_block_account_by_phone.py" 9884628317 "Left the platform ..." --apply                                       # really block

The backend/.env in this repo points at a fake localhost database: set DB_HOST / DB_PASSWORD (and the other DB_* values) to the real
Cloud SQL ones for the shell you run this from (see the migration notes). Dry run prints what would be blocked and changes nothing.

What a block does: the account (and, for a fleet owner, every driver and car under it) can no longer log in or use the app, its documents are
erased from storage, and its phone, alternate phone, e-mail, Aadhaar, PAN, licence and vehicle numbers are stored as HASHES in
blocked_identifiers so none of them can be used to register again.
"""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.database.session import SessionLocal                      # noqa: E402
from app.models.car_driver import CarDriver                         # noqa: E402
from app.models.car_details import CarDetails                       # noqa: E402
from app.models.vehicle_owner import VehicleOwnerCredentials        # noqa: E402
from app.models.vehicle_owner_details import VehicleOwnerDetails    # noqa: E402
from app.models.vendor import VendorCredentials                     # noqa: E402
from app.utils import blocklist                                     # noqa: E402


def main() -> None:
    if len(sys.argv) < 3:
        print(__doc__)
        sys.exit(1)
    phone = blocklist.normalize(blocklist.PHONE, sys.argv[1])
    reason = sys.argv[2]
    apply = "--apply" in sys.argv
    if not phone:
        print("That is not a 10-digit phone number.")
        sys.exit(1)

    db = SessionLocal()
    try:
        found = []
        for o in db.query(VehicleOwnerCredentials).filter(VehicleOwnerCredentials.primary_number.like("%" + phone)).all():
            det = db.query(VehicleOwnerDetails).filter(VehicleOwnerDetails.vehicle_owner_id == o.id).first()
            drivers = db.query(CarDriver).filter(CarDriver.vehicle_owner_id == o.id).count()
            cars = db.query(CarDetails).filter(CarDetails.vehicle_owner_id == o.id).count()
            found.append(("vehicle_owner", o.id, f"{det.full_name if det else '?'} | wallet Rs {det.wallet_balance if det else '?'} | "
                          f"status {o.account_status.value} | {drivers} driver(s), {cars} car(s)"))
        for d in db.query(CarDriver).filter(CarDriver.primary_number.like("%" + phone)).all():
            found.append(("driver", d.id, f"{d.full_name} | owner {d.vehicle_owner_id}"))
        for v in db.query(VendorCredentials).filter(VendorCredentials.primary_number.like("%" + phone)).all():
            found.append(("vendor", v.id, f"vendor {v.primary_number}"))
        if not found:
            print("No account with that phone number.")
            return
        for kind, i, text in found:
            print(f"  {kind:14} {i}  {text}")
        if not apply:
            print("\nDRY RUN - nothing changed. Add --apply to block these for good.")
            return

        from app.crud.admin_management import set_permanent_block
        for kind, i, _ in found:
            res = set_permanent_block(db, str(i), kind, reason, blocked=True, by="operations (terminal)")
            print("BLOCKED", kind, i, res)
        try:
            blocklist.assert_not_blocked(db, phone=phone)
            print("WARNING: the number is still not on the blocklist!")
        except Exception as e:  # noqa: BLE001
            print("Check OK - the number is refused for any new account:", getattr(e, "detail", e))
    finally:
        db.close()


if __name__ == "__main__":
    main()
