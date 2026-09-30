### Cities and Near City Selection

- The cities list is loaded once at startup from `load_data/cities.json`.
- `notifications.selected_city` stores selected cities for a vehicle owner as a text[] array.
- `orders.pick_near_city` and `new_orders.pick_near_city` are stored as text[] arrays.
- For backward-compatible responses, pick_near_city is returned as string:
  - `ALL` if the array contains `ALL`
  - first city if single city
  - comma-joined string if multiple cities

### Endpoints

- GET /api/cities/vendor
  - Auth: Vendor
  - Response: ["Chennai", "Vellore", ...]

- GET /api/cities/vehicle-owner/selected
  - Auth: Vehicle Owner
  - Response: { "Chennai": true, "Vellore": false, ... }

- POST /api/cities/vehicle-owner/selected
  - Auth: Vehicle Owner
  - Body: ["Chennai", "Vellore"]
  - Response: { "selected_city": ["Chennai", "Vellore"] }

### Order Creation (NEAR_CITY)

- When `send_to` = `ALL`, the system stores `pick_near_city` as ["ALL"].
- When `send_to` = `NEAR_CITY`:
  - If a single city string is provided, it is stored as ["<city>"]
  - If an array of city names is provided, it is stored as-is
  - The list must be from `/api/cities/vendor`.
