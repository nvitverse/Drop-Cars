#!/usr/bin/env python3
"""
Migration script to add tracking_left_at to order_assignments.

Stamped when the driver-trip page (pages/driver-trip.php) detects it was
backgrounded/closed (visibilitychange/pagehide -> navigator.sendBeacon to
/website/trip-link/{token}/left), cleared the moment a fresh location ping
arrives - lets track-booking.php show "driver paused sharing" instead of a
silently-stale map.
"""

from sqlalchemy import create_engine, text
from app.database.session import DATABASE_URL


def run_migration():
    try:
        engine = create_engine(DATABASE_URL)

        migration_sql = """
        ALTER TABLE order_assignments
            ADD COLUMN IF NOT EXISTS tracking_left_at TIMESTAMP;
        """

        with engine.connect() as connection:
            connection.execute(text(migration_sql))
            connection.commit()

        print("Migration completed successfully!")
        print("tracking_left_at column added to: order_assignments")

        with engine.connect() as connection:
            result = connection.execute(text("""
                SELECT column_name, data_type
                FROM information_schema.columns
                WHERE table_name = 'order_assignments' AND column_name = 'tracking_left_at'
            """))
            row = result.fetchone()
            if row:
                print(f"Verification: column {row[0]} exists with type {row[1]}")
            else:
                print("Verification failed: column not found")

    except Exception as e:
        print(f"Migration failed: {str(e)}")
        return False

    return True


if __name__ == "__main__":
    print("Starting migration to add tracking_left_at column...")
    success = run_migration()

    if success:
        print("\nMigration completed successfully!")
    else:
        print("\nMigration failed. Please check the error messages above.")
