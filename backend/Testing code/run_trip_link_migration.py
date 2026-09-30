#!/usr/bin/env python3
"""
Migration script to add live-tracking / driver-trip-link columns to
order_assignments.

Powers the website-only driver-trip web link feature (OTP entry + odometer
photo + browser-geolocation live sharing, no Driver App login needed) - see
api/routes/website_bookings.py's /website/trip-link/{token}* endpoints.
"""

from sqlalchemy import create_engine, text
from app.database.session import DATABASE_URL


def run_migration():
    try:
        engine = create_engine(DATABASE_URL)

        migration_sql = """
        ALTER TABLE order_assignments
            ADD COLUMN IF NOT EXISTS last_lat VARCHAR,
            ADD COLUMN IF NOT EXISTS last_lng VARCHAR,
            ADD COLUMN IF NOT EXISTS last_location_at TIMESTAMP,
            ADD COLUMN IF NOT EXISTS trip_link_token VARCHAR;
        """

        with engine.connect() as connection:
            connection.execute(text(migration_sql))
            connection.commit()

        with engine.connect() as connection:
            connection.execute(text(
                "CREATE UNIQUE INDEX IF NOT EXISTS ix_order_assignments_trip_link_token "
                "ON order_assignments (trip_link_token) WHERE trip_link_token IS NOT NULL"
            ))
            connection.commit()

        print("Migration completed successfully!")
        print("last_lat, last_lng, last_location_at, trip_link_token columns added to: order_assignments")

        with engine.connect() as connection:
            result = connection.execute(text("""
                SELECT column_name, data_type
                FROM information_schema.columns
                WHERE table_name = 'order_assignments'
                  AND column_name IN ('last_lat', 'last_lng', 'last_location_at', 'trip_link_token')
                ORDER BY column_name
            """))
            rows = result.fetchall()
            for row in rows:
                print(f"Verification: column {row[0]} exists with type {row[1]}")
            if len(rows) != 4:
                print(f"Verification WARNING: expected 4 columns, found {len(rows)}")

    except Exception as e:
        print(f"Migration failed: {str(e)}")
        return False

    return True


if __name__ == "__main__":
    print("Starting migration to add trip-link/live-location columns...")
    success = run_migration()

    if success:
        print("\nMigration completed successfully!")
    else:
        print("\nMigration failed. Please check the error messages above.")
