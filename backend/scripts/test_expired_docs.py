"""
Self-test script for document expiry validation in booking acceptance/assignment flows.
Tests fake objects without DB connectivity:
1. Expired licence (< today)
2. Expired insurance (< today)
3. Expired RC / FC / Permit / Pollution (< today)
4. Expiring today (== today) -> valid
5. Expiring in future (> today) -> valid
6. NULL / None dates -> valid
7. Mixed valid objects
"""

import sys
import os
from datetime import date, timedelta
from types import SimpleNamespace
from fastapi import HTTPException

# Add backend directory to sys.path so app modules can be imported
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

from app.crud.document_expiry import check_documents_expiry, assert_documents_valid_for_accept

def run_tests():
    today = date(2026, 9, 25)
    yesterday = today - timedelta(days=1)
    tomorrow = today + timedelta(days=1)
    past_date = date(2026, 9, 12)

    passed = 0
    total = 0

    print("Running document expiry unit tests with fake objects...\n")

    # Test 1: Expired licence
    total += 1
    fake_driver = SimpleNamespace(licence_expiry_date=past_date)
    msg = check_documents_expiry(driver=fake_driver, today=today)
    assert msg is not None and "Driving Licence expired on 12 Sep 2026" in msg, f"Test 1 failed: {msg}"
    try:
        assert_documents_valid_for_accept(driver=fake_driver, today=today)
        assert False, "Test 1 failed: did not raise HTTPException"
    except HTTPException as e:
        assert e.status_code == 403, f"Expected 403, got {e.status_code}"
        assert "Driving Licence expired on 12 Sep 2026" in e.detail
    print("[PASS] Test 1: Expired licence raises 403 with friendly message")
    passed += 1

    # Test 2: Expired insurance
    total += 1
    fake_car = SimpleNamespace(
        insurance_expiry_date=past_date,
        rc_expiry_date=None,
        fc_expiry_date=None,
        permit_expiry_date=None,
        pollution_expiry_date=None
    )
    msg = check_documents_expiry(car=fake_car, today=today)
    assert msg is not None and "Insurance expired on 12 Sep 2026" in msg, f"Test 2 failed: {msg}"
    try:
        assert_documents_valid_for_accept(car=fake_car, today=today)
        assert False, "Test 2 failed: did not raise HTTPException"
    except HTTPException as e:
        assert e.status_code == 403
        assert "Insurance expired on 12 Sep 2026" in e.detail
    print("[PASS] Test 2: Expired insurance raises 403 with friendly message")
    passed += 1

    # Test 3: Expired RC, Permit, FC, Pollution
    car_doc_tests = [
        ("rc_expiry_date", "RC"),
        ("permit_expiry_date", "Permit"),
        ("fc_expiry_date", "Fitness Certificate (FC)"),
        ("pollution_expiry_date", "Pollution (PUC) Certificate"),
    ]
    for field, doc_name in car_doc_tests:
        total += 1
        car_kwargs = {
            "insurance_expiry_date": None,
            "rc_expiry_date": None,
            "fc_expiry_date": None,
            "permit_expiry_date": None,
            "pollution_expiry_date": None,
        }
        car_kwargs[field] = yesterday
        c = SimpleNamespace(**car_kwargs)
        msg = check_documents_expiry(car=c, today=today)
        assert msg is not None and f"{doc_name} expired on" in msg, f"Failed for {doc_name}: {msg}"
        try:
            assert_documents_valid_for_accept(car=c, today=today)
            assert False, f"Failed for {doc_name}: did not raise"
        except HTTPException as e:
            assert e.status_code == 403
        print(f"[PASS] Test 3: Expired {doc_name} raises 403")
        passed += 1

    # Test 4: Expiring today (== today) -> MUST BE VALID
    total += 1
    fake_driver_today = SimpleNamespace(licence_expiry_date=today)
    fake_car_today = SimpleNamespace(
        insurance_expiry_date=today,
        rc_expiry_date=today,
        fc_expiry_date=today,
        permit_expiry_date=today,
        pollution_expiry_date=today
    )
    msg = check_documents_expiry(driver=fake_driver_today, car=fake_car_today, today=today)
    assert msg is None, f"Test 4 failed: expiring today must be valid, got: {msg}"
    assert_documents_valid_for_accept(driver=fake_driver_today, car=fake_car_today, today=today)
    print("[PASS] Test 4: Expiring today is valid (does not block)")
    passed += 1

    # Test 5: Expiring in future (> today) -> MUST BE VALID
    total += 1
    fake_driver_future = SimpleNamespace(licence_expiry_date=tomorrow)
    fake_car_future = SimpleNamespace(
        insurance_expiry_date=tomorrow,
        rc_expiry_date=tomorrow,
        fc_expiry_date=tomorrow,
        permit_expiry_date=tomorrow,
        pollution_expiry_date=tomorrow
    )
    msg = check_documents_expiry(driver=fake_driver_future, car=fake_car_future, today=today)
    assert msg is None, f"Test 5 failed: future date must be valid, got: {msg}"
    assert_documents_valid_for_accept(driver=fake_driver_future, car=fake_car_future, today=today)
    print("[PASS] Test 5: Expiring in future is valid")
    passed += 1

    # Test 6: NULL dates -> MUST BE VALID (skip)
    total += 1
    fake_driver_null = SimpleNamespace(licence_expiry_date=None)
    fake_car_null = SimpleNamespace(
        insurance_expiry_date=None,
        rc_expiry_date=None,
        fc_expiry_date=None,
        permit_expiry_date=None,
        pollution_expiry_date=None
    )
    msg = check_documents_expiry(driver=fake_driver_null, car=fake_car_null, today=today)
    assert msg is None, f"Test 6 failed: null dates must be skipped, got: {msg}"
    assert_documents_valid_for_accept(driver=fake_driver_null, car=fake_car_null, today=today)
    print("[PASS] Test 6: NULL dates are skipped (backward compatible)")
    passed += 1

    # Test 7: String date formats (e.g. '2026-09-12' from API/JSON)
    total += 1
    fake_driver_str = SimpleNamespace(licence_expiry_date="2026-09-12")
    msg = check_documents_expiry(driver=fake_driver_str, today=today)
    assert msg is not None and "12 Sep 2026" in msg
    print("[PASS] Test 7: String date formats handled properly")
    passed += 1

    print(f"\nALL {passed}/{total} TESTS PASSED SUCCESSFULLY!")

if __name__ == "__main__":
    run_tests()
