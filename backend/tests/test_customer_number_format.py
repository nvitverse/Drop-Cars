"""The Admin "Post booking" form sends the country code and the number with a
space between them ("+91 8838485050"). Posting a booking failed with "Invalid
mobile number format" until the validator learned to clean that up."""
import pytest

from app.schemas.new_orders import normalize_customer_number, OnewayQuoteRequest, RentalOrderRequest


@pytest.mark.parametrize("typed", [
    "+91 8838485050", "+918838485050", "8838485050", "+91-88384 85050", " +91 (88384) 85050 ",
])
def test_number_is_cleaned_to_one_format(typed):
    assert normalize_customer_number(typed) == "+918838485050"


@pytest.mark.parametrize("typed", ["", "12345", "+91 abc", "+0123456789", None])
def test_bad_numbers_are_still_rejected(typed):
    with pytest.raises(ValueError):
        normalize_customer_number(typed)


def test_oneway_request_accepts_spaced_number():
    req = OnewayQuoteRequest(
        vendor_id=None, trip_type="Oneway", car_type="SEDAN_4_PLUS_1",
        pickup_drop_location={"0": "Chennai", "1": "Vellore"},
        start_date_time="2026-10-02T10:00:00+05:30",
        customer_name="NV", customer_number="+91 8838485050",
    )
    assert req.customer_number == "+918838485050"


def test_hourly_request_accepts_spaced_number():
    req = RentalOrderRequest(
        vendor_id=None, trip_type="Hourly Rental", car_type="SEDAN_4_PLUS_1",
        pickup_drop_location={"0": "Chennai"}, pick_near_city=["ALL"],
        start_date_time="2026-10-02T10:00:00+05:30",
        customer_name="NV", customer_number="+91 8838485050",
        package_hours={"hours": 5, "km_range": 50},
        cost_per_hour=250, extra_cost_per_hour=50, cost_for_addon_km=15, extra_cost_for_addon_km=5,
    )
    assert req.customer_number == "+918838485050"
