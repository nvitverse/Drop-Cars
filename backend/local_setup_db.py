"""
TEMPORARY local test harness (phase 1/2) - NOT part of the app, safe to delete.

Creates the schema (via Base.metadata.create_all) and seeds synthetic data
into the local PGlite Postgres-wire server. Run once; the data persists on
disk (/tmp/pgdata_dropcars) so phase 2 (local_run_flows.py) can reuse it in a
separate process.
"""
import os
import sys
import time
import socket
import json as jsonlib
import traceback
from datetime import datetime, timezone

os.environ.setdefault("DB_HOST", "127.0.0.1")
os.environ.setdefault("DB_PASSWORD", "localtest")
os.environ.setdefault("JWT_SECRET_KEY", "local-test-secret-key-not-for-prod")
os.environ.setdefault("ADMIN_COMMESSION_ENV", "10")
os.environ.setdefault("VENDOR_COMMESSION_ENV", "80")
os.environ.setdefault("DISABLE_INTERNAL_SWEEPS", "true")
os.environ.setdefault("ACCESS_TOKEN_EXPIRE_MINUTES", "1440")
os.environ.setdefault("GOOGLE_APPLICATION_CREDENTIALS", "/tmp/dropcars_test/fake-gcp-sa.json")


def wait_for_port(host, port, timeout=20):
    start = time.time()
    while time.time() - start < timeout:
        try:
            with socket.create_connection((host, port), timeout=1):
                return True
        except OSError:
            time.sleep(0.3)
    return False


t0 = time.time()
if not wait_for_port("127.0.0.1", 5432, timeout=20):
    print("ERROR: local Postgres-wire server never came up")
    sys.exit(1)
print(f"[timing] port up after {time.time()-t0:.1f}s")

from app import main as app_main  # noqa: E402  (triggers create_all)
print(f"[timing] app import + create_all done after {time.time()-t0:.1f}s")

from app.database.session import SessionLocal  # noqa: E402
from app.core.security import get_password_hash  # noqa: E402


