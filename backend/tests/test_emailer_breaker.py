"""When Gmail keeps refusing us (daily limit / blocked sender / dead app password) the app must (1) fall back to the backup mail server,
(2) stop hammering a server that refuses and stop holding requests ~40 s, (3) say in plain words what is wrong."""
import asyncio

import pytest

from app.utils import emailer

PRIMARY = {"smtp_host": "smtp.gmail.com", "smtp_port": "587", "smtp_user": "support@dropcars.in", "smtp_app_password": "x", "smtp_from": "support@dropcars.in"}
BACKUP = {"smtp_host": "smtp.example.com", "smtp_port": "587", "smtp_user": "noreply@dropcars.in", "smtp_app_password": "y", "smtp_from": "noreply@dropcars.in"}
REFUSED = "SMTP send failed on 587 (Connection unexpectedly closed) and 465 (Connection unexpectedly closed) [step: login]"


@pytest.fixture(autouse=True)
def _clean():
    for b in emailer._BREAKERS.values():
        b.update(fails=0, until=0.0)
    emailer._STATUS["primary"].clear()
    emailer._STATUS["backup"].clear()
    yield
    for b in emailer._BREAKERS.values():
        b.update(fails=0, until=0.0)


def _use(monkeypatch, providers, sender):
    monkeypatch.setattr(emailer, "_providers", lambda db: providers)
    monkeypatch.setattr(emailer, "_send_email_once", sender)


def test_a_dead_primary_falls_back_to_the_backup_at_once(monkeypatch):
    used = []

    def sender(db, to, subject, body, html, s):
        used.append(s["smtp_user"])
        if s is PRIMARY:
            raise RuntimeError(REFUSED)

    _use(monkeypatch, [("primary", PRIMARY), ("backup", BACKUP)], sender)
    emailer.send_email(None, "a@b.c", "s", "b")                 # no error reaches the caller: the signup OTP is delivered
    assert used == ["support@dropcars.in", "noreply@dropcars.in"]
    assert emailer._STATUS["primary"]["diagnosis"] and emailer._STATUS["backup"].get("last_ok")


def test_after_three_failures_the_primary_is_skipped_without_connecting(monkeypatch):
    used = []

    def sender(db, to, subject, body, html, s):
        used.append(s["smtp_user"])
        if s is PRIMARY:
            raise RuntimeError(REFUSED)

    _use(monkeypatch, [("primary", PRIMARY), ("backup", BACKUP)], sender)
    for _ in range(3):
        emailer.send_email(None, "a@b.c", "s", "b")
    used.clear()
    emailer.send_email(None, "a@b.c", "s", "b")
    assert used == ["noreply@dropcars.in"]                       # Gmail is left alone for 10 minutes; nobody waits 40 s


def test_with_no_backup_three_failures_open_the_breaker_and_it_fails_fast(monkeypatch):
    calls = []

    def sender(db, to, subject, body, html, s):
        calls.append(1)
        raise RuntimeError(REFUSED)

    _use(monkeypatch, [("primary", PRIMARY)], sender)
    for _ in range(3):
        with pytest.raises(RuntimeError) as e:
            emailer.send_email(None, "a@b.c", "s", "b")
        assert not isinstance(e.value, emailer.EmailUnavailable)
    with pytest.raises(emailer.EmailUnavailable):
        emailer.send_email(None, "a@b.c", "s", "b")
    assert len(calls) == 3


def test_one_success_clears_the_breaker_and_a_new_password_is_tried_at_once(monkeypatch):
    sent = []
    _use(monkeypatch, [("primary", PRIMARY)], lambda db, to, subject, body, html, s: sent.append(to))
    emailer._BREAKERS["primary"].update(fails=2, until=0.0)
    emailer.send_email(None, "ok@b.c", "s", "b")
    assert sent == ["ok@b.c"] and emailer._BREAKERS["primary"]["fails"] == 0
    emailer._BREAKERS["primary"].update(until=1e12)
    with pytest.raises(emailer.EmailUnavailable):
        emailer.send_email(None, "x@b.c", "s", "b")
    emailer._BREAKERS["primary"].update(fails=0, until=0.0)       # what saving new settings in the Admin App does
    emailer.send_email(None, "y@b.c", "s", "b")
    assert sent == ["ok@b.c", "y@b.c"]


