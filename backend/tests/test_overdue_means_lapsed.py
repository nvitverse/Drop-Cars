"""The Admin dashboard's 'Overdue subscriptions' counted every partner who never paid anything. Overdue = a paid plan whose date passed."""
import uuid
from datetime import date, timedelta
from types import SimpleNamespace

from app.api.routes.fleet_subscriptions import get_fleet_subscriptions


def _owner(db, billing_next=None, paid=False):
    from app.models.vehicle_owner import VehicleOwnerCredentials
    from app.models.vehicle_owner_details import VehicleOwnerDetails
    from datetime import datetime, timezone
    o = VehicleOwnerCredentials(primary_number="9" + str(uuid.uuid4().int)[:9], hashed_password="x")
    db.add(o)
    db.flush()
    db.add(VehicleOwnerDetails(vehicle_owner_id=o.id, full_name="T " + o.primary_number[-4:], primary_number=o.primary_number, aadhar_number="A" + str(uuid.uuid4().int)[:11],
                               address="x", city="Salem", pincode="600001", wallet_balance=0, billing_next_date=billing_next,
                               registration_fee_paid_at=(datetime.now(timezone.utc) - timedelta(days=400)) if paid else None))
    db.flush()


def _summary(db):
    admin = SimpleNamespace(id=uuid.uuid4(), username="x", role="Owner")
    return get_fleet_subscriptions(status_filter="ALL", search=None, skip=0, limit=1, db=db, current_admin=admin)["summary"]


def test_never_paid_is_not_overdue_but_a_lapsed_plan_is(pg_session):
    before = _summary(pg_session)
    _owner(pg_session)                                                    # never paid anything
    mid = _summary(pg_session)
    assert mid["overdue_count"] == before["overdue_count"] and mid.get("unpaid_count", 0) == before.get("unpaid_count", 0) + 1
    _owner(pg_session, billing_next=date.today() - timedelta(days=3))     # a plan that ran out 3 days ago
    after = _summary(pg_session)
    assert after["overdue_count"] == before["overdue_count"] + 1
