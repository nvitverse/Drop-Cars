#!/usr/bin/env python3
"""
Migration script for the Car-Pool request/approve flow's real tables
(carpool_journeys, carpool_requests) - backing app/models/carpool.py and
the /api/carpool/* routes in carpool_routes.py.
"""

from sqlalchemy import create_engine, text
from app.database.session import DATABASE_URL


def run_migration():
    try:
        engine = create_engine(DATABASE_URL)

        migration_sql = """
        CREATE TABLE IF NOT EXISTS carpool_journeys (
            id VARCHAR PRIMARY KEY,
            host_name VARCHAR NOT NULL,
            host_phone VARCHAR NOT NULL,
            host_rating FLOAT DEFAULT 5.0,
            pickup_city VARCHAR NOT NULL,
            drop_city VARCHAR NOT NULL,
            start_date VARCHAR NOT NULL,
            start_time VARCHAR NOT NULL,
            car_name VARCHAR NOT NULL,
            car_category VARCHAR NOT NULL,
            driver_name VARCHAR NOT NULL,
            driver_rating FLOAT DEFAULT 5.0,
            total_seats INTEGER NOT NULL DEFAULT 4,
            available_seats INTEGER NOT NULL DEFAULT 3,
            seat_fare INTEGER NOT NULL DEFAULT 350,
            private_fare_equivalent INTEGER NOT NULL DEFAULT 1400,
            status VARCHAR NOT NULL DEFAULT 'ACTIVE',
            source_booking_id VARCHAR,
            is_customer_hosted BOOLEAN DEFAULT TRUE,
            created_at TIMESTAMPTZ NOT NULL DEFAULT now()
        );
        CREATE INDEX IF NOT EXISTS ix_carpool_journeys_pickup_city ON carpool_journeys (pickup_city);
        CREATE INDEX IF NOT EXISTS ix_carpool_journeys_drop_city ON carpool_journeys (drop_city);
        CREATE INDEX IF NOT EXISTS ix_carpool_journeys_status ON carpool_journeys (status);

        CREATE TABLE IF NOT EXISTS carpool_requests (
            id VARCHAR PRIMARY KEY,
            journey_id VARCHAR NOT NULL REFERENCES carpool_journeys(id),
            passenger_id VARCHAR NOT NULL,
            passenger_name VARCHAR NOT NULL,
            passenger_phone VARCHAR NOT NULL,
            seats_requested INTEGER NOT NULL DEFAULT 1,
            status VARCHAR NOT NULL DEFAULT 'PENDING',
            requested_at TIMESTAMPTZ NOT NULL DEFAULT now()
        );
        CREATE INDEX IF NOT EXISTS ix_carpool_requests_journey_id ON carpool_requests (journey_id);
        CREATE INDEX IF NOT EXISTS ix_carpool_requests_status ON carpool_requests (status);
        """

        with engine.connect() as connection:
            connection.execute(text(migration_sql))
            connection.commit()

        print("Migration completed successfully!")
        print("Created: carpool_journeys, carpool_requests")

        with engine.connect() as connection:
            for table in ("carpool_journeys", "carpool_requests"):
                result = connection.execute(text(f"SELECT to_regclass('public.{table}') IS NOT NULL AS exists"))
                exists = result.fetchone()[0]
                print(f"Verification: {table} {'exists' if exists else 'MISSING'}")

    except Exception as e:
        print(f"Migration failed: {str(e)}")
        return False

    return True


if __name__ == "__main__":
    print("Starting migration for Car-Pool journeys/requests tables...")
    success = run_migration()

    if success:
        print("\nMigration completed successfully!")
    else:
        print("\nMigration failed. Please check the error messages above.")
