# Admin Profit Tracking System

## Overview
This system automatically deducts admin profit from vendors when a trip is completed and credits it to the admin wallet with proper ledger entries.

## How It Works

### Flow Diagram
```
Trip End
  ↓
1. Debit vendor_profit + admin_profit from vehicle owner
  ↓
2. Credit vendor_profit to vendor wallet
  ↓
3. Debit admin_profit from vendor wallet
  ↓
4. Credit admin_profit to admin wallet
  ↓
All transactions recorded in respective ledgers
```

## Changes Made

### 1. Models
- **`app/models/admin.py`**: Added `balance` field to track admin's total balance
- **`app/models/admin_wallet_ledger.py`**: New model to track admin wallet transactions

### 2. CRUD Operations
- **`app/crud/admin_wallet.py`**: 
  - `get_admin_balance()`: Get admin's current balance
  - `set_admin_balance()`: Update admin's balance
  - `credit_admin_wallet()`: Credit amount to admin wallet with ledger entry
  - `debit_admin_wallet()`: Debit amount from admin wallet with ledger entry
  - `append_admin_ledger_entry()`: Create ledger entry

- **`app/crud/vendor_wallet.py`**: Updated `credit_vendor_wallet()` function
  - Added `deduct_admin_profit` parameter
  - Added `admin_profit` parameter  
  - Added `admin_id` parameter
  - When enabled, credits vendor, debits admin_profit from vendor, and credits admin

- **`app/crud/end_records.py`**: Updated `update_end_trip_record()` function
  - Calls `credit_vendor_wallet()` with admin profit deduction parameters
  - Gets admin_id from first admin in database
  - Passes admin_profit from order

### 3. Database Migration
- **`migration_add_admin_profit_tracking.sql`**: SQL migration file to:
  - Add `balance` column to `admin` table
  - Create `admin_wallet_ledger` table
  - Create `admin_wallet_entry_type_enum` type
  - Create indexes for performance

## Transaction Flow

### When a Trip Ends:

1. **Vehicle Owner Debit** (from existing code):
   ```python
   debit_wallet(
       vehicle_owner_id=vehicle_owner_id,
       amount=vendor_profit + admin_profit,  # Full amount
       notes="Trip completion"
   )
   ```

2. **Vendor Credit** (new logic):
   ```python
   credit_vendor_wallet(
       vendor_id=vendor_id,
       amount=vendor_profit,
       deduct_admin_profit=True,
       admin_profit=admin_profit,
       admin_id=admin_id
   )
   ```
   
   This creates two vendor ledger entries:
   - CREDIT: vendor_profit amount
   - DEBIT: admin_profit amount (from vendor to admin)

3. **Admin Credit** (automatic):
   ```python
   credit_admin_wallet(
       admin_id=admin_id,
       amount=admin_profit,
       notes="Admin profit from order X"
   )
   ```

## Ledger Entries Created

### Vendor Wallet Ledger:
```sql
-- Entry 1: Credit vendor profit
entry_type: CREDIT
amount: vendor_profit
balance_before: X
balance_after: X + vendor_profit
notes: "Trip 123 vendor profit"

-- Entry 2: Debit admin profit
entry_type: DEBIT  
amount: admin_profit
balance_before: X + vendor_profit
balance_after: X + vendor_profit - admin_profit
notes: "Admin profit deduction for order 123"
```

### Admin Wallet Ledger:
```sql
-- Entry 1: Credit admin profit
entry_type: CREDIT
amount: admin_profit
balance_before: Y
balance_after: Y + admin_profit
notes: "Admin profit from order 123"
```

## API Support

This works for all order types:
- ✅ **One Way**: Normal trip completion
- ✅ **Round Trip**: Return journey completion  
- ✅ **Multi City**: Multiple city trip completion
- ✅ **Hourly Rental**: Time-based rental completion

All order types calculate `admin_profit` in the `update_end_trip_record()` function and process it the same way.

## Running the Migration

### Option 1: Using Python
```bash
python run_address_migration.py
```

### Option 2: Direct SQL
```bash
psql -d your_database -f migration_add_admin_profit_tracking.sql
```

## Testing

### Example: Complete a Trip
```bash
POST /api/order-assignments/driver/end-trip/123
{
  "end_km": 500,
  "close_speedometer_img": <file>
}
```

### Check Vendor Ledger
```sql
SELECT * FROM vendor_wallet_ledger 
WHERE order_id = 123 
ORDER BY created_at;
```

### Check Admin Ledger
```sql
SELECT * FROM admin_wallet_ledger 
WHERE order_id = 123 
ORDER BY created_at;
```

### Check Admin Balance
```sql
SELECT balance FROM admin WHERE id = 'admin-uuid';
```

## Important Notes

1. **Admin Profit Calculation**: 
   - Calculated in `end_records.py` based on order type
   - Stored in `orders.admin_profit` column
   - Used when crediting vendor wallet

2. **Admin Selection**:
   - Currently uses first admin in database
   - Can be extended to support organization-based admin selection

3. **Rollback Behavior**:
   - If admin credit fails, vendor debit is also rolled back
   - Transaction safety maintained through database transactions

4. **Edge Cases**:
   - If `admin_profit` is 0 or None, no admin deduction occurs
   - If no admin exists, admin_profit is not credited (but vendor still gets his profit)

## Future Enhancements

1. Support multiple admins per organization
2. Admin profit percentage configuration per organization
3. Admin profit withdrawal system
4. Admin dashboard for profit tracking
5. Admin profit reports and analytics

