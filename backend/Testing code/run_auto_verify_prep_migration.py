#!/usr/bin/env python3
"""
Migration script to add the "leave space for auto-verify" columns:
- vendor.blocked_reason, vehicle_owner.blocked_reason (manual-block marker,
  distinct from just "never activated")
- vendor_details.aadhar_verification_source
- vehicle_owner_details.aadhar_verification_source
- car_details.rc_verification_source
- car_driver.licence_verification_source

None of these are used by any real auto-verify logic yet (no API key
configured) - see crud/auto_verify.py. All nullable, all no-ops until wired.
"""

from sqlalchemy import create_engine, text
from app.database.session import DATABASE_URL


def run_migration():
    try:
        engine = create_engine(DATABASE_URL)

        migration_sql = """
        ALTER TABLE vendor ADD COLUMN IF NOT EXISTS blocked_reason VARCHAR;
        ALTER TABLE vehicle_owner ADD COLUMN IF NOT EXISTS blocked_reason VARCHAR;
        ALTER TABLE vendor_details ADD COLUMN IF NOT EXISTS aadhar_verification_source VARCHAR;
        ALTER TABLE vehicle_owner_details ADD COLUMN IF NOT EXISTS aadhar_verification_source VARCHAR;
        ALTER TABLE car_details ADD COLUMN IF NOT EXISTS rc_verification_source VARCHAR;
        ALTER TABLE car_driver ADD COLUMN IF NOT EXISTS licence_verification_source VARCHAR;
        """

        with engine.connect() as connection:
            connection.execute(text(migration_sql))
            connection.commit()

        print("Migration completed successfully!")

        with engine.connect() as connection:
            result = connection.execute(text("""
                SELECT table_name, column_name
                FROM information_schema.columns
                WHERE (table_name = 'vendor' AND column_name = 'blocked_reason')
                   OR (table_name = 'vehicle_owner' AND column_name = 'blocked_reason')
                   OR (table_name = 'vendor_details' AND column_name = 'aadhar_verification_source')
                   OR (table_name = 'vehicle_owner_details' AND column_name = 'aadhar_verification_source')
                   OR (table_name = 'car_details' AND column_name = 'rc_verification_source')
                   OR (table_name = 'car_driver' AND column_name = 'licence_verification_source')
            """))
            for row in result.fetchall():
                print(f"Verification: {row[0]}.{row[1]} exists")

    except Exception as e:
        print(f"Migration failed: {str(e)}")
        return False

    return True


if __name__ == "__main__":
    print("Starting auto-verify-prep migration...")
    success = run_migration()

    if success:
        print("\nMigration completed successfully!")
    else:
        print("\nMigration failed. Please check the error messages above.")
