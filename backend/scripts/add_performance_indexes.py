"""Add the missing indexes found by the 2026-09-25 database health check (idempotent, non-blocking, safe to re-run).

    python scripts/add_performance_indexes.py

Why: vehicle_owner_details had NO index on vehicle_owner_id (the column almost every request looks it up by) - 341k full-table
scans on it, and the same story for car_driver.vehicle_owner_id. Tables are small today, but every scan burns CPU on the shared-core
database and gets worse as data grows. CREATE INDEX CONCURRENTLY does not block writes. Drop any of them with DROP INDEX if needed.
"""
import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from sqlalchemy import text  # noqa: E402
from app.database.session import engine  # noqa: E402

INDEXES = [
    ("ix_vehicle_owner_details_vehicle_owner_id", 'CREATE INDEX CONCURRENTLY IF NOT EXISTS ix_vehicle_owner_details_vehicle_owner_id ON "drop-cars".vehicle_owner_details (vehicle_owner_id)'),
    ("ix_car_driver_vehicle_owner_id", 'CREATE INDEX CONCURRENTLY IF NOT EXISTS ix_car_driver_vehicle_owner_id ON "drop-cars".car_driver (vehicle_owner_id)'),
    ("ix_orders_status_start", 'CREATE INDEX CONCURRENTLY IF NOT EXISTS ix_orders_status_start ON "drop-cars".orders (trip_status, start_date_time)'),
]

with engine.connect().execution_options(isolation_level="AUTOCOMMIT") as conn:
    for name, sql in INDEXES:
        conn.execute(text(sql))
        print("ok:", name)
    for table in ("vehicle_owner_details", "car_driver", "orders"):
        conn.execute(text(f'ANALYZE "drop-cars".{table}'))
    print("done")
