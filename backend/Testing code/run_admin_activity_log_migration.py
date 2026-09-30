#!/usr/bin/env python3
"""
Migration script to create the admin_activity_log table - an audit trail
of sensitive admin actions (permanent block/unblock, account status
changes, wallet adjustments, staff management) so an Owner can see which
staff member did what action.
"""

from sqlalchemy import create_engine, text
from app.database.session import DATABASE_URL


def run_migration():
    try:
        engine = create_engine(DATABASE_URL)

        migration_sql = """
        CREATE TABLE IF NOT EXISTS admin_activity_log (
            id UUID PRIMARY KEY,
            admin_id UUID,
            admin_username VARCHAR NOT NULL,
            admin_role VARCHAR,
            action VARCHAR NOT NULL,
            target_type VARCHAR,
            target_id VARCHAR,
            target_name VARCHAR,
            details JSON,
            created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
        );
        CREATE INDEX IF NOT EXISTS ix_admin_activity_log_created_at ON admin_activity_log (created_at DESC);
        CREATE INDEX IF NOT EXISTS ix_admin_activity_log_admin_id ON admin_activity_log (admin_id);
        """

        with engine.connect() as connection:
            connection.execute(text(migration_sql))
            connection.commit()

        print("Migration completed successfully!")

        with engine.connect() as connection:
            result = connection.execute(text("""
                SELECT table_name FROM information_schema.tables
                WHERE table_name = 'admin_activity_log'
            """))
            for row in result.fetchall():
                print(f"Verification: table {row[0]} exists")

    except Exception as e:
        print(f"Migration failed: {str(e)}")
        return False

    return True


if __name__ == "__main__":
    print("Starting admin_activity_log migration...")
    success = run_migration()

    if success:
        print("\nMigration completed successfully!")
    else:
        print("\nMigration failed. Please check the error messages above.")
