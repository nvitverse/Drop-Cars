#!/usr/bin/env python3
"""
Migration script to add requires_manual_confirm to customer_booking_requests.

Soft leads (website enquiries) must never auto-post to the driver
marketplace on the normal review timer - only an explicit confirm should.
"""

from sqlalchemy import create_engine, text
from app.database.session import DATABASE_URL


def run_migration():
    try:
        engine = create_engine(DATABASE_URL)

        migration_sql = """
        ALTER TABLE customer_booking_requests
            ADD COLUMN IF NOT EXISTS requires_manual_confirm BOOLEAN NOT NULL DEFAULT false;
        """

        with engine.connect() as connection:
            connection.execute(text(migration_sql))
            connection.commit()

        print("Migration completed successfully!")
        print("requires_manual_confirm column added to: customer_booking_requests")

        with engine.connect() as connection:
            result = connection.execute(text("""
                SELECT column_name, data_type, column_default
                FROM information_schema.columns
                WHERE table_name = 'customer_booking_requests' AND column_name = 'requires_manual_confirm'
            """))
            row = result.fetchone()
            if row:
                print(f"Verification: column {row[0]} exists with type {row[1]}, default {row[2]}")
            else:
                print("Verification failed: column not found")

    except Exception as e:
        print(f"Migration failed: {str(e)}")
        return False

    return True


if __name__ == "__main__":
    print("Starting migration to add requires_manual_confirm column...")
    success = run_migration()

    if success:
        print("\nMigration completed successfully!")
    else:
        print("\nMigration failed. Please check the error messages above.")
