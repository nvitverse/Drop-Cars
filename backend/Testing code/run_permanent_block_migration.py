#!/usr/bin/env python3
"""
Migration script to add permanent-block columns (fraud/confirmed-bad-actor,
distinct from the everyday Active/Inactive toggle):
- vendor.permanently_blocked, vendor.permanently_blocked_reason
- vehicle_owner.permanently_blocked, vehicle_owner.permanently_blocked_reason
- car_driver.permanently_blocked, car_driver.permanently_blocked_reason
"""

from sqlalchemy import create_engine, text
from app.database.session import DATABASE_URL


def run_migration():
    try:
        engine = create_engine(DATABASE_URL)

        migration_sql = """
        ALTER TABLE vendor
            ADD COLUMN IF NOT EXISTS permanently_blocked BOOLEAN NOT NULL DEFAULT false,
            ADD COLUMN IF NOT EXISTS permanently_blocked_reason VARCHAR;
        ALTER TABLE vehicle_owner
            ADD COLUMN IF NOT EXISTS permanently_blocked BOOLEAN NOT NULL DEFAULT false,
            ADD COLUMN IF NOT EXISTS permanently_blocked_reason VARCHAR;
        ALTER TABLE car_driver
            ADD COLUMN IF NOT EXISTS permanently_blocked BOOLEAN NOT NULL DEFAULT false,
            ADD COLUMN IF NOT EXISTS permanently_blocked_reason VARCHAR;
        """

        with engine.connect() as connection:
            connection.execute(text(migration_sql))
            connection.commit()

        print("Migration completed successfully!")

        with engine.connect() as connection:
            result = connection.execute(text("""
                SELECT table_name, column_name
                FROM information_schema.columns
                WHERE column_name IN ('permanently_blocked', 'permanently_blocked_reason')
                  AND table_name IN ('vendor', 'vehicle_owner', 'car_driver')
                ORDER BY table_name, column_name
            """))
            for row in result.fetchall():
                print(f"Verification: {row[0]}.{row[1]} exists")

    except Exception as e:
        print(f"Migration failed: {str(e)}")
        return False

    return True


if __name__ == "__main__":
    print("Starting permanent-block migration...")
    success = run_migration()

    if success:
        print("\nMigration completed successfully!")
    else:
        print("\nMigration failed. Please check the error messages above.")
