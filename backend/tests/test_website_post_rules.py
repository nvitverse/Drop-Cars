"""Auto-post rule for website bookings (owner, 2026-10-01).

T = how long before pickup the booking was made.
  T > 15h   posts at pickup - 15h, staff or not
  2 - 15h   staff on duty: waits until pickup - 2h.  Off duty: 5 min
  1 - 2h    staff on duty: 10 min.  Off duty: 1 min
  <= 1h     2 min (30 sec off duty)
'Staff on duty' = switch ON + app used in the last 5 min + shift under 12h.
"""
import asyncio
import uuid
from datetime import datetime, timedelta, timezone
from types import SimpleNamespace

import pytest

from app.crud import website_post_rules as pr

NOW = datetime(2026, 10, 1, 12, 0, tzinfo=timezone.utc)
RULES = {k: float(v) for k, v in pr.DEFAULTS.items()}


def _req(made_hours_before_pickup, created=NOW, urgent=False, hold=None, manual=False):
    return SimpleNamespace(
        created_at=created, start_date_time=created + timedelta(hours=made_hours_before_pickup),
        is_urgent=urgent, hold_until=hold, requires_manual_confirm=manual, status="PENDING",
    )


def _plan(req, staff_on, mode="AUTO"):
    return pr.compute_post_plan(req, now=NOW, staff_on=staff_on, rules=RULES, mode=mode, normal_seconds=900, urgent_seconds=120)


# ---------------------------------------------------------------- the rule
@pytest.mark.parametrize("staff_on", [True, False])
def test_advance_booking_posts_15h_before_pickup_with_or_without_staff(staff_on):
    r = _req(40)
    p = _plan(r, staff_on)
    assert p["tier"] == "ADVANCE"
    assert p["deadline"] == r.start_date_time - timedelta(hours=15)


def test_staff_on_duty_waits_until_two_hours_before_pickup():
    r = _req(10)
    p = _plan(r, True)
    assert p["tier"] == "STAFF_WAIT"
    assert p["deadline"] == r.start_date_time - timedelta(hours=2)


def test_off_duty_posts_after_five_minutes():
    p = _plan(_req(10), False)
    assert p["tier"] == "OFF_DUTY" and p["deadline"] == NOW + timedelta(minutes=5)


def test_one_to_two_hours():
    assert _plan(_req(1.5), True)["deadline"] == NOW + timedelta(minutes=10)
    assert _plan(_req(1.5), False)["deadline"] == NOW + timedelta(minutes=1)


def test_within_one_hour_and_urgent_use_the_short_window():
    assert _plan(_req(0.5), True)["deadline"] == NOW + timedelta(seconds=120)
    assert _plan(_req(0.5), False)["deadline"] == NOW + timedelta(seconds=30)
    assert _plan(_req(20, urgent=True), True)["tier"] == "URGENT"


def test_boundaries():
    assert _plan(_req(15.01), True)["tier"] == "ADVANCE"
    assert _plan(_req(15), True)["tier"] == "STAFF_WAIT"
    assert _plan(_req(2.01), True)["tier"] == "STAFF_WAIT"
    assert _plan(_req(2), True)["tier"] == "SHORT_NOTICE"
    assert _plan(_req(1.01), True)["tier"] == "SHORT_NOTICE"
    assert _plan(_req(1), True)["tier"] == "URGENT"


def test_manual_mode_and_enquiries_never_auto_post():
    assert _plan(_req(10), False, mode="MANUAL")["deadline"] is None
    assert _plan(_req(10, manual=True), False)["deadline"] is None


def test_old_auto_if_no_staff_mode_still_works():
    assert _plan(_req(10), True, mode="AUTO_IF_NO_STAFF")["deadline"] is None
    assert _plan(_req(10), False, mode="AUTO_IF_NO_STAFF")["deadline"] == NOW + timedelta(seconds=900)


def test_hold_pushes_the_deadline_out_but_a_short_one_changes_nothing():
    r = _req(10)
    # off duty would post at +5 min; a hold to +30 min postpones it
    held = _req(10, hold=NOW + timedelta(minutes=30))
    assert _plan(held, False)["deadline"] == NOW + timedelta(minutes=30)
    # a hold that ends before the deadline does not shorten the wait
    short = _req(10, hold=NOW + timedelta(minutes=1))
    assert _plan(short, False)["deadline"] == NOW + timedelta(minutes=5)
    assert _plan(r, True)["deadline"] == r.start_date_time - timedelta(hours=2)


def test_no_pickup_time_falls_back_to_the_plain_timer():
    r = _req(10)
    r.start_date_time = None
    assert _plan(r, True)["deadline"] == NOW + timedelta(seconds=900)


