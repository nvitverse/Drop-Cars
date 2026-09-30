#!/usr/bin/env python3
"""
Migration script for the two new tables/columns from the "remaining
subscription-perk backlog" batch:

1. order_assignments.revised_offer_price / rebid_status - Fleet Owner
   Re-Bid feature (POST /order-assignments/{id}/re-bid).
2. profile_edit_reviews - new table backing the Admin App's Profile-Edit
   Review Queue (ProfileEditReview model).

NOTE: DATABASE_URL from app.database.session / the bare .env is the known
local/throwaway dev DB, not production - see feedback_migration_db_mismatch.
Run this with DB_HOST/DB_PASSWORD overridden to the real Cloud SQL values,
same as every other production migration in this folder.
"""

from sqlalchemy import create_engine, text
from app.database.session import DATABASE_URL


def run_migration():
    try:
        engine = create_engine(DATABASE_URL)

        migration_sql = """
        ALTER TABLE order_assignments
            ADD COLUMN IF NOT EXISTS revised_offer_price INTEGER,
            ADD COLUMN IF NOT EXISTS rebid_status VARCHAR;

        CREATE TABLE IF NOT EXISTS profile_edit_reviews (
            id SERIAL PRIMARY KEY,
            user_id VARCHAR NOT NULL,
            user_type VARCHAR NOT NULL,
            user_name VARCHAR,
            user_phone VARCHAR,
            field_name VARCHAR NOT NULL,
            old_value VARCHAR,
            proposed_value VARCHAR NOT NULL,
            proof_document_url VARCHAR,
            status VARCHAR NOT NULL DEFAULT 'PENDING',
            admin_notes VARCHAR,
            processed_by VARCHAR,
            processed_at TIMESTAMPTZ,
            created_at TIMESTAMPTZ NOT NULL DEFAULT now()
        );
        CREATE INDEX IF NOT EXISTS ix_profile_edit_reviews_user_id ON profile_edit_reviews (user_id);
        CREATE INDEX IF NOT EXISTS ix_profile_edit_reviews_status ON profile_edit_reviews (status);
        """

        with engine.connect() as connection:
            connection.execute(text(migration_sql))
            connection.commit()

        print("Migration completed successfully!")
        print("Added: order_assignments.revised_offer_price, order_assignments.rebid_status")
        print("Created: profile_edit_reviews table")

        with engine.connect() as connection:
            result = connection.execute(text("""
                SELECT column_name FROM information_schema.columns
                WHERE table_name = 'order_assignments' AND column_name IN ('revised_offer_price', 'rebid_status')
            """))
            found = {row[0] for row in result.fetchall()}
            for col in ("revised_offer_price", "rebid_status"):
                print(f"Verification: order_assignments.{col} {'exists' if col in found else 'MISSING'}")

            result = connection.execute(text("""
                SELECT to_regclass('public.profile_edit_reviews') IS NOT NULL AS exists
            """))
            table_exists = result.fetchone()[0]
            print(f"Verification: profile_edit_reviews table {'exists' if table_exists else 'MISSING'}")

    except Exception as e:
        print(f"Migration failed: {str(e)}")
        return False

    return True


if __name__ == "__main__":
    print("Starting migration for Fleet Owner Re-Bid + Profile-Edit Review Queue...")
    success = run_migration()

    if success:
        print("\nMigration completed successfully!")
    else:
        print("\nMigration failed. Please check the error messages above.")
