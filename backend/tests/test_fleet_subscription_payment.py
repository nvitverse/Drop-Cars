"""Staff make a partner Trusted through ONE flow: pick the plan, pick where the money came from (wallet, or UPI / bank / cash recorded)."""
import uuid

import pytest
from fastapi import HTTPException

from app.api.routes import fleet_subscriptions as fs
from app.api.routes import admin as adm
from app.models.wallet_ledger import WalletLedger


def _owner(db, balance):
    from app.models.vehicle_owner import VehicleOwnerCredentials
    from app.models.vehicle_owner_details import VehicleOwnerDetails
    phone = "9" + str(uuid.uuid4().int)[:9]
    cred = VehicleOwnerCredentials(primary_number=phone, hashed_password="x")
    db.add(cred)
    db.flush()
    d = VehicleOwnerDetails(vehicle_owner_id=cred.id, full_name="Fleet " + phone[-4:], primary_number=phone, aadhar_number="A" + str(uuid.uuid4().int)[:11],
                            address="x", city="Salem", pincode="600001", wallet_balance=balance)
    db.add(d)
    db.flush()
    return d


ADMIN = type("A", (), {"id": uuid.uuid4(), "username": "staff", "role": "Owner"})()


def _pay(db, owner, **kw):
    body = dict(payment_channel="Wallet (deduct from partner wallet)", amount=1000, plan_type="YEARLY", mark_as_trusted=True)
    body.update(kw)
    return fs.record_manual_subscription_payment(owner.vehicle_owner_id, fs.ManualPaymentRequest(**body), db, ADMIN)


def test_wallet_payment_takes_the_money_and_makes_the_partner_trusted_in_one_step(pg_session):
    o = _owner(pg_session, 1500)
    out = _pay(pg_session, o)
    pg_session.refresh(o)
    assert (o.wallet_balance, o.subscription_type, o.tier) == (500, "YEARLY", "PREFERRED")
    assert out["tier"] == "PREFERRED" and out["wallet_balance"] == 500
    led = pg_session.query(WalletLedger).filter(WalletLedger.vehicle_owner_id == o.vehicle_owner_id, WalletLedger.reference_type == "SUBSCRIPTION_FEE_WALLET").all()
    assert len(led) == 1 and led[0].amount == 1000


def test_wallet_payment_without_enough_money_changes_nothing(pg_session):
    o = _owner(pg_session, 300)
    with pytest.raises(HTTPException) as e:
        _pay(pg_session, o)
    assert e.value.status_code == 400 and "only" in e.value.detail
    pg_session.refresh(o)
    assert (o.wallet_balance, o.subscription_type, o.tier) == (300, None, "STANDARD")


def test_a_payment_made_outside_the_app_is_recorded_without_touching_the_wallet(pg_session):
    o = _owner(pg_session, 300)
    _pay(pg_session, o, payment_channel="GPay (Google Pay)", payment_ref="UTR123", plan_type="MONTHLY", amount=199)
    pg_session.refresh(o)
    assert (o.wallet_balance, o.subscription_type, o.tier, o.subscription_payment_channel) == (300, "MONTHLY", "PREFERRED", "GPay (Google Pay)")


def test_the_manual_trusted_switch_answers_with_the_new_tier(pg_session):
    o = _owner(pg_session, 0)
    out = adm.set_trusted_partner_override(o.vehicle_owner_id, adm.TrustedPartnerOverrideRequest(trusted=True, reason="verified documents"), ADMIN, pg_session)
    assert out["tier"] == "PREFERRED" and out["admin_trusted_override"] is True
    out = adm.set_trusted_partner_override(o.vehicle_owner_id, adm.TrustedPartnerOverrideRequest(trusted=False, reason="trial over"), ADMIN, pg_session)
    assert out["tier"] == "STANDARD"
