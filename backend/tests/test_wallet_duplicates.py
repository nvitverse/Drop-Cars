"""Sellappandian, 2026-10-13: a Rs 870 refund was added to a driver's wallet twice because the driver asked twice. The same manual
credit again inside a day must be stopped (unless confirmed), and doubled money must show up in an audit."""
import uuid

import pytest
from fastapi import HTTPException

from app.crud.admin_wallet_adjust import adjust_wallet
from app.crud.wallet_duplicates import DUPLICATE_MARK, audit


def _owner(pg_session, name="Sellappandian", balance=0):
    from app.models.vehicle_owner import VehicleOwnerCredentials
    from app.models.vehicle_owner_details import VehicleOwnerDetails
    o = VehicleOwnerCredentials(primary_number="9" + str(uuid.uuid4().int)[:9], hashed_password="x")
    pg_session.add(o)
    pg_session.flush()
    pg_session.add(VehicleOwnerDetails(vehicle_owner_id=o.id, full_name=name, primary_number=o.primary_number, aadhar_number="A" + str(uuid.uuid4().int)[:11],
                                       address="x", city="Salem", pincode="600001", wallet_balance=balance))
    pg_session.flush()
    return o


def test_the_same_credit_twice_is_refused_until_confirmed(pg_session):
    o = _owner(pg_session)
    adjust_wallet(pg_session, "vehicle_owner", str(o.id), "credit", 870, "refund")
    with pytest.raises(HTTPException) as e:
        adjust_wallet(pg_session, "vehicle_owner", str(o.id), "credit", 870, "refund again")
    assert e.value.status_code == 409 and DUPLICATE_MARK in e.value.detail and "Rs 870" in e.value.detail
    # a different amount is a different payment
    assert adjust_wallet(pg_session, "vehicle_owner", str(o.id), "credit", 500, "other")["new_wallet_balance"] == 1370
    # confirmed second payment goes through
    out = adjust_wallet(pg_session, "vehicle_owner", str(o.id), "credit", 870, "second refund, confirmed", confirm_duplicate=True)
    assert out["new_wallet_balance"] == 2240


def test_the_audit_finds_doubled_money_by_name(pg_session):
    o = _owner(pg_session, name="Sellappandian Test")
    adjust_wallet(pg_session, "vehicle_owner", str(o.id), "credit", 870, "refund")
    adjust_wallet(pg_session, "vehicle_owner", str(o.id), "credit", 870, "refund", confirm_duplicate=True)
    other = _owner(pg_session, name="Someone Else")
    adjust_wallet(pg_session, "vehicle_owner", str(other.id), "credit", 100, "x")
    res = audit(pg_session, days=3, search="Sellappandian Test")
    assert len(res["groups"]) == 1 and res["groups"][0]["strength"] == "POSSIBLE" and res["groups"][0]["amount"] == 870
    assert res["groups"][0]["name"] == "Sellappandian Test" and res["possible_extra_total"] == 870
    assert audit(pg_session, days=3, search="Someone Else")["groups"] == []


def test_the_same_reference_credited_twice_is_a_definite_duplicate(pg_session):
    from app.crud.wallet import credit_wallet
    o = _owner(pg_session, name="Refund Twice")
    credit_wallet(pg_session, str(o.id), 400, reference_id="777", reference_type="TRIP_HOLD_REFUND", notes="hold refunded")
    credit_wallet(pg_session, str(o.id), 400, reference_id="777", reference_type="TRIP_HOLD_REFUND", notes="hold refunded")
    g = audit(pg_session, days=3, search="Refund Twice")["groups"]
    assert len(g) == 1 and g[0]["strength"] == "DEFINITE" and g[0]["total_extra"] == 400
