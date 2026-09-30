#!/usr/bin/env python3
"""
Migration script to add the Owner/Staff permissions column:
- admin.permissions (JSON array, default []) - section keys a Staff admin
  can access ("bookings", "customers", "fleet", "finance"). Ignored for
  role="Owner" (always full access). "settings" is never a valid value -
  only an Owner ever reaches Settings/staff-management.

Existing admin rows keep whatever `role` they already have (the one
production admin is already 'Owner') and get an empty permissions array,
which is harmless since it's only read for role='Staff' rows.
"""

from sqlalchemy import create_engine, text
from app.database.session import DATABASE_URL


def run_migration():
    try:
        engine = create_engine(DATABASE_URL)

        migration_sql = """
        ALTER TABLE admin ADD COLUMN IF NOT EXISTS permissions JSON NOT NULL DEFAULT '[]';
        """

        with engine.connect() as connection:
            connection.execute(text(migration_sql))
            connection.commit()

        print("Migration completed successfully!")
        print("permissions column added to: admin")

        with engine.connect() as connection:
            result = connection.execute(text("""
                SELECT column_name, data_type, column_default
                FROM information_schema.columns
                WHERE table_name = 'admin' AND column_name = 'permissions'
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
    print("Starting migration to add admin.permissions column...")
    success = run_migration()

    if success:
        print("\nMigration completed successfully!")
    else:
        print("\nMigration failed. Please check the error messages above.")
