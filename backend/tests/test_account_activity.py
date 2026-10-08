from datetime import date, timedelta
from types import SimpleNamespace

from app.crud.account_activity import car_activity, driver_activity, car_verified_status
from app.models.common_enums import DocumentStatusEnum as S


def _car(**kw):
    base = dict(rc_front_status=S.VERIFIED, rc_back_status=S.VERIFIED, insurance_status=S.VERIFIED, permit_status=S.VERIFIED,
                fc_status=S.PENDING, registration_date=date.today() - timedelta(days=100), year_of_the_car="2026", fc_img_url=None,
                insurance_expiry_date=date.today() + timedelta(days=100), permit_expiry_date=date.today() + timedelta(days=100),
                fc_expiry_date=None, manual_inactive_reason=None, auto_inactive_reason=None)
    base.update(kw)
    return SimpleNamespace(**base)


def _driver(**kw):
    base = dict(licence_front_status=S.VERIFIED, licence_back_status=S.VERIFIED, police_verification_status=S.VERIFIED,
                licence_expiry_date=date.today() + timedelta(days=100), manual_inactive_reason=None, auto_inactive_reason=None)
    base.update(kw)
    return SimpleNamespace(**base)


def test_active_and_verified_are_different_things():
    c = _car(rc_back_status=S.PENDING)               # not verified yet - but documents are current, so ACTIVE
    a = car_activity(c)
    assert a["active"] is True and a["verified"] is False and a["not_verified"] == ["RC back"]


def test_new_vehicle_is_verified_without_an_fc():
    assert car_activity(_car())["verified"] is True


def test_expired_document_makes_a_car_inactive_with_the_reason():
    a = car_activity(_car(insurance_expiry_date=date.today() - timedelta(days=2)))
    assert a["active"] is False and "Insurance has expired" in a["inactive_reasons"]


def test_manual_and_rating_switch_off_show_their_reason():
    a = car_activity(_car(manual_inactive_reason="seat torn", auto_inactive_reason="Car quality rating is 2.1 (limit 3) from 9 customer ratings"))
    assert a["active"] is False and len(a["inactive_reasons"]) == 2 and "seat torn" in a["inactive_reasons"][0]


def test_driver_verified_needs_the_police_certificate():
    assert driver_activity(_driver())["verified"] is True
    d = driver_activity(_driver(police_verification_status=S.PENDING))
    assert d["active"] is True and d["verified"] is False and "Police verification certificate" in d["not_verified"]


def test_driver_expired_licence_is_inactive():
    d = driver_activity(_driver(licence_expiry_date=date.today() - timedelta(days=1)))
    assert d["active"] is False
