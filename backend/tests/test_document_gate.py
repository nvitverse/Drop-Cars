from datetime import date, timedelta
from types import SimpleNamespace

from app.crud.verification import is_car_verified, is_driver_verified, expired_car_documents
from app.models.common_enums import DocumentStatusEnum as S


def _car(**kw):
    base = dict(rc_front_status=S.PENDING, rc_back_status=S.PENDING, insurance_status=S.PENDING, permit_status=S.PENDING,
                rc_expiry_date=None, insurance_expiry_date=None, permit_expiry_date=None)
    base.update(kw)
    return SimpleNamespace(**base)


def test_auto_invalid_or_unverified_documents_do_not_block():
    car = _car(rc_front_status=S.INVALID, rc_back_status=S.INVALID, insurance_status=S.INVALID, permit_status=S.NEEDS_REVIEW)
    assert is_car_verified(car) is True


def test_an_expired_document_blocks_and_is_named():
    car = _car(insurance_expiry_date=date.today() - timedelta(days=1))
    assert is_car_verified(car) is False and expired_car_documents(car) == ["Insurance"]


def test_a_document_valid_today_or_without_a_date_is_fine():
    assert is_car_verified(_car(rc_expiry_date=date.today(), permit_expiry_date=date.today() + timedelta(days=30))) is True
    assert is_car_verified(_car()) is True


def test_expired_licence_blocks_the_driver_only_then():
    d = SimpleNamespace(licence_front_status=S.INVALID, licence_back_status=S.INVALID, licence_expiry_date=None)
    assert is_driver_verified(d) is True
    d.licence_expiry_date = date.today() - timedelta(days=3)
    assert is_driver_verified(d) is False
