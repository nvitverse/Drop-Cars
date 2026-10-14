"""Driver Help Center: forgiving matching, every language, personal wallet explanation (owner 2026-10-14)."""
import uuid

import pytest

from app.utils import help_center as hc


def _ask(db, msg, lang=None, caller=None, role=None):
    return hc.answer(db, role, caller, msg, lang)


def test_every_topic_has_every_language_and_a_title():
    for tid, t in hc.TOPICS.items():
        for lang in hc.LANGS:
            assert t["title"].get(lang) and t["a"].get(lang), (tid, lang)
    for tid in hc.MENU_ORDER:
        assert tid in hc.TOPICS


def test_plain_question_gets_the_right_topic(pg_session):
    r = _ask(pg_session, "why is money held when I accept a booking")
    assert r["confident"] and r["topic"] == "wallet_hold" and "₹" in r["reply"]
    assert _ask(pg_session, "how do I withdraw money")["topic"] == "withdraw"
    assert _ask(pg_session, "paid but not added to wallet")["topic"] == "paid_not_added"


def test_typing_mistakes_still_work_and_say_so(pg_session):
    r = _ask(pg_session, "walet holld")
    assert r["topic"] == "wallet_hold" and "fixed the spelling" in r["reply"]
    assert _ask(pg_session, "comision evlo")["topic"] == "commission"


def test_tanglish_and_native_script(pg_session):
    assert _ask(pg_session, "wallet la panam eduthutanga")["topic"] == "wallet_deduction"
    r = _ask(pg_session, "என் wallet-ல் இருந்து பணம் எடுத்தார்கள்")
    assert r["topic"] == "wallet_deduction" and r["language"] == "ta"
    assert _ask(pg_session, "मेरे wallet से पैसा क्यों कटा")["language"] == "hi"


def test_the_answer_comes_in_the_chosen_language(pg_session):
    ta = _ask(pg_session, "commission", "ta")
    assert ta["language"] == "ta" and "கமிஷன்" in ta["reply"] or "commission" in ta["reply"]
    assert any(ch in ta["reply"] for ch in "அஆஇஈ")
    assert any("ಀ" <= ch <= "೿" for ch in _ask(pg_session, "commission", "kn")["reply"])


def test_an_unsure_question_asks_did_you_mean_with_tappable_choices(pg_session):
    r = _ask(pg_session, "something about my thing")
    assert r["confident"] is False and r["suggestions"] and "Did you mean" in r["reply"]
    tapped = _ask(pg_session, r["suggestions"][0])                 # tapping a choice sends its title back and must answer it
    assert tapped["confident"] is True


def test_greeting_shows_the_menu(pg_session):
    r = _ask(pg_session, "hi")
    assert r["topic"] == "menu" and len(r["suggestions"]) >= 6


def test_wallet_deduction_explains_the_callers_own_entries(pg_session):
    from types import SimpleNamespace
    from app.crud.wallet import credit_wallet, debit_wallet_allow_negative
    from app.models.vehicle_owner import VehicleOwnerCredentials
    from app.models.vehicle_owner_details import VehicleOwnerDetails
    o = VehicleOwnerCredentials(primary_number="9" + str(uuid.uuid4().int)[:9], hashed_password="x")
    pg_session.add(o)
    pg_session.flush()
    pg_session.add(VehicleOwnerDetails(vehicle_owner_id=o.id, full_name="Ravi", primary_number=o.primary_number, aadhar_number="A" + str(uuid.uuid4().int)[:11],
                                       address="x", city="Salem", pincode="600001", wallet_balance=1000))
    pg_session.flush()
    debit_wallet_allow_negative(pg_session, str(o.id), 300, "555", "TRIP_CANCEL_PENALTY", "x")
    credit_wallet(pg_session, str(o.id), 870, "refund-1", "ADMIN_MANUAL_ADJUST", "refund")
    caller = SimpleNamespace(vehicle_owner_id=o.id)
    r = _ask(pg_session, "why was money deducted", "en", caller, "OWNER")
    assert "-₹300" in r["reply"] and "cancellation penalty for booking #555" in r["reply"]
    assert "+₹870" in r["reply"] and "adjustment made by Drop Cars staff" in r["reply"] and "Balance now" in r["reply"]
