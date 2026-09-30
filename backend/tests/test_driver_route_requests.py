import sys
import os
import uuid
from datetime import datetime, timedelta, timezone

# Add backend directory to sys.path
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), '..')))

from app.database.session import SessionLocal, Base, engine
from app.models.driver_route_request import DriverRouteRequest
from app.utils.driver_route_matcher import (
    add_driver_route_request,
    match_and_auto_assign_order
)


def test_max_3_routes_limit():
    print("--- Test 1: Enforce Maximum 3 Active Routes Limit per Driver ---")
    Base.metadata.create_all(bind=engine)
    db = SessionLocal()

    driver_id = str(uuid.uuid4())
    driver_name = "Karthik Raja"
    until = datetime.now(timezone.utc) + timedelta(hours=5)

    # Clean previous test entries
    db.query(DriverRouteRequest).filter(DriverRouteRequest.driver_id == driver_id).delete()
    db.commit()

    # Add 3 routes
    r1 = add_driver_route_request(db, driver_id, driver_name, "Chennai", "Madurai", until)
    r2 = add_driver_route_request(db, driver_id, driver_name, "Coimbatore", "Trichy", until)
    r3 = add_driver_route_request(db, driver_id, driver_name, "Salem", "Chennai", until)
    print(f"Added 3 routes successfully: {r1.origin_city}->{r1.destination_city}, {r2.origin_city}->{r2.destination_city}, {r3.origin_city}->{r3.destination_city}")

    # Attempting 4th route must fail!
    try:
        add_driver_route_request(db, driver_id, driver_name, "Trichy", "Chennai", until)
        assert False, "Should have thrown ValueError for 4th route"
    except ValueError as val_err:
        print(f"4th Route Attempt Blocked Correctly: {val_err}")

    print("[OK] Test 1 Passed: Max 3 routes limit enforced!")
    db.close()


def test_zero_assignment_without_request():
    print("\n--- Test 2: Zero Auto-Assignment Without Driver Request ---")
    db = SessionLocal()

    # Try assigning a route no driver has requested e.g., Kanyakumari -> Vellore
    res = match_and_auto_assign_order(
        db=db,
        order_id=str(uuid.uuid4()),
        pickup_city="Kanyakumari",
        drop_city="Vellore",
        car_type="Sedan"
    )

    print(f"Result for unrequested route: {res}")
    assert res["assigned"] is False
    assert "No driver has requested" in res["reason"]
    print("[OK] Test 2 Passed: Zero auto-assignment safety rule verified!")
    db.close()


def test_matching_route_auto_assignment():
    print("\n--- Test 3: Auto-Assignment on Matching Requested Route ---")
    db = SessionLocal()

    # Clean previous routes
    db.query(DriverRouteRequest).delete()
    db.commit()

    driver_id = str(uuid.uuid4())
    driver_name = "Santhosh M"
    until = datetime.now(timezone.utc) + timedelta(hours=6)

    # Clean previous
    db.query(DriverRouteRequest).filter(DriverRouteRequest.driver_id == driver_id).delete()
    db.commit()

    # Register route request for Chennai -> Madurai
    add_driver_route_request(
        db=db,
        driver_id=driver_id,
        driver_name=driver_name,
        origin_city="Chennai",
        destination_city="Madurai",
        available_until=until,
        driver_phone="9876543210",
        driver_email="santhosh@example.com",
        car_number="TN 01 AB 1234"
    )

    # Order arrives for Chennai -> Madurai
    order_id = str(uuid.uuid4())
    res = match_and_auto_assign_order(
        db=db,
        order_id=order_id,
        pickup_city="Chennai",
        drop_city="Madurai",
        car_type="Sedan"
    )

    print(f"Auto-Assignment Result: {res}")
    assert res["assigned"] is True
    assert res["assigned_driver_name"] == driver_name
    assert res["intimation"]["push_sent"] is True
    assert res["acceptance_timeout_minutes"] == 10

    # Verify route status changed to FULFILLED
    req = db.query(DriverRouteRequest).filter(DriverRouteRequest.driver_id == driver_id).first()
    assert req.status == "FULFILLED"
    assert req.is_active is False
    print("[OK] Test 3 Passed: Auto-assignment, Intimation & Route Fulfillment verified!")
    db.close()


if __name__ == "__main__":
    test_max_3_routes_limit()
    test_zero_assignment_without_request()
    test_matching_route_auto_assignment()
    print("\n[SUCCESS] ALL DRIVER ROUTE ASSIGNMENT TESTS PASSED!")
