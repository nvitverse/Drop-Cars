from app.api.routes import customer_bookings as cb


def _fare(rate):
    return {"total_km": 450, "trip_time": "8h", "base_km_amount": 450 * rate, "driver_allowance": 300, "extra_driver_allowance": 0,
            "permit_charges": 0, "extra_permit_charges": 0, "hill_charges": 0, "toll_charges": 0, "night_charges": 0,
            "total_amount": 450 * rate + 300, "driver_amount": 450 * rate + 300, "customer_amount": 450 * rate + 300, "remark_trip_min_km": 130}


def test_quote_all_returns_one_live_price_per_vehicle(monkeypatch):
    monkeypatch.setattr(cb, "_calculate_fare_internal", lambda db, loc, trip, car: (_fare(15 if car.startswith("SEDAN") else 20), {}))
    out = cb.customer_quote_all(cb.CustomerQuoteAllRequest(pickup_drop_location={"0": "Chennai", "1": "Madurai"}, trip_type="Oneway"), db=None)
    assert out["fares"]["SEDAN_4_PLUS_1"].customer_amount == 450 * 15 + 300
    assert out["fares"]["INNOVA"].customer_amount == 450 * 20 + 300
    assert len(out["fares"]) >= 7


def test_quote_all_skips_a_vehicle_that_fails(monkeypatch):
    def fake(db, loc, trip, car):
        if car == "INNOVA":
            raise RuntimeError("no rate")
        return _fare(15), {}
    monkeypatch.setattr(cb, "_calculate_fare_internal", fake)
    out = cb.customer_quote_all(cb.CustomerQuoteAllRequest(pickup_drop_location={"0": "A", "1": "B"}, trip_type="Oneway"), db=None)
    assert "INNOVA" not in out["fares"] and "SEDAN_4_PLUS_1" in out["fares"]
