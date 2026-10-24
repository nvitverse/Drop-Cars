"""Owner request 2026-10-25: enquiry / unaccepted-booking alerts must not be missed. (1) an alarm that was pushed and not acknowledged is pushed again
and then the Owner is told; (2) the Owner can see which staff phones cannot be reached and why."""
import asyncio
import uuid
from datetime import datetime, timedelta, timezone

import pytest
from fastapi import HTTPException

from app.crud import unaccepted_desk as D
from tests.test_unaccepted_desk import _db_order


def _push_recorder(monkeypatch):
    sent = []

    async def fake(db, title, message, only_admin_ids=None):
        sent.append({"title": title, "only": only_admin_ids})
        return {"status": "ok"}

    monkeypatch.setattr("app.crud.notification.send_push_notification_to_admin", fake)
    return sent


def _due_case(db, hours_ahead=2):
    o = _db_order(db, hours_ahead=hours_ahead)
    case = D.get_or_create_case(db, o)
    case.status = "OPEN"
    case.next_alarm_at = datetime.now(timezone.utc) - timedelta(minutes=1)
    case.alarms_fired = 0
    case.notified_alarm_no = 0
    case.last_push_at = None
    case.escalation_count = 0
    db.flush()
    return o, case


def test_an_unacknowledged_alarm_is_pushed_again_and_the_owner_is_told_from_the_second_reminder(pg_session, monkeypatch):
    db = pg_session
    sent = _push_recorder(monkeypatch)
    monkeypatch.setattr(D, "open_orders", lambda db_, now, *a, **k: [o])
    o, case = _due_case(db)

    asyncio.run(D.push_due_alarms(db))                                  # first push
    assert len(sent) == 1 and "nobody has accepted" in sent[0]["title"] and case.notified_alarm_no == 1

    asyncio.run(D.push_due_alarms(db))                                  # too soon: nothing new
    assert len(sent) == 1

    case.last_push_at = datetime.now(timezone.utc) - timedelta(minutes=D.ESCALATE_AFTER_MINUTES + 1)
    db.flush()
    asyncio.run(D.push_due_alarms(db))                                  # still unseen -> reminder 1 (everybody)
    assert len(sent) == 2 and sent[1]["title"].startswith("STILL UNSEEN") and sent[1]["only"] is None and case.escalation_count == 1

    case.last_push_at = datetime.now(timezone.utc) - timedelta(minutes=D.ESCALATE_AFTER_MINUTES + 1)
    db.flush()
    asyncio.run(D.push_due_alarms(db))                                  # reminder 2 -> the owner / managers by name + everybody
    titles = [s["title"] for s in sent[2:]]
    assert any(t.startswith("NOBODY has picked up") for t in titles) and any(t.startswith("STILL UNSEEN") for t in titles)
    assert case.escalation_count == 2


def test_the_reminders_stop_after_the_maximum_and_when_somebody_acknowledges(pg_session, monkeypatch):
    db = pg_session
    sent = _push_recorder(monkeypatch)
    o, case = _due_case(db)
    monkeypatch.setattr(D, "open_orders", lambda db_, now, *a, **k: [o])
    asyncio.run(D.push_due_alarms(db))
    for _ in range(6):
        case.last_push_at = datetime.now(timezone.utc) - timedelta(minutes=D.ESCALATE_AFTER_MINUTES + 1)
        db.flush()
        asyncio.run(D.push_due_alarms(db))
    assert case.escalation_count == D.MAX_ESCALATIONS                  # never an endless nag
    before = len(sent)
    D.seen(db, o.id, "Anitha")                                           # somebody took it: the alarm moves on, no more pushes for it
    case.last_push_at = datetime.now(timezone.utc) - timedelta(minutes=60)
    db.flush()
    asyncio.run(D.push_due_alarms(db))
    assert len(sent) == before


def _admin(db, role="Owner", name=None):
    from app.models.admin import Admin
    a = Admin(username=name or f"{role.lower()}-{uuid.uuid4().hex[:6]}", password="x", role=role, phone="9" + str(uuid.uuid4().int)[:9], email="a@b.c")
    db.add(a)
    db.flush()
    return a


def test_the_owner_sees_who_cannot_be_reached_and_why(pg_session):
    from app.api.routes import staff_alert_health as H
    from app.models.notification import Notification
    db = pg_session
    owner = _admin(db, "Owner")
    ok_staff, never_opened, no_token = _admin(db, "Staff", "ok-staff"), _admin(db, "Staff", "never-opened"), _admin(db, "Staff", "no-token")
    db.add(Notification(user="admin", sub=str(ok_staff.id), token="ExponentPushToken[ok]"))
    db.add(Notification(user="admin", sub=str(never_opened.id), token="ExponentPushToken[never]"))
    db.add(Notification(user="admin", sub=str(no_token.id), token=None))
    db.flush()
    H.report_alert_health(H.AlertHealthIn(notifications=True, overlay=False, battery=True, native_available=True, app_version="1.2.0"), db=db, current_admin=ok_staff)
    H.report_alert_health(H.AlertHealthIn(notifications=False, native_available=False), db=db, current_admin=no_token)

    out = H.staff_alert_health(db=db, current_admin=owner)
    by = {s["name"]: s for s in out["staff"]}
    assert by["ok-staff"]["reachable"] is True                                         # overlay off is a warning, not unreachable
    assert any("Display over other apps" in p for p in by["ok-staff"]["problems"])
    assert by["never-opened"]["reachable"] is False and any("never reported" in p for p in by["never-opened"]["problems"])
    assert by["no-token"]["reachable"] is False
    assert any("No push token" in p for p in by["no-token"]["problems"]) and any("permission is OFF" in p for p in by["no-token"]["problems"])
    assert out["unreachable"] >= 2


def test_a_phone_that_stopped_reporting_is_unreachable_and_ordinary_staff_cannot_read_the_list(pg_session):
    from app.api.routes import staff_alert_health as H
    from app.models.notification import Notification
    from app.models.staff_device_health import StaffDeviceHealth
    db = pg_session
    owner, staff = _admin(db, "Owner"), _admin(db, "Staff")
    db.add(Notification(user="admin", sub=str(staff.id), token="ExponentPushToken[x]"))
    H.report_alert_health(H.AlertHealthIn(notifications=True, native_available=True), db=db, current_admin=staff)
    db.query(StaffDeviceHealth).filter(StaffDeviceHealth.admin_id == staff.id).update({"reported_at": datetime.now(timezone.utc) - timedelta(hours=40)})
    db.flush()
    me = [s for s in H.staff_alert_health(db=db, current_admin=owner)["staff"] if s["admin_id"] == str(staff.id)][0]
    assert me["reachable"] is False and any("Not opened for" in p for p in me["problems"])
    with pytest.raises(HTTPException) as e:
        H.staff_alert_health(db=db, current_admin=staff)
    assert e.value.status_code == 403
