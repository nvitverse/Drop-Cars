"""Permanent block (identifiers cannot register again, drivers and cars go with the owner) and the subscription lifecycle
(30 days Standard -> plan -> 30 days grace -> suspended, lifted by buying the plan)."""
import asyncio
import uuid
from datetime import date, timedelta

import pytest
from fastapi import HTTPException


def _digits(n):
    return "".join(str(uuid.uuid4().int))[:n]


def _owner(db, phone=None, aadhaar=None, pan="ABCDE1234F", created_days_ago=0, **details):
    from app.models.vehicle_owner import VehicleOwnerCredentials
    from app.models.vehicle_owner_details import VehicleOwnerDetails
    phone = phone or ("9" + _digits(9))
    cred = VehicleOwnerCredentials(primary_number=phone, hashed_password="x")
    db.add(cred)
    db.flush()
    d = VehicleOwnerDetails(vehicle_owner_id=cred.id, full_name="Fleet " + phone[-4:], primary_number=phone,
                            secondary_number="8" + _digits(9), aadhar_number=aadhaar or _digits(12), pan_number=pan,
                            address="x", city="Salem", pincode="600001", wallet_balance=0, **details)
    db.add(d)
    db.flush()
    if created_days_ago:
        from sqlalchemy import text
        db.execute(text("UPDATE vehicle_owner_details SET created_at = now() - (:d || ' days')::interval WHERE vehicle_owner_id = :i"),
                   {"d": str(created_days_ago), "i": str(cred.id)})
        db.refresh(d)
    return cred, d


def _driver(db, owner_id, phone=None, licence=None):
    from app.models.car_driver import CarDriver
    phone = phone or ("7" + _digits(9))
    drv = CarDriver(vehicle_owner_id=owner_id, full_name="Driver", primary_number=phone, licence_number=licence or ("TN" + _digits(12)),
                    hashed_password="x", address="x", city="Salem", pincode="600001")
    db.add(drv)
    db.flush()
    return drv


# ---------------------------------------------------------------- the blocklist ----------------------------------------------------
def test_normalising_makes_every_spelling_of_a_number_the_same():
    from app.utils import blocklist as b
    assert b.normalize(b.PHONE, "+91 98846-28317") == "9884628317"
    assert b.normalize(b.PHONE, "09884628317") == "9884628317"
    assert b.normalize(b.PHONE, "12345") is None
    assert b.normalize(b.EMAIL, " Foo@Bar.COM ") == "foo@bar.com"
    assert b.normalize(b.LICENCE, "tn 01 2020-0001234") == "TN0120200001234"
    assert b.normalize(b.VEHICLE, "TN-01 ab 1234") == "TN01AB1234"
    assert b.normalize(b.AADHAAR, "1234 5678 9012") == "123456789012"
    assert b.normalize(b.AADHAAR, "1234") is None


def test_blocking_an_owner_blocks_every_identifier_driver_and_car(pg_session):
    from app.crud.admin_management import set_permanent_block
    from app.models.car_details import CarDetails, CarStatusEnum
    from app.utils import blocklist as b

    cred, det = _owner(pg_session, aadhaar="111122223333", pan="PQRSX9999Z")
    drv = _driver(pg_session, cred.id, phone="9000011111", licence="TN0120250001111")
    set_permanent_block(pg_session, str(cred.id), "vehicle_owner", "fraud", blocked=True, by="tester")

    # every number that identifies him or his people is now refused
    for kw in ({"phone": cred.primary_number}, {"phone": det.secondary_number}, {"aadhaar": "1111 2222 3333"}, {"pan": "pqrsx9999z"},
               {"phone": "+91 9000011111"}, {"licence": "tn01 2025 0001111"}):
        with pytest.raises(HTTPException) as e:
            b.assert_not_blocked(pg_session, **kw)
        assert e.value.status_code == 403 and "[IDENTITY_BLOCKED]" in e.value.detail
    b.assert_not_blocked(pg_session, phone="9111122223")             # a stranger is fine

    pg_session.refresh(drv)
    assert drv.permanently_blocked is True
    # no document, number or hash of the real value is kept in clear: only hashes and the last 4 characters
    from app.models.blocked_identifier import BlockedIdentifier
    rows = pg_session.query(BlockedIdentifier).filter(BlockedIdentifier.source_account_id == str(cred.id)).all()
    assert rows and all(len(r.id_hash) == 64 and len(r.hint or "") <= 4 for r in rows)


