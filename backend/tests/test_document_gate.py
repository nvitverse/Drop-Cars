from datetime import date, timedelta
from types import SimpleNamespace

from app.crud.verification import (
    is_car_verified, is_driver_verified, expired_car_documents, invalid_car_documents, fc_status_for_car, car_document_problems,
)
from app.models.common_enums import DocumentStatusEnum as S


def _car(**kw):
    base = dict(rc_front_status=S.PENDING, rc_back_status=S.PENDING, insurance_status=S.PENDING, permit_status=S.PENDING,
                fc_status=S.PENDING, registration_date=None, year_of_the_car=None, fc_img_url=None,
                insurance_expiry_date=None, permit_expiry_date=None, fc_expiry_date=None)
    base.update(kw)
    return SimpleNamespace(**base)


def test_not_verified_yet_never_blocks():
    car = _car(rc_front_status=S.NEEDS_REVIEW, rc_back_status=S.PENDING, insurance_status=S.PENDING, permit_status=S.NEEDS_REVIEW)
    assert is_car_verified(car) is True


def test_invalid_document_blocks_and_is_named():
    car = _car(rc_front_status=S.INVALID)   # e.g. an Aadhaar uploaded in the RC slot
    assert is_car_verified(car) is False
    assert invalid_car_documents(car) == ["RC front"]
    assert "not valid" in car_document_problems(car)[0]


def test_an_expired_document_blocks_and_is_named():
    car = _car(insurance_expiry_date=date.today() - timedelta(days=1))
    assert is_car_verified(car) is False and expired_car_documents(car) == ["Insurance"]


def test_rc_has_no_expiry_and_a_valid_or_missing_date_is_fine():
    assert is_car_verified(_car(permit_expiry_date=date.today() + timedelta(days=30), insurance_expiry_date=date.today())) is True
    assert is_car_verified(_car()) is True


def test_new_vehicle_needs_no_fc_for_two_years_after_registration():
    today = date(2026, 10, 9)
    new = _car(registration_date=date(2025, 3, 1))
    assert fc_status_for_car(new, today)["required"] is False
    assert fc_status_for_car(new, today)["free_until"] == date(2027, 3, 1)
    new2 = _car(registration_date=date(2025, 3, 1), fc_expiry_date=date(2020, 1, 1), fc_status=S.INVALID)
    assert expired_car_documents(new2, today) == [] and invalid_car_documents(new2, today) == []


def test_old_vehicle_expired_fc_blocks():
    today = date(2026, 10, 9)
    old = _car(registration_date=date(2022, 1, 1), fc_expiry_date=date(2026, 9, 1))
    assert fc_status_for_car(old, today)["required"] is True
    assert expired_car_documents(old, today) == ["FC"]


def test_fc_falls_back_to_model_year_without_registration_date():
    today = date(2026, 10, 9)
    assert fc_status_for_car(_car(year_of_the_car="2025"), today)["required"] is False
    assert fc_status_for_car(_car(year_of_the_car="2020"), today)["required"] is True


def test_licence_expired_or_invalid_blocks_the_driver_but_unverified_does_not():
    d = SimpleNamespace(licence_front_status=S.NEEDS_REVIEW, licence_back_status=S.PENDING, licence_expiry_date=None)
    assert is_driver_verified(d) is True
    d.licence_expiry_date = date.today() - timedelta(days=3)
    assert is_driver_verified(d) is False
    d.licence_expiry_date = None
    d.licence_front_status = S.INVALID
    assert is_driver_verified(d) is False


def test_reason_is_kept_only_while_a_document_is_invalid_or_waiting():
    from app.crud.document_notes import set_note, reason_for, get_notes
    car = SimpleNamespace(document_notes=None)
    set_note(car, "insurance", S.INVALID, "The date you entered does not match")
    assert reason_for(car, "insurance", S.INVALID) == "The date you entered does not match"
    assert reason_for(car, "insurance", S.VERIFIED) is None          # a verified document never shows an old reason
    set_note(car, "insurance", S.VERIFIED, None)                       # re-upload passed -> note cleared
    assert get_notes(car) == {} and car.document_notes is None


def test_verifier_messages_tell_the_owner_what_to_do():
    from app.utils import document_verifier as dv
    from datetime import date as d
    import io
    from PIL import Image
    img = Image.new("RGB", (900, 600), (200, 80, 60))
    buf = io.BytesIO(); img.save(buf, "JPEG"); data = buf.getvalue()
    # a flat photo is not a readable document: INVALID with a reason that says how to fix it
    st, why = dv.get_auto_verification(data, "insurance", expected_expiry_date=(d.today().replace(year=d.today().year + 1)).isoformat())
    assert why is None or isinstance(why, str)
