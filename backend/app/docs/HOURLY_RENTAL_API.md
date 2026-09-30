### Hourly Rental API (Updated)

This document describes the updated Hourly Rental flow with new field names and `package_hours` JSON structure.

### Key Changes
- package_hours is now an object: {"hours": <int>, "km_range": <int>}
- Renamed pricing fields:
  - cost_per_pack -> cost_per_hour
  - extra_cost_per_pack -> extra_cost_per_hour
  - additional_cost_per_hour -> cost_for_addon_km
  - extra_additional_cost_per_hour -> extra_cost_for_addon_km

### Data Model
- Model: `app/models/hourly_rental.py`
  - package_hours: JSON ({"hours": int, "km_range": int})
  - cost_per_hour: int
  - extra_cost_per_hour: int
  - cost_for_addon_km: int
  - extra_cost_for_addon_km: int

### Schemas
- Request: `RentalOrderRequest` (in `app/schemas/new_orders.py`)
  - package_hours: {"hours": int, "km_range": int}
  - cost_per_hour: int
  - extra_cost_per_hour: int
  - cost_for_addon_km: int
  - extra_cost_for_addon_km: int

- Quote Response: `HourlyQuoteResponse`
  - fare.total_hours: number
  - fare.vendor_amount: int
  - fare.estimate_price: int

### Endpoints

GET /api/rental_hrs_data
- Returns cached hourly plan options from `load_data/hourly_plans.json`.

POST /api/refresh-rental-hrs-data
- Reloads hourly plan options from JSON.

POST /api/hourly/quote
- Body (example):
```json
{
  "vendor_id": "00000000-0000-0000-0000-000000000000",
  "trip_type": "Hourly Rental",
  "car_type": "Sedan",
  "pickup_drop_location": {"0": "Chennai"},
  "pick_near_city": "Chennai",
  "start_date_time": "2025-10-01T10:00:00Z",
  "customer_name": "John Doe",
  "customer_number": "9876543210",
  "package_hours": {"hours": 5, "km_range": 50},
  "cost_per_hour": 300,
  "extra_cost_per_hour": 50,
  "cost_for_addon_km": 12,
  "extra_cost_for_addon_km": 3,
  "pickup_notes": "Near main gate",
  "max_time_to_assign_order": 15,
  "toll_charge_update": false
}
```

- Response (example):
```json
{
  "fare": {
    "total_hours": 5,
    "vendor_amount": 1750,
    "estimate_price": 1500
  },
  "echo": { /* request body echoed */ }
}
```

POST /api/hourly/confirm
- Persists an hourly rental order with the new fields.
- Returns a master order created from the hourly order.

### Fare Calculation
- Base estimate: hours × cost_per_hour
- Vendor amount: hours × (cost_per_hour + extra_cost_per_hour)
- Addon kilometers (beyond km_range) are priced at confirmation/closure time with:
  - cost_for_addon_km (base)
  - extra_cost_for_addon_km (vendor margin)

### Seed Data
- `load_data/hourly_plans.json` already uses entries like {"hours": 5, "km_range": 50}.


