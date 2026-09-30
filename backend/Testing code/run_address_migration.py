"""
Migration script to update address fields and remove organization_id
Run this script to apply the database schema changes

Usage:
    python run_address_migration.py
"""
import os
import sys
from pathlib import Path

# Add the app directory to the path
app_dir = Path(__file__).parent / "app"
sys.path.insert(0, str(app_dir.parent))

from sqlalchemy import create_engine, text
from app.database.session import SQLALCHEMY_DATABASE_URL

def run_migration():
    """Run the migration SQL commands"""
    print("Starting migration...")
    print("=" * 50)
    
    # Read the migration SQL file
    migration_file = Path(__file__).parent / "migration_update_address_fields.sql"
    
    if not migration_file.exists():
        print(f"Error: Migration file not found at {migration_file}")
        return False
    
    with open(migration_file, 'r', encoding='utf-8') as f:
        migration_sql = f.read()
    
    # Create database connection
    print(f"Connecting to database...")
    engine = create_engine(SQLALCHEMY_DATABASE_URL)
    
    try:
        with engine.connect() as connection:
            # Split SQL by semicolons and execute each command
            commands = [cmd.strip() for cmd in migration_sql.split(';') if cmd.strip() and not cmd.strip().startswith('--')]
            
            for i, command in enumerate(commands, 1):
                if command:
                    print(f"\nExecuting command {i}...")
                    print(f"SQL: {command[:100]}...")
                    try:
                        connection.execute(text(command))
                        connection.commit()
                        print(f"✓ Command {i} executed successfully")
                    except Exception as e:
                        print(f"✗ Error executing command {i}: {str(e)}")
                        print(f"  SQL: {command}")
                        print("\nMigration partially completed. Please check the database state.")
                        return False
            
            print("\n" + "=" * 50)
            print("✓ Migration completed successfully!")
            print("=" * 50)
            return True
            
    except Exception as e:
        print(f"\n✗ Migration failed with error: {str(e)}")
        return False
    finally:
        engine.dispose()

if __name__ == "__main__":
    print("\n" + "=" * 50)
    print("Address Fields Migration Script")
    print("=" * 50)
    print("\nThis will:")
    print("  1. Remove organization_id from vendor, vehicle_owner, and car_driver tables")
    print("  2. Rename 'adress' to 'address' in vendor_details and car_driver tables")
    print("  3. Add 'city' and 'pincode' columns to vendor_details, vehicle_owner_details, and car_driver")
    print("  4. Add 'year_of_the_car' column to car_details table")
    print("  5. Set default values for existing records")
    print("\n⚠️  IMPORTANT: Make sure you have a database backup before proceeding!")
    print("=" * 50)
    
    response = input("\nDo you want to proceed? (yes/no): ")
    
    if response.lower() in ['yes', 'y']:
        success = run_migration()
        if success:
            print("\n✓ Migration script completed successfully!")
            print("  You can now start the application.")
        else:
            print("\n✗ Migration script failed. Please check the errors above.")
            sys.exit(1)
    else:
        print("\nMigration cancelled by user.")
        sys.exit(0)

