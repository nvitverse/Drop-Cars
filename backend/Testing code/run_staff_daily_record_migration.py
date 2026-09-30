#!/usr/bin/env python3
"""
Migration script to create the staff_daily_records table - one end-of-day
note per staff member per calendar day, the "Records Submit" half of the
Staff dashboard (Today's Target / Achievements / Records Submit).
"""

from sqlalchemy import create_engine, text
from app.database.session import DATABASE_URL


def run_migration():
    try:
        engine = create_engine(DATABASE_URL)

        migration_sql = """
        CREATE TABLE IF NOT EXISTS staff_daily_records (
            id UUID PRIMARY KEY,
            admin_id UUID NOT NULL,
            admin_username VARCHAR NOT NULL,
            record_date DATE NOT NULL,
            note VARCHAR NOT NULL,
            created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
            updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
            CONSTRAINT uq_staff_daily_record_admin_date UNIQUE (admin_id, record_date)
        );
        CREATE INDEX IF NOT EXISTS ix_staff_daily_records_admin_id ON staff_daily_records (admin_id);
        CREATE INDEX IF NOT EXISTS ix_staff_daily_records_record_date ON staff_daily_records (record_date DESC);
        """

        with engine.connect() as connection:
            connection.execute(text(migration_sql))
            connection.commit()

        print("Migration completed successfully!")

        with engine.connect() as connection:
            result = connection.execute(text("""
                SELECT table_name FROM information_schema.tables
                WHERE table_name = 'staff_daily_records'
            """))
            for row in result.fetchall():
                print(f"Verification: table {row[0]} exists")

    except Exception as e:
        print(f"Migration failed: {str(e)}")
        return False

    return True


if __name__ == "__main__":
    print("Starting staff_daily_records migration...")
    success = run_migration()

    if success:
        print("\nMigration completed successfully!")
    else:
        print("\nMigration failed. Please check the error messages above.")
