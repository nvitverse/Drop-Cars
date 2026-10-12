"""Owner 2026-10-13: dates decide Active/Inactive; the reader must not reject people for its own slips; a new car must be pickable."""
import uuid
from datetime import date
from types import SimpleNamespace

from app.utils import document_verifier as dv


def test_letters_read_instead_of_digits_inside_a_date_are_repaired():
    d, linked = dv.find_expiry("DL No TN01 20190001234  Validity (NT) 1O-O3-2O27 ")
    assert d == date(2027, 3, 10) and linked
    d2, _ = dv.find_expiry("Valid upto : l5.l2.2O28")
    assert d2 == date(2028, 12, 15)


def test_ordinary_words_are_not_turned_into_dates():
    assert dv.all_dates_in_text("BOSS DOS ISSUE SOLID 2027 BLOOD GROUP") == []


def test_a_date_typed_by_the_owner_that_is_printed_on_the_document_is_accepted(monkeypatch):
    text = "DRIVING LICENCE UNION OF INDIA DL NO TN0120190001234 Date of issue 10-03-2020 Validity (NT) 09-03-2040 Validity (TR) 10-03-2027 Transport MCWG LMV " * 3
    monkeypatch.setattr(dv, "read_document_text", lambda b: text)
    monkeypatch.setattr(dv, "check_is_original_color", lambda b: (True, 40.0))
    monkeypatch.setattr(dv, "check_is_clear", lambda b: (True, 300.0))
    monkeypatch.setattr(dv, "_ai_facts", lambda b, k: None)
    typed = "2027-03-10"                       # the TR date: not the latest one on the card, but really printed on it
    r = dv.verify_uploaded_document(b"x", "licence", expected_expiry_date=typed)
    assert r["status"] == "VERIFIED" and r["extracted_expiry_date"] == typed


def test_a_single_misread_digit_goes_to_a_person_not_a_rejection(monkeypatch):
    text = "INSURANCE POLICY INSURED PREMIUM IDV POLICY PERIOD from 01-04-2026 to 31-03-2028 vehicle TN01AB1234 " * 3
    monkeypatch.setattr(dv, "read_document_text", lambda b: text)
    monkeypatch.setattr(dv, "check_is_original_color", lambda b: (True, 40.0))
    monkeypatch.setattr(dv, "check_is_clear", lambda b: (True, 300.0))
    monkeypatch.setattr(dv, "_ai_facts", lambda b, k: None)
    r = dv.verify_uploaded_document(b"x", "insurance", expected_expiry_date="2027-03-31")
    assert r["status"] == "NEEDS_REVIEW" and r.get("date_mismatch")           # 2027 vs 2028: one character apart
    far = dv.verify_uploaded_document(b"x", "insurance", expected_expiry_date="2030-09-01")
    assert far["status"] == "INVALID" and far.get("confident")                # clearly a different date


def test_a_new_car_still_in_processing_can_be_picked_but_a_blocked_one_cannot(pg_session):
    from app.crud.car_details import get_available_cars
    from app.models.car_details import CarDetails, CarStatusEnum
    from app.models.vehicle_owner import VehicleOwnerCredentials
    o = VehicleOwnerCredentials(primary_number="9" + str(uuid.uuid4().int)[:9], hashed_password="x")
    pg_session.add(o)
    pg_session.flush()
    for i, st in enumerate((CarStatusEnum.PROCESSING, CarStatusEnum.ONLINE, CarStatusEnum.BLOCKED)):
        pg_session.add(CarDetails(vehicle_owner_id=o.id, car_name=f"c{i}", car_type="SEDAN_4_PLUS_1", car_number="TN" + str(uuid.uuid4().int)[:8], car_status=st))
    pg_session.flush()
    got = {c.car_status for c in get_available_cars(pg_session, str(o.id))}
    assert got == {CarStatusEnum.PROCESSING, CarStatusEnum.ONLINE}


def test_switching_a_car_off_records_who_when_and_why(pg_session):
    from app.crud.account_activity import set_manual_active
    from app.crud.verification import car_document_problems
    from app.models.car_details import CarDetails
    from app.models.vehicle_owner import VehicleOwnerCredentials
    o = VehicleOwnerCredentials(primary_number="9" + str(uuid.uuid4().int)[:9], hashed_password="x")
    pg_session.add(o)
    pg_session.flush()
    car = CarDetails(vehicle_owner_id=o.id, car_name="c", car_type="SEDAN_4_PLUS_1", car_number="TN" + str(uuid.uuid4().int)[:8])
    pg_session.add(car)
    pg_session.flush()
    set_manual_active(pg_session, "car", car.id, False, "Customer complaints", by="Priya")
    text = " ".join(car_document_problems(car))
    assert "Customer complaints" in text and "by Priya" in text and "IST" in text
    set_manual_active(pg_session, "car", car.id, True, None)
    assert car_document_problems(car) == []


def test_a_document_stops_working_on_its_expiry_date_not_after_it():
    from datetime import timedelta
    from app.crud.verification import expired_car_documents, expired_driver_documents
    today = date.today()
    car = SimpleNamespace(insurance_expiry_date=today, permit_expiry_date=today + timedelta(days=1), fc_expiry_date=None, registration_date=None,
                          year_of_the_car="2015", fc_img_url=None)
    assert expired_car_documents(car, today) == ["Insurance"]                   # expiry day itself = already stopped
    assert expired_car_documents(SimpleNamespace(**{**car.__dict__, "insurance_expiry_date": today + timedelta(days=1)}), today) == []
    assert expired_driver_documents(SimpleNamespace(licence_expiry_date=today), today) == ["Driving licence"]
    assert expired_driver_documents(SimpleNamespace(licence_expiry_date=today + timedelta(days=1)), today) == []
