"""Complaints of 2026-10-12: drivers cannot add a car, some drivers' sign-in answers 500, vendor e-mail screen answers 500."""
import io
import uuid
from types import SimpleNamespace

import pytest
from fastapi import UploadFile
from starlette.datastructures import Headers

from app.core.security import get_password_hash, verify_password


def test_a_stored_value_that_is_not_a_hash_is_a_wrong_password_not_a_crash():
    assert verify_password("anything", "owner_pass") is False           # the placeholder written on owner-linked driver rows
    assert verify_password("anything", "") is False and verify_password("", get_password_hash("x")) is False
    assert verify_password("secret1", get_password_hash("secret1")) is True and verify_password("secret2", get_password_hash("secret1")) is False


def _img():
    return UploadFile(file=io.BytesIO(b"x"), filename="a.jpg", headers=Headers({"content-type": "image/jpeg"}))


def test_adding_the_same_car_again_for_the_same_owner_is_success(pg_session):
    from app.api.routes.car_details import signup_car_details
    from app.models.vehicle_owner import VehicleOwnerCredentials
    from app.models.car_details import CarDetails
    from app.models.new_orders import CarTypeEnum
    num = "9" + str(uuid.uuid4().int)[:9]
    o = VehicleOwnerCredentials(primary_number=num, hashed_password="x")
    pg_session.add(o)
    pg_session.flush()
    plate = "TN" + str(uuid.uuid4().int)[:2] + "AB" + str(uuid.uuid4().int)[:4]
    car = CarDetails(vehicle_owner_id=o.id, car_name="Dzire", car_type="SEDAN_4_PLUS_1", car_number=plate, rc_front_img_url="https://x/rc_" + plate)
    pg_session.add(car)
    pg_session.flush()
    form = SimpleNamespace(car_number=plate.lower(), car_type=SimpleNamespace(value="SEDAN_4_PLUS_1"), vehicle_owner_id=None, car_name="Dzire", year_of_the_car="2024")
    user = SimpleNamespace(vehicle_owner_id=o.id)
    out = signup_car_details(car_form=form, rc_front_img=_img(), rc_back_img=_img(), insurance_img=_img(), fc_img=None, car_img=_img(), permit_img=_img(),
                             pollution_img=_img(), current_user=user, db=pg_session)
    assert out["status"] == "success" and out["car_id"] == str(car.id) and out["image_urls"]["rc_front_img_url"].startswith("https://x/rc_")


def test_the_vendor_email_screen_works_with_the_vendor_row(pg_session):
    from app.api.routes.vendor import get_vendor_email
    from app.models.vendor import VendorCredentials
    v = VendorCredentials(primary_number="8" + str(uuid.uuid4().int)[:9], hashed_password="x", email="v@example.com", email_verified=True)
    pg_session.add(v)
    pg_session.flush()
    assert get_vendor_email(db=pg_session, vendor_id=v) == {"email": "v@example.com", "email_verified": True}
