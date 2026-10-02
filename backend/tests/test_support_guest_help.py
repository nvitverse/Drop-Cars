"""A driver/owner who is locked out (forgot password) asks Admin for help and keeps chatting with a help_token."""
import uuid

import pytest
from fastapi import HTTPException

from app.api.routes import support as sup
from app.models.support_message import SupportMessage


@pytest.fixture
def account(pg_session):
    from app.models.guest_help_token import GuestHelpToken
    GuestHelpToken.__table__.create(bind=pg_session.get_bind(), checkfirst=True)
    from app.models.vehicle_owner import VehicleOwnerCredentials
    num = "9" + str(uuid.uuid4().int)[:9]
    d = VehicleOwnerCredentials(primary_number=num, hashed_password="x")
    pg_session.add(d)
    pg_session.flush()
    return d


@pytest.fixture(autouse=True)
def _no_push(monkeypatch):
    monkeypatch.setattr(sup, "_notify_admins_of_support_message", lambda *a, **k: None)


def _request(db, d, token=None):
    return sup.public_request_admin_help(sup.PublicAdminHelpRequest(role="vehicle_owner", primary_number=d.primary_number, reason="Forgot password", help_token=token), db)


def test_help_request_returns_a_token_and_reuses_it(pg_session, account):
    r = _request(pg_session, account)
    assert r["help_token"] and r["role"] == "vehicle_owner" and r["primary_number"] == account.primary_number
    assert _request(pg_session, account, r["help_token"])["help_token"] == r["help_token"]      # same phone session keeps its token
    assert _request(pg_session, account, "not-a-real-token-xx")["help_token"] != "not-a-real-token-xx"


def test_guest_can_chat_and_sees_admin_reply_read(pg_session, account):
    tok = _request(pg_session, account)["help_token"]
    assert sup.guest_support_send(sup.GuestSendPayload(help_token=tok, text="please reset"), pg_session)["success"]
    pg_session.add(SupportMessage(thread_key=str(account.id), thread_role="OWNER", sender_side="ADMIN", sender_name="Admin", text="done"))
    pg_session.flush()
    assert sup.guest_support_unread(sup.GuestTokenPayload(help_token=tok), pg_session) == {"unread": 2}      # the auto reply + the admin message
    msgs = sup.guest_support_thread(sup.GuestThreadPayload(help_token=tok), pg_session)["messages"]
    assert [m["text"] for m in msgs][-2:] == ["please reset", "done"] and [m["mine"] for m in msgs][-2:] == [True, False]
    assert sup.guest_support_unread(sup.GuestTokenPayload(help_token=tok), pg_session) == {"unread": 0}


def test_bad_token_is_401(pg_session, account):
    for fn, body in ((sup.guest_support_thread, sup.GuestThreadPayload), (sup.guest_support_unread, sup.GuestTokenPayload)):
        with pytest.raises(HTTPException) as e:
            fn(body(help_token="x" * 20), pg_session)
        assert e.value.status_code == 401


def test_request_gets_an_auto_reply_no_email_and_repeat_taps_do_not_flood(pg_session, account, monkeypatch):
    from app.utils import emailer
    sent = []
    monkeypatch.setattr(emailer, "send_email", lambda *a, **k: sent.append(a))
    r1 = _request(pg_session, account)
    r2 = _request(pg_session, account, r1["help_token"])           # same person taps Submit again
    msgs = pg_session.query(SupportMessage).filter(SupportMessage.thread_key == str(account.id)).order_by(SupportMessage.id).all()
    assert [m.sender_side for m in msgs] == ["DRIVER_OWNER", "ADMIN"]       # one request + one automatic first reply
    assert "Reply here" in msgs[1].text or "reply here" in msgs[1].text
    assert msgs[1].sender_name == sup.AUTO_REPLY_SENDER and msgs[0].thread_role == "OWNER"
    assert r2["help_token"] == r1["help_token"] and "already" in r2["message"]
    assert sent == []                                              # SMTP daily limit: chat + push only
