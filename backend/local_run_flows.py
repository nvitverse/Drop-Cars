"""
TEMPORARY local test harness (phase 2/2) - NOT part of the app, safe to delete.

Loads creds seeded by local_setup_db.py and exercises the real authenticated
API flows end-to-end via FastAPI's TestClient.
"""
import os
import sys
import time
import socket
import json as jsonlib
import traceback
from datetime import datetime, timedelta, timezone

os.environ.setdefault("DB_HOST", "127.0.0.1")
os.environ.setdefault("DB_PASSWORD", "localtest")
os.environ.setdefault("JWT_SECRET_KEY", "local-test-secret-key-not-for-prod")
os.environ.setdefault("ADMIN_COMMESSION_ENV", "10")
os.environ.setdefault("VENDOR_COMMESSION_ENV", "80")
os.environ.setdefault("DISABLE_INTERNAL_SWEEPS", "true")
os.environ.setdefault("ACCESS_TOKEN_EXPIRE_MINUTES", "1440")
os.environ.setdefault("GOOGLE_APPLICATION_CREDENTIALS", "/tmp/dropcars_test/fake-gcp-sa.json")

REPORT = []


def record(step, ok, detail=""):
    REPORT.append({"step": step, "ok": ok, "detail": detail})
    print(f"[{'OK  ' if ok else 'FAIL'}] {step}" + (f" -> {detail}" if detail else ""))


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

with open("/tmp/dropcars_test/creds.json") as f:
    creds = jsonlib.load(f)

from app import main as app_main  # noqa: E402
print(f"[timing] app import + create_all done after {time.time()-t0:.1f}s")

from fastapi.testclient import TestClient  # noqa: E402

# NOTE ON A REAL LIMITATION OF THIS LOCAL HARNESS (not a backend bug):
# app/utils/maps.py's cache lookup opens its OWN separate SessionLocal()
# instead of reusing the request's session. Real Postgres handles multiple
# concurrent connections fine, but the zero-install local Postgres-wire
# server used here (@electric-sql/pglite-socket) supports exactly ONE
# connection at a time - a second concurrent connection kills the whole
# server. That second connection is exactly what _cached_distance() opens
# while the request's own `db: Session = Depends(get_db)` connection is
# still in use, so every quote/order-creation call would otherwise crash
# the local DB entirely. We bypass the distance *lookup* here (already
# verified independently via direct psycopg2 queries above) so the actual
# thing under test - order creation -> acceptance -> wallet business logic -
# can be exercised without that harness-only artifact getting in the way.
import app.crud.new_orders as _new_orders_mod  # noqa: E402
_new_orders_mod.get_distance_km_between_locations = lambda o, d: (346, "6 hours 0 mins")

# Skip the heavy one-time migration/backfill startup handlers - create_all()
# above already built a fully current schema from the models, so the ~25
# incremental ALTER TABLE statements (meant for upgrading an existing
# production DB) are pure dead weight here, and each round-trip to the
# WASM-based local Postgres is slower than real Postgres. Keep the cheap
# ones (cities cache).
_SKIP_STARTUP_HANDLERS = {
    "ensure_admin_token_version_column",
    "ensure_extra_kyc_document_columns",
    "backfill_registration_ids",
}
app_main.app.router.on_startup = [
    h for h in app_main.app.router.on_startup
    if getattr(h, "__name__", "") not in _SKIP_STARTUP_HANDLERS
]
print(f"[timing] trimmed startup handlers, {len(app_main.app.router.on_startup)} remain")


