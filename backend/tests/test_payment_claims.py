"""A driver paid Rs 210 to the manual UPI ID and nothing knew about it (2026-10-12). Now he reports the UTR and staff approve with one tap."""
import uuid
from types import SimpleNamespace

import pytest
from fastapi import HTTPException

from app.api.routes import payment_claims as pc


def _owner(pg_session):
    from app.models.vehicle_owner import VehicleOwnerCredentials
    from app.models.vehicle_owner_details import VehicleOwnerDetails
    o = VehicleOwnerCredentials(primary_number="9" + str(uuid.uuid4().int)[:9], hashed_password="x")
    pg_session.add(o)
    pg_session.flush()
    pg_session.add(VehicleOwnerDetails(vehicle_owner_id=o.id, full_name="Test " + o.primary_number[-4:], primary_number=o.primary_number,
                                       aadhar_number="A" + str(uuid.uuid4().int)[:11], address="x", city="Salem", pincode="600001", wallet_balance=0))
    pg_session.flush()
    return o


def _utr():
    return "6" + str(uuid.uuid4().int)[:11]


def test_report_then_approve_credits_the_wallet_once(pg_session):
    from app.crud.wallet import get_owner_balance
    o = _owner(pg_session)
    utr = _utr()
    out = pc.create_claim(pc.ClaimBody(amount=210, utr=" " + utr + " ", purpose="wallet"), db=pg_session, vehicle_owner_id=str(o.id))
    assert out["claim"]["status"] == "PENDING" and out["claim"]["utr"] == utr
    before = get_owner_balance(pg_session, str(o.id))
    admin = SimpleNamespace(id=uuid.uuid4(), username="Priya", role="Owner")
    done = pc.approve_claim(out["claim"]["id"], pc.DecideBody(), db=pg_session, current_admin=admin)
    assert done["claim"]["status"] == "APPROVED" and get_owner_balance(pg_session, str(o.id)) == before + 210
    with pytest.raises(HTTPException) as e:                                      # a second tap must not credit again
        pc.approve_claim(out["claim"]["id"], pc.DecideBody(), db=pg_session, current_admin=admin)
    assert e.value.status_code == 409 and get_owner_balance(pg_session, str(o.id)) == before + 210


def test_same_reference_cannot_be_reported_twice_and_bad_references_are_refused(pg_session):
    o, o2 = _owner(pg_session), _owner(pg_session)
    utr = _utr()
    pc.create_claim(pc.ClaimBody(amount=100, utr=utr), db=pg_session, vehicle_owner_id=str(o.id))
    for who in (o, o2):
        with pytest.raises(HTTPException) as e:
            pc.create_claim(pc.ClaimBody(amount=100, utr=utr), db=pg_session, vehicle_owner_id=str(who.id))
        assert e.value.status_code == 409
    with pytest.raises(HTTPException) as e:
        pc.create_claim(pc.ClaimBody(amount=100, utr="12-34"), db=pg_session, vehicle_owner_id=str(o.id))
    assert e.value.status_code == 400


def test_rejecting_needs_a_reason_and_shows_it_to_the_person(pg_session):
    o = _owner(pg_session)
    c = pc.create_claim(pc.ClaimBody(amount=50, utr=_utr()), db=pg_session, vehicle_owner_id=str(o.id))["claim"]
    admin = SimpleNamespace(id=uuid.uuid4(), username="Priya", role="Owner")
    with pytest.raises(HTTPException) as e:
        pc.reject_claim(c["id"], pc.DecideBody(), db=pg_session, current_admin=admin)
    assert e.value.status_code == 400
    pc.reject_claim(c["id"], pc.DecideBody(note="No such payment in our bank statement"), db=pg_session, current_admin=admin)
    mine = pc.my_claims(db=pg_session, vehicle_owner_id=str(o.id))["claims"]
    assert mine[0]["status"] == "REJECTED" and "bank statement" in mine[0]["decision_note"]


def test_approving_a_plan_payment_switches_the_trusted_plan_on(pg_session):
    from app.models.vehicle_owner_details import VehicleOwnerDetails
    o = _owner(pg_session)
    det = pg_session.query(VehicleOwnerDetails).filter(VehicleOwnerDetails.vehicle_owner_id == o.id).one()
    c = pc.create_claim(pc.ClaimBody(amount=210, utr=_utr(), purpose="SUBSCRIPTION_MONTHLY"), db=pg_session, vehicle_owner_id=str(o.id))["claim"]
    out = pc.approve_claim(c["id"], pc.DecideBody(), db=pg_session, current_admin=SimpleNamespace(id=uuid.uuid4(), username="Priya", role="Owner"))
    pg_session.refresh(det)
    assert det.tier == "PREFERRED" and out["plan_message"]
