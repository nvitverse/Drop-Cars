## End Trip Updates

- Validation rules:
  - If `toll_charge_update` is true, `updated_toll_charges` is required; request fails otherwise.
  - `end_km - start_km` must be greater than the original `trip_distance` for the order when available.

- Profit allocation on completion (Hourly Rental):
  - Recalculate with updated km and tolls.
  - Vendor profit = (vendor_total - estimated_total) + 10% of (cost_per_km * updated_km).
  - Admin profit = 10% of vendor profit.
  - Driver profit = estimated_total - admin profit.
  - Values are stored in `orders.vendor_profit`, `orders.admin_profit`, `orders.driver_profit`.

- Vendor Ledger:
  - On successful end-trip, a credit entry is added in `vendor_wallet_ledger` mapped by `order_id`.
  - Ledger records `amount`, `balance_before`, `balance_after`, and `notes`.
## Hourly Rental API

POST `/api/orders/hourly/quote`

Request: RentalOrderRequest
```json
{
  "vendor_id": "<uuid>",
  "trip_type": "Hourly Rental",
  "car_type": "Sedan",
  "pickup_drop_location": {"0": "Chennai"},
  "start_date_time": "2025-01-01T10:00:00Z",
  "customer_name": "John",
  "customer_number": "9000000000",
  "package_hours": 8,
  "cost_per_pack": 2000,
  "extra_cost_per_pack": 300,
  "additional_cost_per_hour": 250,
  "extra_additional_cost_per_hour": 50,
  "pickup_notes": "Near gate"
}
```

Response: HourlyQuoteResponse
```json
{
  "fare": {"total_hours": 8, "vendor_amount": 2000, "vehicle_owner_amount": 2300},
  "echo": { /* request fields */ }
}
```

POST `/api/orders/hourly/confirm`

Creates an hourly rental order and a corresponding row in master `orders`.
Response:
```json
{ "order_id": 123 }
```

## Unified Orders API

GET `/api/orders/all` — returns all orders unified from master `orders` table.

GET `/api/orders/vendor` — returns authenticated vendor's orders from master `orders`.

## Close Order

POST `/api/orders/{order_id}/close`

Consumes multipart/form-data:
- closed_vendor_price: int (form)
- closed_driver_price: int (form)
- commision_amount: int (form)
- start_km: int (form)
- end_km: int (form)
- contact_number: string (form)
- image: file (UploadFile)

Behavior:
- Uploads image to GCS via existing `upload_image_to_gcs` util
- Updates `orders` row with closing prices and `commision_amount`
- Creates an `end_records` row linked to the order with odometer readings, contact, image URL, and timestamp

Response:
```json
{ "order_id": 1, "end_record_id": 10, "img_url": "https://storage.googleapis.com/..." }
```