def run_flows(creds):
    with TestClient(app_main.app) as client:
        def headers(tok):
            return {"Authorization": f"Bearer {tok}"}

        r = client.post("/api/admin/signin", json={"username": creds["admin_username"], "password": creds["admin_password"]})
        admin_token = None
        if r.status_code == 200:
            admin_token = r.json()["access_token"]
            record("Admin signin", True)
            r2 = client.get("/api/admin/orders", headers=headers(admin_token))
            record("Admin: GET /api/admin/orders", r2.status_code == 200, f"status={r2.status_code} body={r2.text[:300]}")
            r3 = client.get("/api/admin/fare-rules", headers=headers(admin_token))
            record("Admin: GET /api/admin/fare-rules", r3.status_code == 200, f"status={r3.status_code} body={r3.text[:300]}")
            r4 = client.get("/api/admin/accounts", headers=headers(admin_token))
            record("Admin: GET /api/admin/accounts", r4.status_code == 200, f"status={r4.status_code} body={r4.text[:300]}")
        else:
            record("Admin signin", False, f"status={r.status_code} body={r.text[:300]}")

        r = client.post("/api/users/vendor/signin", json={"primary_number": creds["vendor_active_number"], "password": creds["vendor_password"]})
        vendor_token = None
        if r.status_code == 200:
            vendor_token = r.json()["access_token"]
            record("Vendor (active) signin", True)
        else:
            record("Vendor (active) signin", False, f"status={r.status_code} body={r.text[:300]}")

        r = client.post("/api/users/vendor/signin", json={"primary_number": creds["vendor_pending_number"], "password": creds["vendor_password"]})
        record("Vendor (PENDING account) signin - informational", True, f"status={r.status_code} body={r.text[:200]}")

        r = client.post("/api/users/vehicleowner/login", json={"mobile_number": creds["vo_verified_number"], "password": creds["vo_password"]})
        vo_token = None
        if r.status_code == 200:
            vo_token = r.json()["access_token"]
            record("Vehicle owner signin", True)
        else:
            record("Vehicle owner signin", False, f"status={r.status_code} body={r.text[:300]}")

        r = client.post("/api/users/cardriver/signin", json={"primary_number": creds["driver_number"], "password": creds["driver_password"]})
        driver_token = None
        if r.status_code == 200:
            driver_token = r.json()["access_token"]
            record("Driver signin", True)
        else:
            record("Driver signin", False, f"status={r.status_code} body={r.text[:300]}")

        r = client.post("/api/users/customer/signin", json={"primary_number": creds["customer_number"], "password": creds["customer_password"]})
        record("Customer signin", r.status_code == 200, f"status={r.status_code} body={r.text[:300]}")

        if not (vendor_token and vo_token and driver_token):
            record("Order lifecycle flow", False, "skipped - one or more logins failed above")
            return

        start_dt = (datetime.now(timezone.utc) + timedelta(hours=2)).isoformat()
        order_payload = {
            "vendor_id": creds.get("vendor_active_id", "00000000-0000-0000-0000-000000000000"),
            "trip_type": "Oneway",
            "car_type": "SEDAN_4_PLUS_1",
            "pickup_drop_location": {"0": "Chennai", "1": "Bangalore"},
            "start_date_time": start_dt,
            "customer_name": "Test Customer",
            "customer_number": "9000000040",
            "cost_per_km": 15,
            "extra_cost_per_km": 2,
            "driver_allowance": 400,
            "extra_driver_allowance": 0,
            "permit_charges": 0,
            "extra_permit_charges": 0,
            "hill_charges": 0,
            "toll_charges": 0,
            "night_charges": 0,
            "pickup_notes": "local test order",
            "send_to": "ALL",
        }

        r = client.post("/api/orders/oneway/confirm", json=order_payload, headers=headers(vendor_token))
        order_id = None
        if r.status_code in (200, 201):
            order_id = r.json().get("order_id")
            record("Vendor: create Oneway order (Chennai->Bangalore)", True, f"order_id={order_id}")
        else:
            record("Vendor: create Oneway order (Chennai->Bangalore)", False, f"status={r.status_code} body={r.text[:500]}")

        r = client.get("/api/assignments/vehicle_owner/pending", headers=headers(vo_token))
        pending_ok = r.status_code == 200
        record("Vehicle owner: GET pending orders", pending_ok,
               f"status={r.status_code} count={len(r.json()) if pending_ok else '?'} body={r.text[:300] if not pending_ok else ''}")

        assignment_id = None
        if order_id is not None:
            r = client.post("/api/assignments/acceptorder", json={"order_id": order_id}, headers=headers(vo_token))
            if r.status_code in (200, 201):
                assignment_id = r.json().get("id")
                record("Vehicle owner: accept order", True, f"assignment_id={assignment_id}")
            else:
                record("Vehicle owner: accept order", False, f"status={r.status_code} body={r.text[:500]}")

        if assignment_id is not None:
            r = client.patch(f"/api/assignments/{assignment_id}/assign-car-driver",
                              json={"driver_id": creds["driver_id"], "car_id": creds["car_id"]},
                              headers=headers(vo_token))
            record("Vehicle owner: assign car+driver", r.status_code == 200, f"status={r.status_code} body={r.text[:500]}")

        r = client.get("/api/assignments/driver/assigned-orders", headers=headers(driver_token))
        record("Driver: GET assigned orders", r.status_code == 200, f"status={r.status_code} body={r.text[:300]}")

        if order_id is not None:
            r = client.post(f"/api/assignments/driver/start-trip/{order_id}", json={"start_km": 1000}, headers=headers(driver_token))
            record("Driver: start trip", r.status_code == 200, f"status={r.status_code} body={r.text[:500]}")

            r = client.post(f"/api/assignments/driver/end-trip/{order_id}", json={"end_km": 1350}, headers=headers(driver_token))
            record("Driver: end trip", r.status_code == 200, f"status={r.status_code} body={r.text[:500]}")

        r = client.get("/api/wallet/balance", headers=headers(vo_token))
        record("Vehicle owner: GET wallet balance", r.status_code == 200, f"status={r.status_code} body={r.text[:300]}")


if __name__ == "__main__":
    run_flows(creds)
    print(f"\n[timing] total flow time {time.time()-t0:.1f}s")
    print("\n" + "=" * 70)
    print("SUMMARY")
    print("=" * 70)
    for item in REPORT:
        print(("OK  " if item["ok"] else "FAIL"), "-", item["step"])
    failed = [i for i in REPORT if not i["ok"]]
    print(f"\n{len(REPORT) - len(failed)}/{len(REPORT)} steps passed")
    with open("/tmp/dropcars_test/report.json", "w") as f:
        jsonlib.dump(REPORT, f, indent=2)
