"""Tests for Round 3 LLM intelligence endpoints and utilities (Prompt 3).
Verifies safe draft replies, thread summaries, daily digest, and feedback themes grouping with offline fallbacks.
"""
from datetime import datetime, timezone
import uuid
import pytest
from app.utils.ai_llm import (
    _detect_lang,
    _rule_based_draft_replies,
    _rule_based_summary,
    generate_daily_digest,
    extract_feedback_themes,
    draft_replies,
    summarize_thread,
)
from app.core.security import create_access_token
from app.models.admin import Admin


def _admin(db, role="Owner"):
    a = Admin(username=f"{role.lower()}-{uuid.uuid4().hex[:6]}", password="x", role=role, phone="9000000000", email="a@a.a")
    db.add(a)
    db.flush()
    return a


def _auth(kind, account):
    return {"Authorization": "Bearer " + create_access_token({"sub": str(account.id), "user": kind, "token_version": getattr(account, "token_version", 1) or 1})}


def test_language_detection():
    # Tamil Unicode
    assert _detect_lang("வணக்கம் எனக்கு உதவி வேண்டும்") == "ta"
    # Tanglish keywords
    assert _detect_lang("Vanakkam anna, eppadi panrathu nu theriyala") == "tanglish"
    # Plain English
    assert _detect_lang("Hello, I need help with my document verification") == "en"


def test_rule_based_draft_replies_documents():
    # Tamil document query
    ta_drafts = _rule_based_draft_replies(
        [{"sender": "DRIVER_OWNER", "text": "என் RC ஆவணம் ரிஜக்ட் ஆயிடுச்சு"}],
        {"role": "OWNER", "document_notes": "Date mismatch"},
    )
    assert len(ta_drafts) == 3
    assert any("ஆவணத்தின்" in d or "பதிவேற்றவும்" in d for d in ta_drafts)

    # Tanglish document query
    tang_drafts = _rule_based_draft_replies(
        [{"sender": "DRIVER_OWNER", "text": "RC doc invalid nu varuthu"}],
        {"role": "DRIVER"},
    )
    assert len(tang_drafts) == 3
    assert any("upload" in d.lower() or "document" in d.lower() for d in tang_drafts)

    # English query
    en_drafts = _rule_based_draft_replies(
        [{"sender": "DRIVER_OWNER", "text": "My insurance was marked invalid"}],
        {"role": "OWNER"},
    )
    assert len(en_drafts) == 3
    assert any("clear photo" in d or "document" in d for d in en_drafts)


def test_rule_based_summary_and_tagging():
    # Urgent document problem
    messages = [
        {"sender": "DRIVER_OWNER", "text": "Urgent! My licence expired and I have a trip waiting"},
    ]
    summary = _rule_based_summary(messages)
    assert summary["topic"] == "DOCUMENTS"
    assert summary["urgency"] == "URGENT"

    # Trip booking question
    messages_trip = [
        {"sender": "DRIVER_OWNER", "text": "What is the fare for outstation booking #1234?"},
    ]
    summary_trip = _rule_based_summary(messages_trip)
    assert summary_trip["topic"] == "TRIPS_BOOKINGS"
    assert summary_trip["urgency"] == "NORMAL"


def test_generate_daily_digest_fallback(pg_session):
    numbers = {
        "bookings_posted": 15,
        "bookings_closed": 10,
        "bookings_unassigned": 2,
        "chats_waiting": 4,
        "documents_pending": 3,
        "low_rated_count": 1,
        "unpaid_invoices": 0,
    }
    digest = generate_daily_digest(pg_session, numbers)
    assert "headline" in digest
    assert "15" in digest["headline"]
    assert "10" in digest["headline"]
    assert digest["numbers"] == numbers


def test_extract_feedback_themes():
    items = [
        {"order_id": 101, "rating": 5, "comment": "Very clean car and good ac"},
        {"order_id": 102, "rating": 5, "comment": "Car was spotless and neat"},
        {"order_id": 103, "rating": 4, "comment": "Driver was very polite and helpful"},
        {"order_id": 104, "rating": 2, "comment": "Driver came very late, delay of 45 minutes"},
        {"order_id": 105, "rating": 5, "comment": "Super smooth driving and safe trip"},
        {"order_id": 106, "rating": 3, "comment": "Extra toll amount was charged"},
    ]
    themes = extract_feedback_themes(None, items)
    assert len(themes) >= 4
    theme_names = [t["theme"] for t in themes]
    assert "Cleanliness & Hygiene" in theme_names
    assert "Driver Behaviour" in theme_names
    assert "Punctuality & Timing" in theme_names
    assert "Driving Safety" in theme_names

    # Check cleanliness has count 2
    clean_theme = next(t for t in themes if t["theme"] == "Cleanliness & Hygiene")
    assert clean_theme["count"] == 2


def test_daily_digest_endpoint(pg_session, client_with_db):
    admin = _admin(pg_session, role="Owner")
    res = client_with_db.get("/api/admin/dashboard/digest", headers=_auth("admin", admin))
    assert res.status_code == 200
    data = res.json()
    assert "headline" in data
    assert "numbers" in data
    assert "bookings_posted" in data["numbers"]


def test_quality_themes_endpoint(pg_session, client_with_db):
    admin = _admin(pg_session, role="Owner")
    res = client_with_db.get("/api/admin/quality/themes?days=30", headers=_auth("admin", admin))
    assert res.status_code == 200
    data = res.json()
    assert "themes" in data
    assert isinstance(data["themes"], list)