def test_unblocking_lifts_exactly_those_entries(pg_session):
    from app.crud.admin_management import set_permanent_block
    from app.utils import blocklist as b

    cred, _ = _owner(pg_session)
    other, _ = _owner(pg_session)
    set_permanent_block(pg_session, str(cred.id), "vehicle_owner", "fraud", blocked=True, by="t")
    set_permanent_block(pg_session, str(other.id), "vehicle_owner", "fraud", blocked=True, by="t")
    set_permanent_block(pg_session, str(cred.id), "vehicle_owner", "", blocked=False, by="t")
    b.assert_not_blocked(pg_session, phone=cred.primary_number)      # lifted
    with pytest.raises(HTTPException):
        b.assert_not_blocked(pg_session, phone=other.primary_number)  # the other one stays blocked


def test_a_blocked_person_cannot_sign_up_again(pg_session):
    from app.crud.admin_management import set_permanent_block
    from app.crud.car_driver import create_car_driver
    from app.crud.car_details import create_car_details

    cred, det = _owner(pg_session)
    set_permanent_block(pg_session, str(cred.id), "vehicle_owner", "fraud", blocked=True, by="t")

    class DriverForm:                                  # only what the guard reads - it must refuse before anything else is touched
        primary_number = det.primary_number
        secondary_number = None
        email = None
        licence_number = "TN0120259999999"
        aadhar_number = None

    with pytest.raises(HTTPException) as e:
        create_car_driver(pg_session, DriverForm())
    assert "[IDENTITY_BLOCKED]" in e.value.detail


def test_the_status_route_no_longer_says_invalid_for_block(pg_session):
    """The Admin App's Block button sent 'Blocked' and got 'Invalid account status'."""
    from app.crud.admin_management import update_vehicle_owner_account_status
    from app.models.vehicle_owner import AccountStatusEnum

    cred, _ = _owner(pg_session)
    res = update_vehicle_owner_account_status(pg_session, str(cred.id), "Blocked")
    assert res.account_status == AccountStatusEnum.INACTIVE and res.blocked_reason
    res = update_vehicle_owner_account_status(pg_session, str(cred.id), "Active")
    assert res.account_status == AccountStatusEnum.ACTIVE and not res.blocked_reason


# ---------------------------------------------------------------- the request gate -------------------------------------------------
def _call(path, token):
    from starlette.requests import Request
    from app.core import account_gate
    scope = {"type": "http", "method": "GET", "path": path, "headers": [(b"authorization", b"Bearer " + token.encode())], "query_string": b""}
    return asyncio.run(account_gate.check(Request(scope)))


def _token(sub):
    from jose import jwt
    from app.core.security import ALGORITHM, SECRET_KEY
    return jwt.encode({"sub": str(sub)}, SECRET_KEY, algorithm=ALGORITHM)


def test_gate_stops_a_blocked_owner_and_his_driver_but_not_others(pg_session, monkeypatch):
    from app.core import account_gate
    from app.crud.admin_management import set_permanent_block
    from app.database import session as dbs

    cred, _ = _owner(pg_session)
    drv = _driver(pg_session, cred.id)
    good, _ = _owner(pg_session)
    pg_session.commit()
    monkeypatch.setattr(dbs, "SessionLocal", lambda: pg_session)      # the gate uses its own session; reuse the test one
    monkeypatch.setattr(pg_session, "close", lambda: None)
    account_gate._cache.clear()
    assert _call("/api/orders/mine", _token(cred.id)) is None
    set_permanent_block(pg_session, str(cred.id), "vehicle_owner", "fraud", blocked=True, by="t")
    r = _call("/api/orders/mine", _token(cred.id))
    assert r is not None and r.status_code == 403 and b"[ACCOUNT_BLOCKED]" in r.body
    r = _call("/api/orders/mine", _token(drv.id))
    assert r is not None and r.status_code == 403
    assert _call("/api/orders/mine", _token(good.id)) is None


# ---------------------------------------------------------------- subscription lifecycle -------------------------------------------
def _settings(**over):
    s = {"enabled": True, "standard_free_days": 30, "lapse_grace_days": 30, "start_date": None}
    s.update(over)
    return s


def test_new_account_is_standard_for_30_days_then_expired(pg_session):
    from app.crud.subscription_lifecycle import standing
    cred, det = _owner(pg_session, created_days_ago=10)
    assert standing(det, det.created_at, _settings())["state"] == "STANDARD"
    assert standing(det, det.created_at, _settings())["days_left"] in (19, 20)
    cred2, det2 = _owner(pg_session, created_days_ago=45)
    assert standing(det2, det2.created_at, _settings())["state"] == "SUSPENDED"


def test_rule_start_day_gives_existing_accounts_a_fresh_30_days(pg_session):
    from app.crud.subscription_lifecycle import standing
    cred, det = _owner(pg_session, created_days_ago=400)
    assert standing(det, det.created_at, _settings())["state"] == "SUSPENDED"
    assert standing(det, det.created_at, _settings(start_date=date.today().isoformat()))["state"] == "STANDARD"


