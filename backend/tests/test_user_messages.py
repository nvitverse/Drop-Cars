import pytest
from app.utils.user_messages import (
    USER_MESSAGES_CATALOG,
    get_user_message,
    raise_user_error,
)
from fastapi import HTTPException


def test_user_messages_catalog_completeness():
    """Verify all messages exist across all 5 languages."""
    languages = ["en", "ta", "te", "kn", "hi"]
    for code, translations in USER_MESSAGES_CATALOG.items():
        assert isinstance(code, str) and code.startswith("DC_")
        for lang in languages:
            assert lang in translations, f"Missing {lang} for code {code}"
            assert len(translations[lang]) > 0


def test_get_user_message():
    msg_en = get_user_message("DC_BOOKING_ALREADY_TAKEN", "en")
    assert "already been accepted" in msg_en

    msg_ta = get_user_message("DC_BOOKING_ALREADY_TAKEN", "ta")
    assert "Booking-ஐ" in msg_ta

    # Fallback to English for unknown language
    msg_fr = get_user_message("DC_BOOKING_ALREADY_TAKEN", "fr")
    assert "already been accepted" in msg_fr

    # Fallback to code for unknown code
    msg_unk = get_user_message("DC_UNKNOWN_CODE_XYZ", "ta")
    assert msg_unk == "DC_UNKNOWN_CODE_XYZ"


def test_raise_user_error():
    with pytest.raises(HTTPException) as excinfo:
        raise_user_error(400, "DC_INVALID_OTP")

    assert excinfo.value.status_code == 400
    assert excinfo.value.detail["code"] == "DC_INVALID_OTP"
    assert "Invalid OTP" in excinfo.value.detail["message"]