# ---------------------------------------------------------------- who is really on duty
def _admin(on=True, seen_min_ago=1, since_hours_ago=1):
    return SimpleNamespace(
        is_on_duty=on,
        last_seen_at=None if seen_min_ago is None else NOW - timedelta(minutes=seen_min_ago),
        on_duty_since=NOW - timedelta(hours=since_hours_ago),
    )


def test_effective_duty():
    f = lambda a: pr.is_admin_effectively_on_duty(a, NOW, RULES)
    assert f(_admin()) is True
    assert f(_admin(on=False)) is False
    assert f(_admin(seen_min_ago=6)) is False        # app closed - forgotten switch
    assert f(_admin(seen_min_ago=None)) is False     # never seen
    assert f(_admin(since_hours_ago=13)) is False    # shift too long


# ---------------------------------------------------------------- hold
def test_hold_is_capped_at_two_hours_before_pickup():
    r = _req(3)
    r.hold_until = None

    class _DB:
        def commit(self):
            pass

    until = pr.set_hold(_DB(), r, 120, rules=RULES, now=NOW)
    assert until == r.start_date_time - timedelta(hours=2)   # 1h from now, not 2h


def test_hold_refused_when_too_close_to_pickup():
    from fastapi import HTTPException
    r = _req(1.5)

    class _DB:
        def commit(self):
            pass

    with pytest.raises(HTTPException):
        pr.set_hold(_DB(), r, 30, rules=RULES, now=NOW)


def test_hold_limits():
    r = _req(40)

    class _DB:
        def commit(self):
            pass

    assert pr.set_hold(_DB(), r, 10_000, rules=RULES, now=NOW) == NOW + timedelta(minutes=pr.HOLD_MAX_MINUTES)


# ---------------------------------------------------------------- the sweep, end to end on Postgres
def _make_request(db, made_hours_before_pickup, created=None, urgent=False):
    from app.crud.customer import find_or_create_guest_customer
    from app.models.customer_booking_request import CustomerBookingRequest

    created = created or datetime.now(timezone.utc)
    phone = "9" + str(uuid.uuid4().int)[:9]
    creds, _ = find_or_create_guest_customer(db, phone, "Test")
    r = CustomerBookingRequest(
        customer_id=creds.id, pickup_drop_location={"0": "Chennai", "1": "Vellore"}, trip_type="Oneway",
        car_type="SEDAN_4_PLUS_1", start_date_time=created + timedelta(hours=made_hours_before_pickup),
        customer_name="Test", customer_number=phone,
        quoted_cost_per_km=15, quoted_driver_allowance=300, quoted_extra_driver_allowance=0, quoted_permit_charges=0,
        quoted_extra_permit_charges=0, quoted_hill_charges=0, quoted_toll_charges=0, quoted_extra_cost_per_km=0,
        quoted_night_charges=0, quoted_total_amount=3000, quoted_driver_amount=2800, quoted_trip_distance=200,
        quoted_trip_time="4 hours", status="PENDING", created_at=created, is_urgent=urgent,
    )
    db.add(r)
    db.flush()
    return r


def _admin_row(db, on, seen_min_ago):
    from app.models.admin import Admin
    a = Admin(username="t" + uuid.uuid4().hex[:8], password="x", role="Staff", phone="9000000000", email="t@t.t",
              is_on_duty=on, on_duty_since=datetime.now(timezone.utc) - timedelta(hours=1),
              last_seen_at=None if seen_min_ago is None else datetime.now(timezone.utc) - timedelta(minutes=seen_min_ago))
    db.add(a)
    db.flush()
    return a


@pytest.fixture
def sweep_env(pg_session, monkeypatch):
    """Records what the sweep would post; clears other admins' duty so the test controls it."""
    import app.crud.customer_booking_request as crb
    from app.models.admin import Admin
    from app.models.customer_booking_request import CustomerBookingRequest

    pg_session.query(Admin).update({Admin.is_on_duty: False}, synchronize_session=False)
    pg_session.query(CustomerBookingRequest).filter(CustomerBookingRequest.status == "PENDING").update(
        {CustomerBookingRequest.status: "REJECTED"}, synchronize_session=False)
    posted = []
    monkeypatch.setattr(crb, "approve_customer_booking_request", lambda db, req, decided_by: posted.append((req.id, decided_by)))
    monkeypatch.setattr(crb, "get_website_post_mode", lambda db: "AUTO")
    return SimpleNamespace(db=pg_session, posted=posted, crb=crb)