def test_a_lapsed_plan_gives_30_more_days_then_suspends(pg_session):
    from app.crud.subscription_lifecycle import standing
    cred, det = _owner(pg_session, created_days_ago=200, subscription_type="MONTHLY", billing_next_date=date.today() - timedelta(days=10))
    assert standing(det, det.created_at, _settings())["state"] == "STANDARD"           # 20 days of grace left
    cred2, det2 = _owner(pg_session, created_days_ago=200, subscription_type="MONTHLY", billing_next_date=date.today() - timedelta(days=40))
    assert standing(det2, det2.created_at, _settings())["state"] == "SUSPENDED"
    cred3, det3 = _owner(pg_session, created_days_ago=200, subscription_type="MONTHLY", billing_next_date=date.today() + timedelta(days=5))
    assert standing(det3, det3.created_at, _settings())["state"] == "SUBSCRIBED"


def test_job_is_dormant_until_switched_on_and_dry_run_changes_nothing(pg_session):
    from app.crud.subscription_lifecycle import run_subscription_lifecycle, update_settings, REASON
    cred, det = _owner(pg_session, created_days_ago=90)
    pg_session.commit()
    off = run_subscription_lifecycle(pg_session, dry_run=False)
    assert off["enabled"] is False and not off["suspended"]
    update_settings(pg_session, enabled=True)                         # first switch-on stamps the start date = today
    # everybody (even the 90-day-old account) now has 30 fresh days
    res = run_subscription_lifecycle(pg_session, dry_run=True)
    assert str(cred.id) not in [x["vehicle_owner_id"] for x in res["suspended"]]
    # move the start date back so the account is over its window, then dry run vs real run
    from app.models.platform_setting import PlatformSetting
    row = pg_session.query(PlatformSetting).filter(PlatformSetting.key == "lifecycle_start_date").first()
    row.value = (date.today() - timedelta(days=60)).isoformat()
    pg_session.commit()
    res = run_subscription_lifecycle(pg_session, dry_run=True)
    assert str(cred.id) in [x["vehicle_owner_id"] for x in res["suspended"]]
    pg_session.refresh(det)
    assert not det.billing_suspended                                  # dry run: untouched
    run_subscription_lifecycle(pg_session, dry_run=False)
    pg_session.refresh(det)
    assert det.billing_suspended and det.billing_suspended_reason == REASON


def test_buying_the_plan_lifts_the_suspension(pg_session):
    from app.crud.subscription_lifecycle import REASON
    from app.crud import billing

    cred, det = _owner(pg_session)
    det.billing_suspended = True
    det.billing_suspended_reason = REASON
    det.wallet_balance = 600
    pg_session.commit()
    billing.start_monthly_subscription(pg_session, cred.id)
    pg_session.refresh(det)
    assert det.billing_suspended is False and det.billing_suspended_reason is None
    assert det.subscription_type == "MONTHLY" and det.billing_next_date >= date.today()


def test_billing_sweep_never_reactivates_a_subscription_suspension(pg_session):
    from app.crud.subscription_lifecycle import REASON
    from app.crud.billing import run_billing
    cred, det = _owner(pg_session)
    det.billing_suspended = True
    det.billing_suspended_reason = REASON
    det.wallet_balance = 5000                                         # plenty of money - still suspended until the plan is bought
    pg_session.commit()
    run_billing(pg_session, dry_run=False)
    pg_session.refresh(det)
    assert det.billing_suspended is True


def test_gate_lets_a_subscription_suspended_owner_pay_but_nothing_else(pg_session, monkeypatch):
    from app.core import account_gate
    from app.crud.subscription_lifecycle import REASON
    from app.database import session as dbs

    cred, det = _owner(pg_session)
    drv = _driver(pg_session, cred.id)
    det.billing_suspended = True
    det.billing_suspended_reason = REASON
    pg_session.commit()
    monkeypatch.setattr(dbs, "SessionLocal", lambda: pg_session)
    monkeypatch.setattr(pg_session, "close", lambda: None)
    account_gate._cache.clear()
    r = _call("/api/orders/mine", _token(cred.id))
    assert r is not None and r.status_code == 403 and b"[ACCOUNT_SUSPENDED_SUBSCRIPTION]" in r.body
    r = _call("/api/assignments/accept", _token(drv.id))                      # his driver is stopped too
    assert r is not None and r.status_code == 403
    for ok in ("/api/wallet/balance", "/api/wallet/razorpay/order", "/api/subscriptions/status", "/api/users/vehicle-owner/billing-status", "/api/support/x"):
        assert _call(ok, _token(cred.id)) is None, ok
