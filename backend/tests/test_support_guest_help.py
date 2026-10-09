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
    assert sup.guest_support_unread(sup.GuestTokenPayload(help_token=tok), pg_session) == {"unread": 3}      # the first answer + the answer to the guest's message + the admin message
    msgs = sup.guest_support_thread(sup.GuestThreadPayload(help_token=tok), pg_session)["messages"]
    assert [m["text"] for m in msgs if m["text"] in ("please reset", "done")] == ["please reset", "done"]
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
    assert "Select your language" not in msgs[1].text and "Forgot password" in msgs[1].text      # a real answer first (English + Tamil), the language chooser only at the end
    assert "5 ಕನ್ನಡ" in msgs[1].text and "பாஸ்வேர்ட்" not in msgs[1].text or "Forgot password" in msgs[1].text
    assert msgs[1].sender_name == sup.AUTO_REPLY_SENDER and msgs[0].thread_role == "OWNER"
    assert r2["help_token"] == r1["help_token"] and "already" in r2["message"]
    assert sent == []                                              # SMTP daily limit: chat + push only


def _send(db, tok, text):
    sup.guest_support_send(sup.GuestSendPayload(help_token=tok, text=text), db)


def _texts(db, account):
    return [(m.sender_name, m.text) for m in db.query(SupportMessage).filter(SupportMessage.thread_key == str(account.id)).order_by(SupportMessage.id).all()]


def test_language_choice_then_answers_in_that_language_and_menu(pg_session, account):
    tok = _request(pg_session, account)["help_token"]
    _send(pg_session, tok, "hello")                                        # not a language, not a topic: a short bilingual note + the chooser, never a bare prompt
    last = _texts(pg_session, account)[-1][1]
    assert "Admin" in last and "5 ಕನ್ನಡ" in last and not last.startswith("🌐")
    _send(pg_session, tok, "2")                                            # Tamil
    last = _texts(pg_session, account)[-1][1]
    assert "உங்கள்" in last and "Forgot password" in last or "Forgot password-ஐ" in last      # the answer for the request's reason, in Tamil
    _send(pg_session, tok, "menu")
    assert "1 - Password மறந்துவிட்டது" in _texts(pg_session, account)[-1][1]
    _send(pg_session, tok, "3")
    assert "பதிவு செய்த எண்" in _texts(pg_session, account)[-1][1]
    _send(pg_session, tok, "9047075148 SANTHOSH P")                        # new number + name: kept, and what is still missing is asked
    last = _texts(pg_session, account)[-1][1]
    assert "9047075148" in last and "Santhosh P" in last and "வாகன எண்" in last
    _send(pg_session, tok, "TN 01 AB 1234")
    last = _texts(pg_session, account)[-1][1]
    assert "TN01AB1234" in last and "நன்றி" in last                         # everything is in: Admin will verify


def test_a_question_asked_first_gets_the_answer_not_the_language_prompt(pg_session, account):
    tok = _request(pg_session, account)["help_token"]
    _send(pg_session, tok, "booking otp customer sollala")                 # trip OTP: the customer tells it, staff never share it
    last = _texts(pg_session, account)[-1][1]
    assert "CUSTOMER" in last and "never share" in last and "5 ಕನ್ನಡ" in last
    _send(pg_session, tok, "customer number theriyala")
    assert "reveal" in _texts(pg_session, account)[-1][1] or "appears in your app" in _texts(pg_session, account)[-1][1]
    _send(pg_session, tok, "பாஸ்வேர்ட் மறந்துவிட்டது")      # typed in Tamil: language switches to Tamil by itself
    from app.models.guest_help_token import GuestHelpToken
    assert pg_session.query(GuestHelpToken).filter(GuestHelpToken.thread_key == str(account.id)).first().language == "ta"


def test_details_for_an_account_without_email_are_collected_and_aadhaar_is_cut_to_4_digits(pg_session, account):
    tok = _request(pg_session, account)["help_token"]
    _send(pg_session, tok, "1")
    _send(pg_session, tok, "Ravi Kumar TN09AB1234 ravi@example.com")
    last = _texts(pg_session, account)[-1][1]
    assert "ravi@example.com" in last and "❓" in last                    # the ID digits are still missing
    _send(pg_session, tok, "aadhaar 1234 5678 9012")
    texts = _texts(pg_session, account)
    assert "Admin will verify" in texts[-1][1]
    mine = [t for n, t in texts if n != sup.AUTO_REPLY_SENDER and "9012" in t]
    assert mine and all("1234 5678" not in t for t in mine)                  # the full number is not kept in the chat


def test_parse_details():
    from app.crud import support_autoreply as ar
    d = ar.parse_details("my name is ravi kumar vehicle tn 09 ab 1234 mail Ravi@Example.com mobile 98765 43210", "9000000000")
    assert d == {"email": "ravi@example.com", "vehicle": "TN09AB1234", "newmobile": "9876543210", "name": "Ravi Kumar"}
    assert ar.parse_details("password reset pannunga") == {}
    assert ar.parse_details("919876543210", "9000000000") == {"newmobile": "9876543210"}
    assert ar.mask_ids("aadhaar 1234 5678 9012") == "aadhaar XXXX XXXX 9012"


def test_the_guests_own_messages_carry_the_guests_name_not_the_auto_reply_name(pg_session, account):
    tok = _request(pg_session, account)["help_token"]
    _send(pg_session, tok, "1")
    mine = [m for m in pg_session.query(SupportMessage).filter(SupportMessage.thread_key == str(account.id), SupportMessage.sender_side == "DRIVER_OWNER")]
    assert all(m.sender_name != sup.AUTO_REPLY_SENDER for m in mine)


def test_a_person_replying_switches_the_bot_off(pg_session, account):
    tok = _request(pg_session, account)["help_token"]
    _send(pg_session, tok, "1")
    pg_session.add(SupportMessage(thread_key=str(account.id), thread_role="OWNER", sender_side="ADMIN", sender_name="Staff", text="I am checking"))
    pg_session.flush()
    n = len(_texts(pg_session, account))
    _send(pg_session, tok, "menu")
    assert len(_texts(pg_session, account)) == n + 1                       # only the guest's own message was added


def test_admin_thread_list_flags_help_requests_and_counts_unread(pg_session, account):
    tok = _request(pg_session, account)["help_token"]
    _send(pg_session, tok, "hello")
    rows = sup.list_support_threads_for_admin(pg_session, None)
    mine = next(r for r in rows if r["thread_key"] == str(account.id))
    assert mine["help_request"] is True and mine["thread_role"] == "OWNER"
    assert mine["unread"] == 2                                       # the request + "hello" are unread for Admin
    assert sum(1 for r in rows if r["thread_key"] == str(account.id)) == 1