def seed():
    import uuid
    from app.models.admin import Admin
    from app.models.vendor import VendorCredentials, AccountStatusEnum as VendorStatus
    from app.models.vehicle_owner import VehicleOwnerCredentials, AccountStatusEnum as VOStatus
    from app.models.vehicle_owner_details import VehicleOwnerDetails
    from app.models.car_details import CarDetails, CarStatusEnum, CarTypeEnum
    from app.models.car_driver import CarDriver, AccountStatusEnum as DriverStatus
    from app.models.common_enums import DocumentStatusEnum
    from app.models.customer import CustomerCredentials
    from app.models.route_distance import RouteDistance
    from app.models.platform_setting import PlatformSetting
    from app.models.vendor_details import VendorDetails
    from app.models.customer_details import CustomerDetails

    db = SessionLocal()
    creds = {}
    try:
        # Wipe any previous run's seed rows so this script is re-runnable.
        for model in (CarDriver, CarDetails, VehicleOwnerDetails, VehicleOwnerCredentials,
                      VendorDetails, VendorCredentials, Admin, CustomerDetails, CustomerCredentials):
            db.query(model).delete()
        db.query(RouteDistance).filter(RouteDistance.origin_key == "chennai").delete()
        db.commit()

        admin = Admin(
            id=uuid.uuid4(), username="admin_test", password=get_password_hash("Test@1234"),
            role="Owner", email="admin@test.local", phone="9000000001",
            organization_id=uuid.uuid4(), balance=50000,
        )
        db.add(admin)

        vendor_active = VendorCredentials(
            id=uuid.uuid4(), reg_id="26TEST1", primary_number="9000000010",
            hashed_password=get_password_hash("Test@1234"),
            account_status=VendorStatus.ACTIVE,
        )
        vendor_pending = VendorCredentials(
            id=uuid.uuid4(), reg_id="26TEST2", primary_number="9000000011",
            hashed_password=get_password_hash("Test@1234"),
            account_status=VendorStatus.PENDING,
        )
        db.add_all([vendor_active, vendor_pending])
        db.flush()

        db.add(VendorDetails(
            id=uuid.uuid4(), vendor_id=vendor_active.id,
            full_name="Active Test Vendor", primary_number=vendor_active.primary_number,
            gpay_number="9000000010", aadhar_number="555566667777",
            aadhar_status=DocumentStatusEnum.VERIFIED,
            address="10 Vendor Street", city="Chennai", pincode="600010",
            wallet_balance=2000,
        ))
        db.add(VendorDetails(
            id=uuid.uuid4(), vendor_id=vendor_pending.id,
            full_name="Pending Test Vendor", primary_number=vendor_pending.primary_number,
            gpay_number="9000000011", aadhar_number="888899990000",
            aadhar_status=DocumentStatusEnum.PENDING,
            address="11 Vendor Street", city="Chennai", pincode="600011",
            wallet_balance=0,
        ))

        vo_verified = VehicleOwnerCredentials(
            id=uuid.uuid4(), reg_id="26TEST3", primary_number="9000000020",
            hashed_password=get_password_hash("Test@1234"),
            account_status=VOStatus.ACTIVE,
        )
        vo_pending = VehicleOwnerCredentials(
            id=uuid.uuid4(), reg_id="26TEST4", primary_number="9000000021",
            hashed_password=get_password_hash("Test@1234"),
            account_status=VOStatus.PENDING,
        )
        db.add_all([vo_verified, vo_pending])
        db.flush()

        db.add(VehicleOwnerDetails(
            id=uuid.uuid4(), vehicle_owner_id=vo_verified.id,
            full_name="Verified Fleet Owner", primary_number=vo_verified.primary_number,
            wallet_balance=5000, aadhar_number="111122223333",
            aadhar_status=DocumentStatusEnum.VERIFIED, pan_status=DocumentStatusEnum.VERIFIED,
            address="1 Test Street", city="Chennai", pincode="600001",
            registration_fee_paid_at=datetime.now(timezone.utc),
        ))
        db.add(VehicleOwnerDetails(
            id=uuid.uuid4(), vehicle_owner_id=vo_pending.id,
            full_name="Pending Fleet Owner", primary_number=vo_pending.primary_number,
            wallet_balance=0, aadhar_number="444455556666",
            aadhar_status=DocumentStatusEnum.PENDING, pan_status=DocumentStatusEnum.PENDING,
            address="2 Test Street", city="Bangalore", pincode="560001",
            registration_fee_paid_at=None,
        ))

        car = CarDetails(
            id=uuid.uuid4(), vehicle_owner_id=vo_verified.id,
            car_name="Test Sedan", car_type=CarTypeEnum.SEDAN_4_PLUS_1,
            car_number="TN01AB1234", year_of_the_car="2022",
            rc_front_status=DocumentStatusEnum.VERIFIED, insurance_status=DocumentStatusEnum.VERIFIED,
            fc_status=DocumentStatusEnum.VERIFIED, permit_status=DocumentStatusEnum.VERIFIED,
            car_status=CarStatusEnum.ONLINE,
        )
        driver = CarDriver(
            id=uuid.uuid4(), reg_id="26TESTD1", vehicle_owner_id=vo_verified.id,
            full_name="Test Driver", primary_number="9000000030",
            hashed_password=get_password_hash("Test@1234"),
            licence_number="TESTLIC001", licence_front_status=DocumentStatusEnum.VERIFIED,
            address="3 Test Street", city="Chennai", pincode="600002",
            driver_status=DriverStatus.ONLINE,
        )
        db.add_all([car, driver])

        customer = CustomerCredentials(
            id=uuid.uuid4(), primary_number="9000000040",
            hashed_password=get_password_hash("Test@1234"),
        )
        db.add(customer)
        db.flush()
        db.add(CustomerDetails(
            id=uuid.uuid4(), customer_id=customer.id,
            full_name="Test Customer", primary_number=customer.primary_number,
        ))

        db.add(RouteDistance(
            id=uuid.uuid4(), origin_key="chennai", destination_key="bangalore",
            origin="Chennai", destination="Bangalore", distance_km=346, duration_text="6 hours 0 mins",
            source="ADMIN",
        ))

        if not db.query(PlatformSetting).filter(PlatformSetting.key == "fare_rules_json").first():
            db.add(PlatformSetting(
                key="fare_rules_json",
                value=jsonlib.dumps({"oneway_min_km": 130, "round_trip_min_km_per_day": 250, "multicity_min_km_per_day": 250}),
            ))
        if not db.query(PlatformSetting).filter(PlatformSetting.key == "cities_list").first():
            db.add(PlatformSetting(key="cities_list", value=jsonlib.dumps(["Chennai", "Bangalore", "Madurai", "Coimbatore"])))

        db.commit()

        creds.update(dict(
            admin_username="admin_test", admin_password="Test@1234",
            vendor_active_number=vendor_active.primary_number, vendor_password="Test@1234",
            vendor_active_id=str(vendor_active.id),
            vendor_pending_number=vendor_pending.primary_number,
            vo_verified_number=vo_verified.primary_number, vo_password="Test@1234",
            vo_verified_id=str(vo_verified.id),
            vo_pending_number=vo_pending.primary_number,
            driver_number=driver.primary_number, driver_password="Test@1234",
            driver_id=str(driver.id), car_id=str(car.id),
            customer_number=customer.primary_number, customer_password="Test@1234",
        ))
        print(f"[OK] Seed synthetic data: {len(creds)} fields")
    except Exception as e:
        db.rollback()
        print(f"[FAIL] Seed synthetic data -> {e!r}")
        traceback.print_exc()
    finally:
        db.close()
    return creds


if __name__ == "__main__":
    creds = seed()
    with open("/tmp/dropcars_test/creds.json", "w") as f:
        jsonlib.dump(creds, f)
    print(f"[timing] total setup time {time.time()-t0:.1f}s")
    print("Wrote creds to /tmp/dropcars_test/creds.json")
