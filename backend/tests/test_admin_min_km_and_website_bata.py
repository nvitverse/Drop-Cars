"""Admin "Post booking": editable minimum billable km, and the website rule
"whatever bata was booked, the driver's bata is 300"."""
from app.crud.customer_booking_request import split_website_bata
from app.crud.new_orders import apply_min_km_override


def _fare(total_km, actual_when_floored=0, rate=15, extra_rate=1, bata=300, extra_bata=100):
    base = total_km * rate
    extra = total_km * extra_rate
    return {
        "total_km": total_km, "calculated_km": total_km, "trip_time": "2 hours",
        "base_km_amount": base,
        "total_amount": base + extra + bata + extra_bata,
        "customer_amount": base + extra + bata + extra_bata,
        "driver_amount": base + bata,
        "vendor_basic_commession_amount": 0,
        "remark_trip_min_km": actual_when_floored,
    }


def test_website_bata_split():
    assert split_website_bata(500) == (300, 200)        # SUV booked with 500
    assert split_website_bata(300) == (300, 0)
    assert split_website_bata(400, 100) == (300, 200)   # Innova 400 + 100 extra
    assert split_website_bata(None, None) == (300, 0)


def test_no_override_leaves_fare_alone():
    fare = _fare(130, actual_when_floored=80)
    assert apply_min_km_override(fare, None, 15, 1) is fare
    assert apply_min_km_override(fare, 130, 15, 1) is fare


def test_admin_lowers_the_minimum():
    # Route is 80 km, default floor billed 130. Admin sets the minimum to 100.
    fare = apply_min_km_override(_fare(130, actual_when_floored=80), 100, 15, 1)
    assert fare["total_km"] == 100
    assert fare["base_km_amount"] == 1500
    assert fare["driver_amount"] == 1500 + 300
    assert fare["customer_amount"] == 1500 + 100 + 300 + 100
    assert fare["calculated_km"] == 80
    assert fare["remark_trip_min_km"] == 80


def test_minimum_below_the_route_bills_actual_km():
    # Route is 80 km; minimum set to 50 -> bill the real 80 km.
    fare = apply_min_km_override(_fare(130, actual_when_floored=80), 50, 15, 1)
    assert fare["total_km"] == 80
    assert fare["remark_trip_min_km"] == 0


def test_admin_raises_the_minimum_on_a_long_route():
    # Route is 200 km (no floor applied); minimum raised to 250.
    fare = apply_min_km_override(_fare(200), 250, 15, 1)
    assert fare["total_km"] == 250
    assert fare["driver_amount"] == 250 * 15 + 300
    assert fare["remark_trip_min_km"] == 200


def test_minimum_never_cuts_a_long_route():
    fare = _fare(400)
    assert apply_min_km_override(fare, 130, 15, 1) is fare


def test_exact_km_override_bills_the_typed_km():
    from app.crud.new_orders import apply_exact_km_override
    # Route is 320 km, default billing 320; admin sets 300.
    fare = apply_exact_km_override(_fare(320), 300, 15, 1)
    assert fare["total_km"] == 300
    assert fare["base_km_amount"] == 4500
    assert fare["driver_amount"] == 4500 + 300
    assert fare["calculated_km"] == 320
    assert fare["remark_trip_min_km"] == 0


def test_exact_km_override_remembers_the_real_route_when_a_floor_was_applied():
    from app.crud.new_orders import apply_exact_km_override
    fare = apply_exact_km_override(_fare(130, actual_when_floored=80), 100, 15, 1)
    assert fare["total_km"] == 100 and fare["calculated_km"] == 80


def test_exact_km_override_same_km_or_none_changes_nothing():
    from app.crud.new_orders import apply_exact_km_override
    fare = _fare(320)
    assert apply_exact_km_override(fare, None, 15, 1) is fare
    assert apply_exact_km_override(fare, 320, 15, 1) is fare


def test_admin_km_prefers_the_exact_km_over_the_minimum_rule():
    from types import SimpleNamespace
    from app.crud.new_orders import apply_admin_km
    p = SimpleNamespace(km_override=250, min_km_override=500, cost_per_km=15, extra_cost_per_km=1)
    assert apply_admin_km(_fare(320), p)["total_km"] == 250
    p = SimpleNamespace(km_override=None, min_km_override=400, cost_per_km=15, extra_cost_per_km=1)
    assert apply_admin_km(_fare(320), p)["total_km"] == 400
