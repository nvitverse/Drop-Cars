"""Speed up admin/staff "search by name or phone" (Allocate manually, wallet
search, find-driver, customer/vendor lookups, etc.) - idempotent, safe to
re-run, non-blocking writes.

    python scripts/add_search_trgm_indexes.py

Why: every one of those searches does `.ilike(f'%{query}%')` (a leading
wildcard) - a plain btree index can NEVER be used for that, Postgres always
falls back to a full table scan. 2026-09-29 health check: vehicle_owner_details
alone had 342k seq scans / 285M rows read even though its plain vehicle_owner_id
index (added earlier) is fine - the searches themselves were the real cost.
pg_trgm's GIN trigram index makes `ILIKE '%text%'` use an index instead.
Tables are small today so this is cheap insurance, not an emergency fix -
it matters more as the driver/owner/customer count grows.
"""
import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from sqlalchemy import text  # noqa: E402
from app.database.session import engine  # noqa: E402

INDEXES = [
    ("trgm_vehicle_owner_details_full_name", 'CREATE INDEX CONCURRENTLY IF NOT EXISTS trgm_vehicle_owner_details_full_name ON "drop-cars".vehicle_owner_details USING gin (full_name gin_trgm_ops)'),
    ("trgm_vehicle_owner_details_primary_number", 'CREATE INDEX CONCURRENTLY IF NOT EXISTS trgm_vehicle_owner_details_primary_number ON "drop-cars".vehicle_owner_details USING gin (primary_number gin_trgm_ops)'),
    ("trgm_car_driver_full_name", 'CREATE INDEX CONCURRENTLY IF NOT EXISTS trgm_car_driver_full_name ON "drop-cars".car_driver USING gin (full_name gin_trgm_ops)'),
    ("trgm_car_driver_primary_number", 'CREATE INDEX CONCURRENTLY IF NOT EXISTS trgm_car_driver_primary_number ON "drop-cars".car_driver USING gin (primary_number gin_trgm_ops)'),
    ("trgm_vendor_details_full_name", 'CREATE INDEX CONCURRENTLY IF NOT EXISTS trgm_vendor_details_full_name ON "drop-cars".vendor_details USING gin (full_name gin_trgm_ops)'),
    ("trgm_vendor_details_primary_number", 'CREATE INDEX CONCURRENTLY IF NOT EXISTS trgm_vendor_details_primary_number ON "drop-cars".vendor_details USING gin (primary_number gin_trgm_ops)'),
    ("trgm_customer_details_full_name", 'CREATE INDEX CONCURRENTLY IF NOT EXISTS trgm_customer_details_full_name ON "drop-cars".customer_details USING gin (full_name gin_trgm_ops)'),
    ("trgm_customer_details_primary_number", 'CREATE INDEX CONCURRENTLY IF NOT EXISTS trgm_customer_details_primary_number ON "drop-cars".customer_details USING gin (primary_number gin_trgm_ops)'),
    ("trgm_car_details_car_number", 'CREATE INDEX CONCURRENTLY IF NOT EXISTS trgm_car_details_car_number ON "drop-cars".car_details USING gin (car_number gin_trgm_ops)'),
]

with engine.connect().execution_options(isolation_level="AUTOCOMMIT") as conn:
    conn.execute(text('CREATE EXTENSION IF NOT EXISTS pg_trgm'))
    print("ok: pg_trgm extension")
    for name, sql in INDEXES:
        try:
            conn.execute(text(sql))
            print("ok:", name)
        except Exception as e:
            print("SKIP:", name, "-", str(e).splitlines()[0])
    for table in ("vehicle_owner_details", "car_driver", "vendor_details", "customer_details", "car_details"):
        try:
            conn.execute(text(f'ANALYZE "drop-cars".{table}'))
        except Exception as e:
            print("ANALYZE SKIP:", table, str(e).splitlines()[0])
    print("done")
