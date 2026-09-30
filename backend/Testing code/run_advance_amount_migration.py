#!/usr/bin/env python3
"""
Migration script to add advance_amount to customer_booking_requests.

Closes a real bug: a website customer's verified Razorpay advance payment
was never reaching NewOrder.advance_received, so the Driver/Vendor/Admin
apps showed 0 advance collected even when a real payment had gone through.
"""

from sqlalchemy import create_engine, text
from app.database.session import DATABASE_URL


def run_migration():
    try:
        engine = create_engine(DATABASE_URL)

        migration_sql = """
        ALTER TABLE customer_booking_requests
            ADD COLUMN IF NOT EXISTS advance_amount INTEGER;
        """

        with engine.connect() as connection:
            connection.execute(text(migration_sql))
            connection.commit()

        print("Migration completed successfully!")
        print("advance_amount column added to: customer_booking_requests")

        with engine.connect() as connection:
            result = connection.execute(text("""
                SELECT column_name, data_type, is_nullable
                FROM information_schema.columns
                WHERE table_name = 'customer_booking_requests' AND column_name = 'advance_amount'
            """))
            row = result.fetchone()
            if row:
                print(f"Verification: column {row[0]} exists with type {row[1]}, nullable {row[2]}")
            else:
                print("Verification failed: column not found")

    except Exception as e:
        print(f"Migration failed: {str(e)}")
        return False

    return True


if __name__ == "__main__":
    print("Starting migration to add advance_amount column...")
    success = run_migration()

    if success:
        print("\nMigration completed successfully!")
    else:
        print("\nMigration failed. Please check the error messages above.")
