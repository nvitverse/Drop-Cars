#!/usr/bin/env python3
"""
Quick fix script to add new car types to CAR_TYPE_ENUM
Run this script to immediately fix the enum issue
"""

import sys
import os

# Add the current directory to the path so we can import app modules
current_dir = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, current_dir)

from sqlalchemy import create_engine, text
from app.database.session import DATABASE_URL

def fix_enum():
    """Add new car types to CAR_TYPE_ENUM"""
    
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
        engine = create_engine(DATABASE_URL)
        
        print("🔧 Adding new car types to CAR_TYPE_ENUM...")
        print()
        
        with engine.connect() as connection:
            for car_type in new_car_types:
                try:
                    connection.execute(text(f'ALTER TYPE "CAR_TYPE_ENUM" ADD VALUE \'{car_type}\''))
                    connection.commit()
                    print(f"✅ Added: {car_type}")
                except Exception as e:
                    error_msg = str(e)
                    if 'already exists' in error_msg.lower() or 'duplicate' in error_msg.lower():
                        print(f"⏭️  Skipped: {car_type} (already exists)")
                    else:
                        print(f"❌ Error adding {car_type}: {error_msg}")
            
            # Verify
            result = connection.execute(text("""
                SELECT enumlabel 
                FROM pg_enum 
                WHERE enumtypid = (SELECT oid FROM pg_type WHERE typname = 'CAR_TYPE_ENUM')
                ORDER BY enumsortorder
            """))
            
            all_values = [row[0] for row in result.fetchall()]
            print()
            print(f"✅ Migration complete! Total enum values: {len(all_values)}")
            print(f"📋 All car types: {', '.join(all_values)}")
            
        return True
        
    except Exception as e:
        print(f"❌ Error: {str(e)}")
        import traceback
        traceback.print_exc()
        return False

if __name__ == "__main__":
    print("=" * 60)
    print("CAR_TYPE_ENUM Quick Fix")
    print("=" * 60)
    print()
    
    success = fix_enum()
    
    if success:
        print()
        print("🎉 Done! You can now create orders with the new car types.")
        print("   Restart your application if it's running.")
    else:
        print()
        print("💥 Fix failed. Please check the error messages above.")

