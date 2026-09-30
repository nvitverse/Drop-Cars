#!/usr/bin/env python3
"""
Migration script to create sos_alerts table for Customer App SOS emergency tracking.
"""

from sqlalchemy import create_engine, text
from app.database.session import DATABASE_URL


def run_migration():
    try:
        engine = create_engine(DATABASE_URL)

        migration_sql = """
        CREATE TABLE IF NOT EXISTS sos_alerts (
            id SERIAL PRIMARY KEY,
            customer_id VARCHAR NULL,
            order_id VARCHAR NULL,
            emergency_contact VARCHAR NULL,
            latitude VARCHAR NULL,
            longitude VARCHAR NULL,
            tracking_link VARCHAR NULL,
            status VARCHAR NOT NULL DEFAULT 'ACTIVE',
            created_at TIMESTAMP NOT NULL DEFAULT NOW()
        );
        """

        with engine.connect() as connection:
            connection.execute(text(migration_sql))
            connection.commit()

        print("Migration completed successfully!")
        print("sos_alerts table created.")

        with engine.connect() as connection:
            result = connection.execute(text("""
                SELECT table_name
                FROM information_schema.tables
                WHERE table_name = 'sos_alerts';
            """))
            rows = result.fetchall()
            for row in rows:
                print(f"Verification: Table {row[0]} exists.")

    except Exception as e:
        print(f"Migration failed: {str(e)}")
        return False

    return True


if __name__ == "__main__":
    print("Starting migration for sos_alerts table...")
    success = run_migration()
    if success:
        print("\nMigration completed successfully!")
    else:
        print("\nMigration failed. Please check the error messages above.")
