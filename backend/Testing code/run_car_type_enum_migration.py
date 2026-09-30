#!/usr/bin/env python3
"""
Migration script to update CAR_TYPE_ENUM with new car types
Run this script to add new car type values to the database enum
"""

import os
from sqlalchemy import create_engine, text
from app.database.session import DATABASE_URL

def run_migration():
    """Run the migration to add new car types to CAR_TYPE_ENUM"""
    
    # Get database URL from environment or use default
    database_url = DATABASE_URL
    
    # New car types to add
    new_car_types = [
        'SEDAN_4_PLUS_1',
        'NEW_SEDAN_2022_MODEL',
        'ETIOS_4_PLUS_1',
        'SUV_6_PLUS_1',
        'SUV_7_PLUS_1',
        'INNOVA_6_PLUS_1',
        'INNOVA_7_PLUS_1',
        'INNOVA_CRYSTA_6_PLUS_1',
        'INNOVA_CRYSTA_7_PLUS_1'
    ]
    
    try:
        # Create engine
        engine = create_engine(database_url)
        
        print("🚀 Starting migration to add new car types to CAR_TYPE_ENUM...")
        
        with engine.connect() as connection:
            # Check existing enum values
            result = connection.execute(text("""
                SELECT enumlabel 
                FROM pg_enum 
                WHERE enumtypid = (SELECT oid FROM pg_type WHERE typname = 'CAR_TYPE_ENUM')
                ORDER BY enumsortorder
            """))
            
            existing_values = [row[0] for row in result.fetchall()]
            print(f"📋 Existing enum values: {existing_values}")
            
            # Add new values
            added_count = 0
            skipped_count = 0
            
            for car_type in new_car_types:
                if car_type in existing_values:
                    print(f"⏭️  Skipping {car_type} (already exists)")
                    skipped_count += 1
                else:
                    try:
                        connection.execute(text(f'ALTER TYPE "CAR_TYPE_ENUM" ADD VALUE \'{car_type}\''))
                        connection.commit()
                        print(f"✅ Added {car_type}")
                        added_count += 1
                    except Exception as e:
                        # Check if it's because the value was added in a concurrent transaction
                        if 'already exists' in str(e).lower() or 'duplicate' in str(e).lower():
                            print(f"⏭️  Skipping {car_type} (already exists - possibly added concurrently)")
                            skipped_count += 1
                        else:
                            print(f"❌ Error adding {car_type}: {str(e)}")
                            raise
            
            # Verify the changes
            result = connection.execute(text("""
                SELECT enumlabel 
                FROM pg_enum 
                WHERE enumtypid = (SELECT oid FROM pg_type WHERE typname = 'CAR_TYPE_ENUM')
                ORDER BY enumsortorder
            """))
            
            final_values = [row[0] for row in result.fetchall()]
            print(f"\n📋 Final enum values: {final_values}")
            
        print(f"\n✅ Migration completed!")
        print(f"   - Added: {added_count} new car types")
        print(f"   - Skipped: {skipped_count} (already existed)")
        print(f"   - Total enum values: {len(final_values)}")
        
        return True
                
    except Exception as e:
        print(f"❌ Migration failed: {str(e)}")
        import traceback
        traceback.print_exc()
        return False

if __name__ == "__main__":
    print("=" * 60)
    print("CAR_TYPE_ENUM Migration Script")
    print("=" * 60)
    print()
    print("This script will add the following new car types:")
    print("  - SEDAN_4_PLUS_1")
    print("  - NEW_SEDAN_2022_MODEL")
    print("  - ETIOS_4_PLUS_1")
    print("  - SUV_6_PLUS_1")
    print("  - SUV_7_PLUS_1")
    print("  - INNOVA_6_PLUS_1")
    print("  - INNOVA_7_PLUS_1")
    print("  - INNOVA_CRYSTA_6_PLUS_1")
    print("  - INNOVA_CRYSTA_7_PLUS_1")
    print()
    
    response = input("Do you want to proceed? (yes/no): ")
    if response.lower() not in ['yes', 'y']:
        print("Migration cancelled.")
        exit(0)
    
    print()
    success = run_migration()
    
    if success:
        print("\n🎉 Migration completed successfully!")
        print("You can now restart your application to use the new car types.")
    else:
        print("\n💥 Migration failed. Please check the error messages above.")
        print("Make sure your database is accessible and you have the necessary permissions.")





