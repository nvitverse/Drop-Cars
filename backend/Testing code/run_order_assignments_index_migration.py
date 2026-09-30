#!/usr/bin/env python3
"""
Migration script to add partial unique index ux_order_assignments_active on order_assignments.
Prevents race conditions where two fleet owners or vendors could accept/assign the same order simultaneously.
"""

from sqlalchemy import create_engine, text
from app.database.session import DATABASE_URL


def run_migration():
    try:
        engine = create_engine(DATABASE_URL)

        migration_sql = """
        CREATE UNIQUE INDEX IF NOT EXISTS ux_order_assignments_active 
        ON order_assignments(order_id) 
        WHERE assignment_status != 'CANCELLED';
        """

        with engine.connect() as connection:
            connection.execute(text(migration_sql))
            connection.commit()

        print("Migration completed successfully!")
        print("Partial unique index ux_order_assignments_active created on order_assignments.")

        with engine.connect() as connection:
            result = connection.execute(text("""
                SELECT indexname, indexdef
                FROM pg_indexes
                WHERE tablename = 'order_assignments'
                  AND indexname = 'ux_order_assignments_active';
            """))
            rows = result.fetchall()
            for row in rows:
                print(f"Verification: Index {row[0]} -> {row[1]}")
            if len(rows) != 1:
                print(f"Verification WARNING: expected 1 index, found {len(rows)}")

    except Exception as e:
        print(f"Migration failed: {str(e)}")
        return False

    return True


if __name__ == "__main__":
    print("Starting migration for order_assignments active partial unique index...")
    success = run_migration()
    if success:
        print("\nMigration completed successfully!")
    else:
        print("\nMigration failed. Please check the error messages above.")
