"""The vendor app's DropBot must speak to a VENDOR (who posts bookings), not show the driver's wallet hold, penalty or hard-coded rate card."""
import asyncio
import uuid
from types import SimpleNamespace

from app.api.routes import ai_whatsapp_assistant as bot


def _ask(db, text, audience="vendor", language="en"):
    return asyncio.run(bot._rule_based_assistant({"message": text, "language": language, "audience": audience}, db))


def test_vendor_never_sees_the_driver_only_rules_or_the_rate_card(pg_session):
    for q in ("how does the 500 security hold work", "what is the cancellation penalty", "tariff rates please", "fare per km", "documents licence renewal"):
        r = _ask(pg_session, q)
        text = r["reply"]
        assert "/km" not in text and "₹500" not in text and "Rs 500" not in text and "penalty of" not in text.lower(), (q, text)
    assert "no hold" in _ask(pg_session, "wallet hold").get("reply", "").lower() or "NO hold" in _ask(pg_session, "wallet hold")["reply"]
    assert "Post Booking" in _ask(pg_session, "tariff")["reply"]


def test_vendor_gets_a_tamil_answer_when_asked_in_tamil(pg_session):
    r = _ask(pg_session, "எனக்கு tariff சொல்லுங்கள்", language="ta")
    assert "Post Booking" in r["reply"] and "tariff" in r["reply"]


def test_a_driver_still_gets_the_driver_answer(pg_session):
    r = _ask(pg_session, "wallet hold", audience="driver")
    assert "hold" in r["reply"].lower() and "no hold" not in r["reply"].lower()


def test_the_llm_prompt_for_a_vendor_has_vendor_rules_and_no_driver_hold(pg_session, monkeypatch):
    from app.utils import ai_llm
    seen = {}
    monkeypatch.setattr(ai_llm, "provider", lambda: "gemini")
    monkeypatch.setattr(ai_llm, "_within_limits", lambda db, k: True)
    monkeypatch.setattr(ai_llm, "identify", lambda request, db: ("VENDOR", SimpleNamespace(id=uuid.uuid4())))
    monkeypatch.setattr(ai_llm, "_call_gemini", lambda system, turns: seen.setdefault("system", system) and '{"reply": "ok", "needs_human": false, "suggestions": []}')
    monkeypatch.setattr(ai_llm, "_log_ai_call", lambda *a, **k: None)
    out = ai_llm.answer(pg_session, SimpleNamespace(client=None), "how is my share worked out?")
    assert out and out["reply"] == "ok"
    sys_prompt = seen["system"]
    assert "VENDOR app" in sys_prompt and "NO hold" in sys_prompt and "Role: VENDOR" in sys_prompt
    assert "hold of at least" not in sys_prompt                    # the driver wallet-hold rule is not in a vendor's prompt
