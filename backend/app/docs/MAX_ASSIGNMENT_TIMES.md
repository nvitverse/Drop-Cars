# Maximum Assignment Times Feature

## Overview
This feature allows you to specify the maximum time to assign orders directly in the request payload when creating new orders. Instead of using a hardcoded 15-minute timeout, you can now set custom timeout values for each order based on your business requirements.

## Trip Types Supported
- **Oneway**: Point-to-point trips
- **Round Trip**: Return trips to the same location
- **Multy City**: Multi-city trips with multiple stops
- **Hourly Rental**: Time-based rental services

## How It Works

### 1. Payload-Based Configuration
When creating a new order, you can specify the `max_time_to_assign_order` field in the request payload:
- **Default**: 15 minutes (if not specified)
- **Custom**: Any number of minutes you specify
- **Flexible**: Different timeout values for different orders

### 2. Order Creation Process
When creating a new order:
- The system uses the `max_time_to_assign_order` value from the request payload
- Sets the timeout to current time + specified minutes
- Falls back to 15 minutes if not provided in the payload

### 3. API Usage Examples

#### Oneway Order Creation
```json
POST /api/orders/oneway/confirm
{
  "vendor_id": "123e4567-e89b-12d3-a456-426614174000",
  "car_type": "Hatchback",
  "pickup_drop_location": {"0": "Chennai", "1": "Bangalore"},
  "start_date_time": "2024-01-15T10:00:00Z",
  "customer_name": "John Doe",
  "customer_number": "9876543210",
  "cost_per_km": 10,
  "extra_cost_per_km": 5,
  "driver_allowance": 100,
  "extra_driver_allowance": 50,
  "permit_charges": 50,
  "extra_permit_charges": 25,
  "hill_charges": 0,
  "toll_charges": 50,
  "pickup_notes": "Call before arrival",
  "send_to": "ALL",
  "max_time_to_assign_order": 30,
  "toll_charge_update": true
}
```

#### Hourly Rental Order Creation
```json
POST /api/orders/hourly/confirm
{
  "vendor_id": "123e4567-e89b-12d3-a456-426614174000",
  "car_type": "Sedan",
  "pickup_drop_location": {"0": "Chennai"},
  "pick_near_city": "Chennai",
  "start_date_time": "2024-01-15T10:00:00Z",
  "customer_name": "Jane Doe",
  "customer_number": "9876543210",
  "package_hours": 8,
  "cost_per_pack": 1000,
  "extra_cost_per_pack": 200,
  "additional_cost_per_hour": 100,
  "extra_additional_cost_per_hour": 50,
  "pickup_notes": "Airport pickup",
  "max_time_to_assign_order": 45,
  "toll_charge_update": false
}
```

## Implementation Details

### Schema Updates

#### `OnewayQuoteRequest` and `OnewayConfirmRequest`
Added:
- `max_time_to_assign_order: Optional[int] = Field(default=15)`
- `toll_charge_update: Optional[bool] = Field(default=False)`

#### `RentalOrderRequest`
Added:
- `max_time_to_assign_order: Optional[int] = Field(default=15)`
- `toll_charge_update: Optional[bool] = Field(default=False)`

### Modified Functions

#### `create_master_from_new_order()`
Now accepts:
- `max_time_to_assign_order` parameter from payload instead of calculating from database
- `toll_charge_update` parameter from payload

#### `create_master_from_hourly()`
Now accepts:
- `max_time_to_assign_order` parameter from payload instead of calculating from database
- `toll_charge_update` parameter from payload

#### `create_oneway_order()`
Now accepts and passes through:
- `max_time_to_assign_order` parameter
- `toll_charge_update` parameter

## Benefits

1. **Flexible Configuration**: Set different timeout values for different orders based on your business needs
2. **Payload-Based Control**: Specify timeout values and toll charge update settings directly in the request payload
3. **Default Safety**: Always falls back to 15 minutes if not specified, and False for toll charge updates
4. **Per-Order Customization**: Each order can have its own timeout value and toll charge update setting
5. **Toll Charge Management**: Control whether toll charges can be updated during the trip

## Usage

### For Oneway, Round Trip, and Multicity Orders
Add the `max_time_to_assign_order` and `toll_charge_update` fields to your request payload:
```json
{
  // ... other fields ...
  "max_time_to_assign_order": 30,  // 30 minutes timeout
  "toll_charge_update": true       // Allow toll charge updates during trip
}
```

### For Hourly Rental Orders
Add the `max_time_to_assign_order` and `toll_charge_update` fields to your request payload:
```json
{
  // ... other fields ...
  "max_time_to_assign_order": 45,  // 45 minutes timeout
  "toll_charge_update": false      // Disable toll charge updates during trip
}
```

### Default Behavior
- If `max_time_to_assign_order` is not provided, the system defaults to 15 minutes
- If `toll_charge_update` is not provided, the system defaults to False

## Testing

Run the test files to verify the functionality:
```bash
python app/tests/test_payload_max_time.py
python app/tests/test_toll_charge_update.py
```

## Database Impact

This feature uses the existing `max_time_to_assign_order` field in the orders table. No database schema changes are required.
