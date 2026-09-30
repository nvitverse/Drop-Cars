# Database Migration Guide

## Overview
This migration updates the database schema to:
1. Remove `organization_id` columns from vendor, vehicle_owner, and car_driver tables
2. Split address fields into: `address`, `city`, and `pincode` 
3. Rename `adress` to `address` (fixing typo)
4. Add `year_of_the_car` field to car_details table

## Changes Made

### Models Updated
- **vendor_details**: Removed `organization_id`, renamed `adress` → `address`, added `city` and `pincode`
- **vehicle_owner**: Removed `organization_id`
- **vehicle_owner_details**: Removed `organization_id`, added `city` and `pincode`
- **car_driver**: Removed `organization_id`, renamed `adress` → `address`, added `city` and `pincode`
- **car_details**: Removed `organization_id`, added `year_of_the_car`

### Schemas Updated
- Updated all signup forms to accept `address`, `city`, and `pincode` separately
- Updated output schemas to return the new address fields
- Added `year_of_the_car` to car details

### Routes Updated
- **Vendor Signup**: Now accepts `address`, `city`, `pincode`
- **Vehicle Owner Signup**: Now accepts `address`, `city`, `pincode`
- **Car Details Signup**: Now accepts `year_of_the_car`
- Removed organization-based filtering from routes

## Running the Migration

### Option 1: Using the Python Script (Recommended)
```bash
python run_address_migration.py
```

The script will:
- Ask for confirmation before proceeding
- Show progress for each SQL command
- Handle errors gracefully
- Make a backup first (recommended)

### Option 2: Manual SQL Execution
```bash
psql -d your_database_name -f migration_update_address_fields.sql
```

Or using Python:
```python
from app.database.session import engine
from sqlalchemy import text

with engine.connect() as conn:
    with open('migration_update_address_fields.sql', 'r') as f:
        sql = f.read()
        conn.execute(text(sql))
        conn.commit()
```

## Important Notes

### Before Migration
1. **Backup your database** - Always make a backup before running migrations
   ```bash
   pg_dump your_database > backup_before_migration.sql
   ```

2. Update existing data (optional):
   - The migration sets default values (`''` for address fields, `'Unknown'` for city, `'000000'` for pincode)
   - You may want to update existing records with actual values before making fields NOT NULL

### After Migration
1. **Verify the changes**:
   ```sql
   -- Check if organization_id columns are removed
   SELECT column_name FROM information_schema.columns 
   WHERE table_name = 'vendor_details' AND column_name = 'organization_id';
   -- Should return no rows

   -- Check if new columns exist
   SELECT column_name FROM information_schema.columns 
   WHERE table_name = 'vendor_details' AND column_name IN ('city', 'pincode');
   -- Should return 2 rows
   ```

2. **Update existing data** (if needed):
   ```sql
   -- Example: Update records with real values
   UPDATE vendor_details 
   SET city = 'Mumbai', pincode = '400001' 
   WHERE city = 'Unknown';
   ```

3. **Make fields NOT NULL** (optional, after updating data):
   ```sql
   ALTER TABLE vendor_details ALTER COLUMN city SET NOT NULL;
   ALTER TABLE vendor_details ALTER COLUMN pincode SET NOT NULL;
   ```

## Rollback Instructions

If you need to rollback the migration:

```sql
-- Re-add organization_id columns
ALTER TABLE vehicle_owner ADD COLUMN organization_id VARCHAR;
ALTER TABLE vehicle_owner_details ADD COLUMN organization_id VARCHAR;
ALTER TABLE vendor_details ADD COLUMN organization_id VARCHAR;
ALTER TABLE car_driver ADD COLUMN organization_id VARCHAR;
ALTER TABLE car_details ADD COLUMN organization_id VARCHAR;

-- Revert address field name
ALTER TABLE vendor_details RENAME COLUMN address TO adress;
ALTER TABLE car_driver RENAME COLUMN address TO adress;

-- Remove new fields (if not NULL)
ALTER TABLE vendor_details DROP COLUMN IF EXISTS city;
ALTER TABLE vendor_details DROP COLUMN IF EXISTS pincode;
ALTER TABLE vehicle_owner_details DROP COLUMN IF EXISTS city;
ALTER TABLE vehicle_owner_details DROP COLUMN IF EXISTS pincode;
ALTER TABLE car_driver DROP COLUMN IF EXISTS city;
ALTER TABLE car_driver DROP COLUMN IF EXISTS pincode;
ALTER TABLE car_details DROP COLUMN IF EXISTS year_of_the_car;
```

## Testing

After migration, test the following:

1. **Vendor Signup**:
   ```bash
   curl -X POST "http://localhost:8000/api/vendor/signup" \
     -F "full_name=Test Vendor" \
     -F "primary_number=9876543210" \
     -F "password=test123" \
     -F "address=123 Main St" \
     -F "city=Mumbai" \
     -F "pincode=400001" \
     -F "aadhar_number=123456789012" \
     -F "gpay_number=9876543210" \
     -F "aadhar_image=@test_image.jpg"
   ```

2. **Vehicle Owner Signup**:
   ```bash
   curl -X POST "http://localhost:8000/api/vehicleowner/signup" \
     -F "full_name=Test Owner" \
     -F "primary_number=9876543211" \
     -F "password=test123" \
     -F "address=456 Park Ave" \
     -F "city=Delhi" \
     -F "pincode=110001" \
     -F "aadhar_number=987654321098" \
     -F "aadhar_front_img=@test_image.jpg"
   ```

3. **Car Details Signup**:
   ```bash
   curl -X POST "http://localhost:8000/api/cardetails/signup" \
     -H "Authorization: Bearer YOUR_TOKEN" \
     -F "car_name=Toyota Camry" \
     -F "car_type=SEDAN" \
     -F "car_number=MH-12-AB-1234" \
     -F "year_of_the_car=2020" \
     -F "rc_front_img=@rc_front.jpg" \
     -F "rc_back_img=@rc_back.jpg" \
     -F "insurance_img=@insurance.jpg" \
     -F "fc_img=@fc.jpg" \
     -F "car_img=@car.jpg"
   ```

## Support
If you encounter any issues during migration, please check:
1. Database connection credentials
2. User permissions (need ALTER TABLE privileges)
3. Existing data that might conflict with NOT NULL constraints
4. Log files for detailed error messages

