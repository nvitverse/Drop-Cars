#!/usr/bin/env python3
"""
Migration script to add is_urgent to customer_booking_requests, new_orders
and orders. Run this script to apply the database migration for the
website's "Urgent - need taxi immediately" booking flow.
"""

import os
from sqlalchemy import create_engine, text
from app.database.session import DATABASE_URL

TABLES = ["customer_booking_requests", "new_orders", "orders"]


def run_migration():
    """Run the migration to add the is_urgent column to all three tables."""

    database_url = DATABASE_URL

    try:
        engine = create_engine(database_url)

        # Default false so existing rows are treated as normal-track
        # bookings, not urgent.
        migration_sql = "\n".join(
            f"""
            ALTER TABLE {table}
                ADD COLUMN IF NOT EXISTS is_urgent BOOLEAN NOT NULL DEFAULT false;
            CREATE INDEX IF NOT EXISTS idx_{table}_is_urgent ON {table}(is_urgent);
            """
            for table in TABLES
        )
        migration_sql += """
        ALTER TABLE customer_booking_requests
            ADD COLUMN IF NOT EXISTS customer_email VARCHAR;
        ALTER TABLE customer_booking_requests
            ADD COLUMN IF NOT EXISTS cancel_otp VARCHAR;
        ALTER TABLE customer_booking_requests
            ADD COLUMN IF NOT EXISTS cancel_otp_expires_at TIMESTAMPTZ;
        ALTER TABLE customer_booking_requests
            ADD COLUMN IF NOT EXISTS refund_eligible BOOLEAN;
        ALTER TABLE customer_booking_requests
            ADD COLUMN IF NOT EXISTS refund_status VARCHAR;
        ALTER TABLE customer_booking_requests
            ADD COLUMN IF NOT EXISTS refund_requested_at TIMESTAMPTZ;
        ALTER TABLE customer_booking_requests
            ADD COLUMN IF NOT EXISTS refund_processed_at TIMESTAMPTZ;
        ALTER TABLE customer_booking_requests
            ADD COLUMN IF NOT EXISTS refund_amount INTEGER;
        ALTER TABLE customer_booking_requests
            ADD COLUMN IF NOT EXISTS refund_notes VARCHAR;
        ALTER TABLE order_assignments
            ADD COLUMN IF NOT EXISTS start_trip_otp VARCHAR;
        ALTER TABLE order_assignments
            ADD COLUMN IF NOT EXISTS end_trip_otp VARCHAR;
        """

        # Widen the cancelled_by CHECK constraint to allow the new
        # CANCELLED_BY_CUSTOMER value (website-triggered customer cancel).
        migration_sql += """
        DO $$
        BEGIN
            IF EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chk_cancelled_by') THEN
                ALTER TABLE orders DROP CONSTRAINT chk_cancelled_by;
            END IF;
        END $$;

        ALTER TABLE orders ADD CONSTRAINT chk_cancelled_by
            CHECK (cancelled_by IN ('AUTO_CANCELLED', 'CANCELLED_BY_VENDOR', 'CANCELLED_WHILE_DRIVING', 'CANCELLED_BY_CUSTOMER'));
        """

        with engine.connect() as connection:
            connection.execute(text(migration_sql))
            connection.commit()

        print("Migration completed successfully!")
        print(f"is_urgent column added to: {', '.join(TABLES)}")

        # Verify the changes
        with engine.connect() as connection:
            for table in TABLES:
                result = connection.execute(text(f"""
                    SELECT column_name, data_type, is_nullable, column_default
                    FROM information_schema.columns
                    WHERE table_name = '{table}' AND column_name = 'is_urgent'
                """))
                row = result.fetchone()
                if row:
                    print(f"Verification ({table}): column {row[0]} exists with type {row[1]}, default {row[3]}")
                else:
                    print(f"Verification failed for {table}: column not found")

    except Exception as e:
        print(f"Migration failed: {str(e)}")
        return False

    return True


if __name__ == "__main__":
    print("Starting migration to add is_urgent column...")
    success = run_migration()

    if success:
        print("\nMigration completed successfully!")
        print("You can now restart the application to use the Urgent booking flow.")
    else:
        print("\nMigration failed. Please check the error messages above.")
        print("Make sure your database is accessible and you have the necessary permissions.")
