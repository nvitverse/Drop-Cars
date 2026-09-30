#!/usr/bin/env python3
"""
Migration script to add executed_platform to orders.

Tracks which platform/app a booking was actually executed on - auto-stamped
"Drop Cars App" for every order created through this codebase's own flows,
admin-editable afterward for bookings staff logged manually that were
actually fulfilled through a different channel (e.g. an MMT/partner referral).
"""

from sqlalchemy import create_engine, text
from app.database.session import DATABASE_URL


def run_migration():
    try:
        engine = create_engine(DATABASE_URL)

        migration_sql = """
        ALTER TABLE orders
            ADD COLUMN IF NOT EXISTS executed_platform VARCHAR NOT NULL DEFAULT 'Drop Cars App';
        """

        with engine.connect() as connection:
            connection.execute(text(migration_sql))
            connection.commit()

        print("Migration completed successfully!")
        print("executed_platform column added to: orders")

        with engine.connect() as connection:
            result = connection.execute(text("""
                SELECT column_name, data_type, column_default
                FROM information_schema.columns
                WHERE table_name = 'orders' AND column_name = 'executed_platform'
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
    print("Starting migration to add executed_platform column...")
    success = run_migration()

    if success:
        print("\nMigration completed successfully!")
    else:
        print("\nMigration failed. Please check the error messages above.")