def test_the_cause_is_said_in_plain_words():
    assert "NEW app password" in emailer.diagnose(REFUSED)
    assert "daily sending limit" in emailer.diagnose("550 5.4.5 Daily user sending limit exceeded")
    assert "refused the user name" in emailer.diagnose("(535, b'5.7.8 Username and Password not accepted')")
    assert "could not be reached" in emailer.diagnose("timed out")
    assert "Email settings" in emailer.diagnose("something odd")


def test_the_health_check_logs_in_without_sending_and_tells_the_admin_once(pg_session, monkeypatch):
    sent_push = []

    async def fake_push(db, title, message):
        sent_push.append((title, message))

    monkeypatch.setattr("app.crud.notification.send_push_notification_to_admin", fake_push)
    monkeypatch.setattr(emailer, "_providers", lambda db: [("primary", PRIMARY), ("backup", BACKUP)])
    monkeypatch.setattr(emailer, "probe_login", lambda s, timeout=15: (False, REFUSED) if s is PRIMARY else (True, ""))
    from app.models.platform_setting import PlatformSetting
    pg_session.query(PlatformSetting).filter(PlatformSetting.key.in_(["email_health", "email_health_alerted_at"])).delete(synchronize_session=False)
    state = asyncio.run(emailer.run_email_health_check(pg_session))
    assert state["providers"]["primary"]["ok"] is False and state["providers"]["backup"]["ok"] is True and state["all_down"] is False
    assert len(sent_push) == 1 and "backup is working" in sent_push[0][0] and "NEW app password" in sent_push[0][1]
    asyncio.run(emailer.run_email_health_check(pg_session))      # still down: not told again within 6 hours
    assert len(sent_push) == 1
    monkeypatch.setattr(emailer, "probe_login", lambda s, timeout=15: (False, REFUSED))
    pg_session.query(PlatformSetting).filter(PlatformSetting.key == "email_health_alerted_at").delete(synchronize_session=False)
    s2 = asyncio.run(emailer.run_email_health_check(pg_session))
    assert s2["all_down"] is True and "DOWN" in sent_push[-1][0]


def test_a_backup_server_alone_counts_as_configured(pg_session, monkeypatch):
    monkeypatch.setattr(emailer, "get_smtp_settings", lambda db: {**PRIMARY, "smtp_app_password": ""})
    monkeypatch.setattr(emailer, "get_backup_smtp_settings", lambda db: BACKUP)
    assert emailer.smtp_configured(pg_session) is True
    monkeypatch.setattr(emailer, "get_backup_smtp_settings", lambda db: {**BACKUP, "smtp_app_password": ""})
    assert emailer.smtp_configured(pg_session) is False


def test_the_email_otp_has_an_hourly_budget_so_the_shared_mail_quota_cannot_be_burnt(pg_session, monkeypatch):
    import uuid
    from fastapi import HTTPException
    from sqlalchemy import text
    from app.api.routes import vehicle_owner as vo
    monkeypatch.setattr(vo, "EMAIL_OTP_MAX_PER_HOUR", 2)
    monkeypatch.setattr("app.utils.emailer.smtp_configured", lambda db: True)
    monkeypatch.setattr("app.utils.emailer.send_email", lambda *a, **k: None)
    pg_session.execute(text("DELETE FROM email_otps"))
    for i in range(2):
        pg_session.execute(text("INSERT INTO email_otps (id, role, primary_number, email, code, purpose, attempts, expires_at, created_at) "
                                "VALUES (gen_random_uuid(), 'vehicle_owner', '', :e, '123456', 'signup_verify', 0, NOW() + interval '10 minutes', NOW() - interval '5 minutes')"),
                           {"e": f"old{i}-{uuid.uuid4().hex[:6]}@example.com"})
    with pytest.raises(HTTPException) as e:
        vo.send_email_otp(email=f"new-{uuid.uuid4().hex[:6]}@example.com", db=pg_session)
    assert e.value.status_code == 429 and "Too many verification emails" in e.value.detail
