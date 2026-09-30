#!/usr/bin/env python3
"""
Migration script to add order_assignments.assigned_by ('SELF' / 'VENDOR' /
'ADMIN') - lets the UI show "Accepted" (fleet owner accepted it themselves)
vs "Allocated" (a vendor/admin assigned it directly), instead of both
showing the same generic status.
"""

from sqlalchemy import create_engine, text
from app.database.session import DATABASE_URL


def run_migration():
    try:
        engine = create_engine(DATABASE_URL)

        migration_sql = """
        ALTER TABLE order_assignments
            ADD COLUMN IF NOT EXISTS assigned_by VARCHAR NOT NULL DEFAULT 'SELF';
        """

        with engine.connect() as connection:
            connection.execute(text(migration_sql))
            connection.commit()

        print("Migration completed successfully!")
        print("assigned_by column added to: order_assignments")

        with engine.connect() as connection:
            result = connection.execute(text("""
                SELECT column_name, data_type, column_default
                FROM information_schema.columns
                WHERE table_name = 'order_assignments'
                  AND column_name = 'assigned_by'
            """))
            rows = result.fetchall()
            for row in rows:
                print(f"Verification: column {row[0]} exists with type {row[1]}, default {row[2]}")
            if len(rows) != 1:
                print(f"Verification WARNING: expected 1 column, found {len(rows)}")

    except Exception as e:
        print(f"Migration failed: {str(e)}")
        return False

    return True


if __name__ == "__main__":
    print("Starting migration to add order_assignments.assigned_by...")
    success = run_migration()

    if success:
        print("\nMigration completed successfully!")
    else:
        print("\nMigration failed. Please check the error messages above.")
