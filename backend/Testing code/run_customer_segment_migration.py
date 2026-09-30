#!/usr/bin/env python3
"""
Migration script to add customer segmentation:
- customer_details.segment (enum INDIVIDUAL/B2B/CORPORATE, default INDIVIDUAL)
- customer_details.company_name, customer_details.gst_number (nullable,
  only meaningful for B2B/CORPORATE)

No self-serve B2B signup flow exists - an admin manually tags a customer's
segment via the new PATCH /admin/customers/{id}/segment endpoint.
"""

from sqlalchemy import create_engine, text
from app.database.session import DATABASE_URL


def run_migration():
    try:
        engine = create_engine(DATABASE_URL)

        migration_sql = """
        DO $$ BEGIN
            CREATE TYPE customer_segment_enum AS ENUM ('INDIVIDUAL', 'B2B', 'CORPORATE');
        EXCEPTION
            WHEN duplicate_object THEN null;
        END $$;

        ALTER TABLE customer_details
            ADD COLUMN IF NOT EXISTS segment customer_segment_enum NOT NULL DEFAULT 'INDIVIDUAL',
            ADD COLUMN IF NOT EXISTS company_name VARCHAR,
            ADD COLUMN IF NOT EXISTS gst_number VARCHAR;
        """

        with engine.connect() as connection:
            connection.execute(text(migration_sql))
            connection.commit()

        print("Migration completed successfully!")

        with engine.connect() as connection:
            result = connection.execute(text("""
                SELECT column_name, data_type, column_default
                FROM information_schema.columns
                WHERE table_name = 'customer_details' AND column_name IN ('segment', 'company_name', 'gst_number')
            """))
            for row in result.fetchall():
                print(f"Verification: customer_details.{row[0]} exists with type {row[1]}, default {row[2]}")

    except Exception as e:
        print(f"Migration failed: {str(e)}")
        return False

    return True


if __name__ == "__main__":
    print("Starting migration to add customer segmentation columns...")
    success = run_migration()

    if success:
        print("\nMigration completed successfully!")
    else:
        print("\nMigration failed. Please check the error messages above.")