def test_sweep_off_duty_posts_a_normal_booking_after_five_minutes(sweep_env):
    now = datetime.now(timezone.utc)
    old = _make_request(sweep_env.db, 10, created=now - timedelta(minutes=6))
    fresh = _make_request(sweep_env.db, 10, created=now - timedelta(minutes=1))
    asyncio.run(sweep_env.crb.auto_approve_expired_booking_requests(sweep_env.db))
    ids = [p[0] for p in sweep_env.posted]
    assert old.id in ids and fresh.id not in ids
    assert all(p[1] == "AUTO_TIMEOUT" for p in sweep_env.posted)


def test_sweep_staff_present_waits_but_a_forgotten_switch_does_not(sweep_env):
    now = datetime.now(timezone.utc)
    r = _make_request(sweep_env.db, 10, created=now - timedelta(minutes=30))

    _admin_row(sweep_env.db, on=True, seen_min_ago=1)          # really there
    asyncio.run(sweep_env.crb.auto_approve_expired_booking_requests(sweep_env.db))
    assert r.id not in [p[0] for p in sweep_env.posted]

    from app.models.admin import Admin
    sweep_env.db.query(Admin).update({Admin.last_seen_at: now - timedelta(minutes=20)}, synchronize_session=False)
    sweep_env.db.flush()
    asyncio.run(sweep_env.crb.auto_approve_expired_booking_requests(sweep_env.db))   # switch is ON but the app was closed
    assert r.id in [p[0] for p in sweep_env.posted]


def test_sweep_advance_booking_waits_for_its_own_moment(sweep_env):
    now = datetime.now(timezone.utc)
    far = _make_request(sweep_env.db, 40, created=now - timedelta(hours=1))
    due = _make_request(sweep_env.db, 40, created=now - timedelta(hours=26))   # pickup is now 15h away
    asyncio.run(sweep_env.crb.auto_approve_expired_booking_requests(sweep_env.db))
    ids = [p[0] for p in sweep_env.posted]
    assert far.id not in ids and due.id in ids


def test_sweep_hold_postpones_and_enquiries_are_never_posted(sweep_env):
    now = datetime.now(timezone.utc)
    held = _make_request(sweep_env.db, 10, created=now - timedelta(minutes=30))
    held.hold_until = now + timedelta(minutes=20)
    lead = _make_request(sweep_env.db, 10, created=now - timedelta(minutes=30))
    lead.requires_manual_confirm = True
    sweep_env.db.flush()
    asyncio.run(sweep_env.crb.auto_approve_expired_booking_requests(sweep_env.db))
    ids = [p[0] for p in sweep_env.posted]
    assert held.id not in ids and lead.id not in ids


def test_owner_is_alerted_once_when_staff_sits_on_a_booking(sweep_env, monkeypatch):
    import app.utils.notification_dispatch as nd
    from app.models.admin import Admin
    from app.models.notification import Notification

    db = sweep_env.db
    now = datetime.now(timezone.utc)
    owner = Admin(username="o" + uuid.uuid4().hex[:8], password="x", role="Owner", phone="9000000001", email="o@o.o")
    db.add(owner)
    db.flush()
    db.add(Notification(user="admin", sub=str(owner.id), token="ExponentPushToken[owner-test]"))
    _admin_row(db, on=True, seen_min_ago=1)
    r = _make_request(db, 10, created=now - timedelta(minutes=12))
    db.flush()
    sent = []
    monkeypatch.setattr(nd, "_send_expo", lambda tokens, title, body, *a, **k: sent.append((tokens, title)) or {"status": "sent"})

    asyncio.run(sweep_env.crb.auto_approve_expired_booking_requests(db))
    asyncio.run(sweep_env.crb.auto_approve_expired_booking_requests(db))
    assert len(sent) == 1 and sent[0][0] == ["ExponentPushToken[owner-test]"]
    assert r.escalated_at is not None
    assert r.id not in [p[0] for p in sweep_env.posted]


def test_bulk_approve_posts_only_the_selected_and_reports_failures(pg_session, monkeypatch):
    import app.crud.customer_booking_request as crb
    from app.crud.website_booking_approvals import bulk_approve_website_bookings

    a = _make_request(pg_session, 10)
    b = _make_request(pg_session, 10)
    c = _make_request(pg_session, 10)
    c.status = "REJECTED"
    pg_session.flush()
    monkeypatch.setattr(crb, "approve_customer_booking_request", lambda db, req, decided_by: SimpleNamespace(id=777))
    res = bulk_approve_website_bookings(pg_session, [a.id, c.id, uuid.uuid4()], decided_by="kumar")
    assert [x["id"] for x in res["approved"]] == [str(a.id)]
    assert len(res["failed"]) == 2
    assert b.status == "PENDING"   # not selected -> untouched
