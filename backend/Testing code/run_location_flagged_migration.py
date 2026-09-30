#!/usr/bin/env python3
"""
Migration script to add is_location_flagged and location_flag_reason to order_assignments table for GPS-spoof fraud detection.
"""

from sqlalchemy import create_engine, text
from app.database.session import DATABASE_URL


def run_migration():
    try:
        engine = create_engine(DATABASE_URL)

        migration_sql = """
        ALTER TABLE order_assignments
            ADD COLUMN IF NOT EXISTS is_location_flagged BOOLEAN NOT NULL DEFAULT FALSE,
            ADD COLUMN IF NOT EXISTS location_flag_reason VARCHAR NULL;
        """

        with engine.connect() as connection:
            connection.execute(text(migration_sql))
            connection.commit()

        print("Migration completed successfully!")
        print("is_location_flagged and location_flag_reason columns added to order_assignments.")

        with engine.connect() as connection:
            result = connection.execute(text("""
                SELECT column_name, data_type, column_default
                FROM information_schema.columns
                WHERE table_name = 'order_assignments'
                  AND column_name IN ('is_location_flagged', 'location_flag_reason')
            """))
            rows = result.fetchall()
            for row in rows:
                print(f"Verification: column {row[0]} exists with type {row[1]}")

    except Exception as e:
        print(f"Migration failed: {str(e)}")
        return False

    return True


if __name__ == "__main__":
    print("Starting migration for GPS-spoof location flags on order_assignments...")
    success = run_migration()
    if success:
        print("\nMigration completed successfully!")
    else:
        print("\nMigration failed. Please check the error messages above.")
