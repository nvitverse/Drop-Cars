"""Unaccepted Bookings Desk: the alarm cadence, snooze, executed-elsewhere, and the cancel e-mail."""
import uuid
from datetime import datetime, timedelta, timezone
from types import SimpleNamespace

import pytest
from fastapi import HTTPException

from app.crud import unaccepted_desk as D

C = {"before_min": 120, "short_hours": 4, "short_pct": 50, "repeat_pct": 50, "min_gap": 10, "stop_min": 10, "max_alarms": 8, "follow_up_hours": 2,
     "snooze_options": [15, 30, 60]}
T0 = datetime(2026, 10, 12, 6, 0, tzinfo=timezone.utc)


def test_first_alarm_is_two_hours_before_for_an_advance_booking_and_half_way_for_a_short_notice_one():
    pickup = T0 + timedelta(days=2)
    assert D.first_alarm_at(T0, pickup, C) == pickup - timedelta(hours=2)
    assert D.first_alarm_at(T0, T0 + timedelta(hours=3), C) == T0 + timedelta(minutes=90)      # posted 3 h ahead -> rings half way
    assert D.first_alarm_at(T0, T0 + timedelta(hours=4), C) == T0 + timedelta(hours=2)          # exactly 4 h still counts as short notice


def test_next_alarm_comes_after_half_of_the_time_left_until_it_is_too_close():
    pickup = T0 + timedelta(hours=10)
    at = pickup - timedelta(hours=2)
    left = []
    while at is not None and len(left) < 12:
        left.append(int((pickup - at).total_seconds() // 60))
        at = D.next_alarm_after(at, pickup, C)
    assert left == [120, 60, 30, 15]               # the next one would land inside the last 10 minutes, so there is none


def test_minimum_gap_is_kept_and_the_last_minutes_are_quiet():
    pickup = T0 + timedelta(minutes=70)
    a = D.next_alarm_after(T0 + timedelta(minutes=20), pickup, C)                # 50 min left -> half = 25 min later
    assert a == T0 + timedelta(minutes=45)
    b = D.next_alarm_after(a, pickup, C)                                          # 25 min left -> 12.5 min later (>= the 10 min gap)
    assert b == T0 + timedelta(minutes=57.5)
    assert D.next_alarm_after(b, pickup, C) is None                               # 12.5 min left: the gap would push it inside the last 10 minutes


def _order(db, hours_to_pickup=30, advance=0):
    from app.models.orders import Order
    from app.models.orders import Trip_status
    o = db.query(Order).first()
    return o


def _fake_order(**kw):
    base = dict(id=991001, customer_name="Ravi", customer_number="9876543210", start_date_time=T0 + timedelta(hours=5), end_date_time=None, created_at=T0 - timedelta(hours=30),
                car_type=SimpleNamespace(value="SEDAN_4_PLUS_1"), trip_type=SimpleNamespace(value="Oneway"), source=SimpleNamespace(value="WEBSITE"), vendor_price=3200,
                estimated_price=2800, trip_distance=300, advance_received=500, pickup_drop_location={"0": "Chennai", "1": "Madurai"}, cost_per_km=12, extra_cost_per_km=2,
                driver_allowance=300, extra_driver_allowance=0, permit_charges=0, hill_charges=0, toll_charges=0, source_order_id=1)
    base.update(kw)
    return SimpleNamespace(**base)


def test_cancel_email_says_the_refund_position_in_both_cases_and_never_blames_the_customer():
    o = _fake_order()
    paid = D.cancel_email(o, "Ravi", 500, "a vehicle could not be arranged")
    assert "Rs 500" in paid["text"] and "7 working days" in paid["text"] and "refunded" in paid["text"].lower()
    assert "#991001" in paid["subject"] and "Chennai" in paid["text"] and "+91 7200217986" in paid["text"] and "https://dropcars.in" in paid["text"]
    free = D.cancel_email(o, "Ravi", 0, None)
    assert "Advance paid: Rs 0" in free["text"] and "no refund" not in free["text"].lower().replace("nothing to refund", "") or "nothing to refund" in free["text"]
    assert "Advance paid: Rs 0" in free["html"] and "<b>Drop Cars Team</b>" in free["html"]


def test_group_message_has_the_booking_and_the_driver_tariff_but_not_the_customer_number():
    msg = D.group_message(_fake_order(), db=None)
    assert "Booking #991001" in msg and "Chennai → Madurai" in msg and "12 per km" in msg and "Driver bata: ₹300" in msg and "9876543210" not in msg
    assert "Driver App" in msg


def test_commission_suggestion_follows_the_10_percent_minimum_200_rule():
    assert D.suggest_commission(1500) == 200 and D.suggest_commission(3200) == 320 and D.suggest_commission(None) == 200


def _db_order(db, hours_ahead=30, posted_hours_ago=1, advance=0):
    from app.models.orders import Order, OrderSourceEnum, Trip_status
    from app.models.new_orders import OrderTypeEnum, CarTypeEnum
    o = Order(source=OrderSourceEnum.NEW_ORDERS, source_order_id=0, trip_type=OrderTypeEnum.ONEWAY, car_type=CarTypeEnum.SEDAN_4_PLUS_1,
              pickup_drop_location={"0": "Chennai", "1": "Vellore"}, start_date_time=datetime.now(timezone.utc) + timedelta(hours=hours_ahead),
              customer_name="Kumar", customer_number="9000000001", trip_status=Trip_status.PENDING, estimated_price=2500, vendor_price=2800, advance_received=advance)
    db.add(o)
    db.flush()
    o.created_at = datetime.now(timezone.utc) - timedelta(hours=posted_hours_ago)
    db.flush()
    return o


def test_desk_lists_a_booking_nobody_accepted_and_the_alarm_cadence_runs_on_it(pg_session):
    db = pg_session
    o = _db_order(db, hours_ahead=30)
    rows = [r for r in D.desk(db)["cases"] if r["order_id"] == o.id]
    assert rows and rows[0]["status"] == "OPEN" and rows[0]["alarm_due"] is False        # 30 h ahead: first alarm is 2 h before pickup
    case = D.get_or_create_case(db, o)
    case.next_alarm_at = datetime.now(timezone.utc) - timedelta(minutes=1)               # pretend the time has come
    db.flush()
    assert D.is_due(case, datetime.now(timezone.utc), D.get_cfg(db)) is True
    D.seen(db, o.id, "Anitha")
    assert case.alarms_fired == 1 and case.next_alarm_at is not None and not D.is_due(case, datetime.now(timezone.utc), D.get_cfg(db))
    gap = (case.next_alarm_at - datetime.now(timezone.utc)).total_seconds() / 3600
    assert 14 < gap < 15.1                                                                # half of the ~30 h left


def test_snooze_pushes_the_alarm_out_and_refuses_a_snooze_past_pickup(pg_session):
    db = pg_session
    o = _db_order(db, hours_ahead=3, posted_hours_ago=1)
    case = D.get_or_create_case(db, o)
    case.next_alarm_at = datetime.now(timezone.utc) - timedelta(minutes=1)
    db.flush()
    D.snooze(db, o.id, 30, "Anitha")
    assert D.is_due(case, datetime.now(timezone.utc), D.get_cfg(db)) is False and case.snooze_count == 1
    with pytest.raises(HTTPException):
        D.snooze(db, o.id, 45, "Anitha")                                                  # not one of the allowed snooze times
    close = _db_order(db, hours_ahead=0.1)
    with pytest.raises(HTTPException):
        D.snooze(db, close.id, 15, "Anitha")                                              # pickup inside the quiet last minutes


def test_executed_elsewhere_records_who_where_commission_and_a_follow_up_after_the_trip(pg_session):
    db = pg_session
    o = _db_order(db, hours_ahead=5)
    case = D.executed_elsewhere(db, o.id, "Anitha", "Siva Fleet app", "Siva", "Murugan", "9876500000", "tn 01 ab 1234", "put it in their app", None)
    assert case.status == "EXECUTED_ELSEWHERE" and case.exec_vehicle_number == "TN 01 AB 1234" and case.commission_due == 280        # 10% of 2800
    assert case.follow_up_at is not None and case.follow_up_done is False
    with pytest.raises(HTTPException):
        D.executed_elsewhere(db, o.id, "Anitha", "", "", "", "", "", "", None)             # where it is being executed is required
    D.mark_commission(db, o.id, True, "Meena")
    D.close_follow_up(db, o.id, "trip done, driver paid", "Meena")
    assert case.commission_received is True and case.follow_up_done is True
    assert [h["action"] for h in case.history][-3:] == ["EXECUTED_ELSEWHERE", "COMMISSION_RECEIVED", "FOLLOW_UP_DONE"]


def test_share_marks_the_case_and_builds_the_group_message(pg_session):
    db = pg_session
    o = _db_order(db, hours_ahead=30)
    out = D.share(db, o.id, "Anitha")
    assert f"Booking #{o.id}" in out["message"] and out["whatsapp_url"].startswith("https://wa.me/?text=") and out["shared_count"] == 1
    assert D.get_or_create_case(db, o).status == "SHARED"
    row = [r for r in D.desk(db)["cases"] if r["order_id"] == o.id][0]
    assert row["status"] == "SHARED" and row["last_shared_by"] == "Anitha"


def test_cancel_marks_the_case_and_emails_the_customer_when_there_is_an_address(pg_session, monkeypatch):
    db = pg_session
    o = _db_order(db, hours_ahead=30, advance=500)
    sent = {}
    monkeypatch.setattr(D, "customer_target", lambda _db, _o: ("Kumar", "kumar@example.com", 500))
    monkeypatch.setattr("app.utils.emailer.smtp_configured", lambda _db: True)
    monkeypatch.setattr("app.utils.emailer.send_email", lambda _db, to, subject, body, html=None: sent.update(to=to, subject=subject, body=body, html=html))
    monkeypatch.setattr("app.utils.website_status_webhook.notify_website_of_status", lambda *a, **k: None)
    out = D.cancel(db, o.id, "no vehicle available at that hour", "Anitha")
    assert out["email"]["sent"] is True and sent["to"] == "kumar@example.com" and "Rs 500" in sent["body"] and "No vehicle available at that hour" in sent["body"]
    case = D.get_or_create_case(db, o)
    assert case.status == "CANCELLED" and case.customer_emailed is True and case.customer_email_to == "kumar@example.com"
    assert D.email_customer_cancelled(db, o, "x")["sent"] is True
    monkeypatch.setattr(D, "customer_target", lambda _db, _o: ("Kumar", None, 0))
    assert D.email_customer_cancelled(db, o, "x") == {"sent": False, "why": "no e-mail address for this customer"}
