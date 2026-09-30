#!/usr/bin/env python3
"""
Migration script to add cancelled_by column to orders table
Run this script to apply the database migration for order cancellation tracking
"""

import psycopg2
import os
from sqlalchemy import create_engine, text
from app.database.session import DATABASE_URL

def run_migration():
    """Run the migration to add cancelled_by column"""
    
    # Get database URL from environment or use default
    database_url = DATABASE_URL
    
    try:
        # Create engine
        engine = create_engine(database_url)
        
        # Migration SQL
        migration_sql = """
        -- Add the cancelled_by column
        ALTER TABLE orders ADD COLUMN IF NOT EXISTS cancelled_by VARCHAR(50);
        
        -- Add constraint to ensure only valid values (drop first if exists)
        DO $$ 
        BEGIN
            IF EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chk_cancelled_by') THEN
                ALTER TABLE orders DROP CONSTRAINT chk_cancelled_by;
            END IF;
        END $$;
        
        ALTER TABLE orders ADD CONSTRAINT chk_cancelled_by 
        CHECK (cancelled_by IN ('AUTO_CANCELLED', 'CANCELLED_BY_VENDOR'));
        
        -- Update existing cancelled orders to have cancelled_by = 'AUTO_CANCELLED'
        UPDATE orders SET cancelled_by = 'AUTO_CANCELLED' 
        WHERE trip_status = 'CANCELLED' AND cancelled_by IS NULL;
        
        -- Add index for better query performance (if not exists)
        CREATE INDEX IF NOT EXISTS idx_orders_cancelled_by ON orders(cancelled_by);
        """
        
        # Execute migration
        with engine.connect() as connection:
            connection.execute(text(migration_sql))
            connection.commit()
            
        print("✅ Migration completed successfully!")
        print("✅ cancelled_by column added to orders table")
        print("✅ Constraint added for valid values")
        print("✅ Existing cancelled orders updated")
        print("✅ Index created for better performance")
        
        # Verify the changes
        with engine.connect() as connection:
            result = connection.execute(text("""
                SELECT column_name, data_type, is_nullable 
                FROM information_schema.columns 
                WHERE table_name = 'orders' AND column_name = 'cancelled_by'
            """))
            
            row = result.fetchone()
            if row:
                print(f"✅ Verification: Column {row[0]} exists with type {row[1]}")
            else:
                print("❌ Verification failed: Column not found")
                
    except Exception as e:
        print(f"❌ Migration failed: {str(e)}")
        return False
        
    return True

if __name__ == "__main__":
    print("🚀 Starting migration to add cancelled_by column...")
    success = run_migration()
    
    if success:
        print("\n🎉 Migration completed successfully!")
        print("You can now restart your application to use the new cancellation features.")
    else:
        print("\n💥 Migration failed. Please check the error messages above.")
        print("Make sure your database is accessible and you have the necessary permissions.")
