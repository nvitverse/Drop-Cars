#!/usr/bin/env python3
"""
Migration script to add is_urgent to the hourly_rental table.

customer_booking_requests, new_orders and orders already got is_urgent via
run_urgent_booking_migration.py, but that script's table list never
included hourly_rental - so Hourly Rental bookings could never be flagged
urgent regardless of how soon the pickup was. Run this to close that gap.
"""

from sqlalchemy import create_engine, text
from app.database.session import DATABASE_URL


def run_migration():
    """Add the is_urgent column to hourly_rental."""

    try:
        engine = create_engine(DATABASE_URL)

        # Default false so existing rows are treated as normal-track
        # bookings, not urgent - same convention as the other three tables.
        migration_sql = """
        ALTER TABLE hourly_rental
            ADD COLUMN IF NOT EXISTS is_urgent BOOLEAN NOT NULL DEFAULT false;
        CREATE INDEX IF NOT EXISTS idx_hourly_rental_is_urgent ON hourly_rental(is_urgent);
        """

        with engine.connect() as connection:
            connection.execute(text(migration_sql))
            connection.commit()

        print("Migration completed successfully!")
        print("is_urgent column added to: hourly_rental")

        # Verify the change
        with engine.connect() as connection:
            result = connection.execute(text("""
                SELECT column_name, data_type, is_nullable, column_default
                FROM information_schema.columns
                WHERE table_name = 'hourly_rental' AND column_name = 'is_urgent'
            """))
            row = result.fetchone()
            if row:
                print(f"Verification (hourly_rental): column {row[0]} exists with type {row[1]}, default {row[3]}")
            else:
                print("Verification failed for hourly_rental: column not found")

    except Exception as e:
        print(f"Migration failed: {str(e)}")
        return False

    return True


if __name__ == "__main__":
    print("Starting migration to add is_urgent column to hourly_rental...")
    success = run_migration()

    if success:
        print("\nMigration completed successfully!")
        print("Hourly Rental bookings will now be flagged urgent the same way other trip types are.")
    else:
        print("\nMigration failed. Please check the error messages above.")
        print("Make sure your database is accessible and you have the necessary permissions.")
