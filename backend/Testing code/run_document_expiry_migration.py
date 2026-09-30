#!/usr/bin/env python3
"""
Migration script to add document expiry-date columns:
- car_details.rc_expiry_date, car_details.insurance_expiry_date
- car_driver.licence_expiry_date

Powers the daily document-expiry reminder sweep (crud/document_expiry.py).
All nullable - existing rows simply have no date until an owner enters one.
"""

from sqlalchemy import create_engine, text
from app.database.session import DATABASE_URL


def run_migration():
    try:
        engine = create_engine(DATABASE_URL)

        migration_sql = """
        ALTER TABLE car_details
            ADD COLUMN IF NOT EXISTS rc_expiry_date DATE,
            ADD COLUMN IF NOT EXISTS insurance_expiry_date DATE;
        ALTER TABLE car_driver
            ADD COLUMN IF NOT EXISTS licence_expiry_date DATE;
        """

        with engine.connect() as connection:
            connection.execute(text(migration_sql))
            connection.commit()

        print("Migration completed successfully!")
        print("rc_expiry_date, insurance_expiry_date added to: car_details")
        print("licence_expiry_date added to: car_driver")

        with engine.connect() as connection:
            result = connection.execute(text("""
                SELECT table_name, column_name, data_type
                FROM information_schema.columns
                WHERE (table_name = 'car_details' AND column_name IN ('rc_expiry_date', 'insurance_expiry_date'))
                   OR (table_name = 'car_driver' AND column_name = 'licence_expiry_date')
            """))
            for row in result.fetchall():
                print(f"Verification: {row[0]}.{row[1]} exists with type {row[2]}")

    except Exception as e:
        print(f"Migration failed: {str(e)}")
        return False

    return True


if __name__ == "__main__":
    print("Starting migration to add document expiry-date columns...")
    success = run_migration()

    if success:
        print("\nMigration completed successfully!")
    else:
        print("\nMigration failed. Please check the error messages above.")
