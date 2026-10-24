"""The "documents need your attention" popup asks the owner to ENTER a missing date - that must be possible without uploading the photo again."""
import uuid
from datetime import date, timedelta
from types import SimpleNamespace

import pytest
from fastapi import HTTPException

from app.api.routes import account_activity_routes as r


def _owner(db):
    from app.models.vehicle_owner import VehicleOwnerCredentials
    o = VehicleOwnerCredentials(primary_number="9" + str(uuid.uuid4().int)[:9], hashed_password="x")
    db.add(o)
    db.flush()
    return o


def _car(db, owner, **kw):
    from app.models.car_details import CarDetails
    plate = "TN" + str(uuid.uuid4().int)[:8]
    c = CarDetails(vehicle_owner_id=owner.id, car_name="Dzire", car_type="SEDAN_4_PLUS_1", car_number=plate,
                   rc_front_img_url="https://x/rc_" + plate, insurance_img_url="https://x/ins_" + plate, **kw)
    db.add(c)
    db.flush()
    return c


def _body(kind, eid, doc, d):
    return r.DocumentDateBody(kind=kind, entity_id=str(eid), document=doc, date=d)


def test_the_todo_says_which_items_are_fixed_by_typing_the_date(pg_session):
    o = _owner(pg_session)
    c = _car(pg_session, o)
    items = r.my_document_todos(db=pg_session, vehicle_owner_id=str(o.id))["items"]
    mine = {(i["document"], i["fix"], i["doc_key"]) for i in items if i["entity_id"] == str(c.id)}
    assert ("RC", "date", "rc") in mine and ("Insurance", "date", "insurance") in mine


def test_a_missing_insurance_date_is_saved_without_a_new_photo_and_the_todo_goes_away(pg_session):
    o = _owner(pg_session)
    c = _car(pg_session, o)
    when = date.today() + timedelta(days=200)
    out = r.set_document_date(_body("car", c.id, "insurance", when.isoformat()), db=pg_session, vehicle_owner_id=str(o.id))
    assert out["ok"] and out["date"] == when.isoformat() and out["expired"] is False
    pg_session.refresh(c)
    assert c.insurance_expiry_date == when
    items = r.my_document_todos(db=pg_session, vehicle_owner_id=str(o.id))["items"]
    assert not [i for i in items if i["entity_id"] == str(c.id) and i["document"] == "Insurance" and i["fix"] == "date"]


def test_the_rc_takes_a_registration_date_that_is_not_in_the_future(pg_session):
    o = _owner(pg_session)
    c = _car(pg_session, o)
    with pytest.raises(HTTPException) as e:
        r.set_document_date(_body("car", c.id, "rc", (date.today() + timedelta(days=3)).isoformat()), db=pg_session, vehicle_owner_id=str(o.id))
    assert e.value.status_code == 400
    r.set_document_date(_body("car", c.id, "rc", "2022-05-10"), db=pg_session, vehicle_owner_id=str(o.id))
    pg_session.refresh(c)
    assert c.registration_date == date(2022, 5, 10)


def test_a_saved_date_cannot_be_changed_this_way_and_nonsense_is_refused(pg_session):
    o = _owner(pg_session)
    c = _car(pg_session, o, insurance_expiry_date=date.today() + timedelta(days=100))
    with pytest.raises(HTTPException) as e:
        r.set_document_date(_body("car", c.id, "insurance", (date.today() + timedelta(days=400)).isoformat()), db=pg_session, vehicle_owner_id=str(o.id))
    assert e.value.status_code == 409                         # a renewed document must be uploaded so it is read and checked
    c2 = _car(pg_session, o)
    for bad in ("not a date", "1990-01-01", (date.today() + timedelta(days=366 * 40)).isoformat()):
        with pytest.raises(HTTPException) as e2:
            r.set_document_date(_body("car", c2.id, "insurance", bad), db=pg_session, vehicle_owner_id=str(o.id))
        assert e2.value.status_code == 400


def test_somebody_elses_car_and_a_document_that_was_never_uploaded_are_refused(pg_session):
    o, stranger = _owner(pg_session), _owner(pg_session)
    c = _car(pg_session, o)
    with pytest.raises(HTTPException) as e:
        r.set_document_date(_body("car", c.id, "insurance", "2027-01-01"), db=pg_session, vehicle_owner_id=str(stranger.id))
    assert e.value.status_code == 404
    with pytest.raises(HTTPException) as e2:                  # no permit photo on this car
        r.set_document_date(_body("car", c.id, "permit", "2027-01-01"), db=pg_session, vehicle_owner_id=str(o.id))
    assert e2.value.status_code == 400 and "Upload the document first" in e2.value.detail


def test_a_driving_licence_date_can_be_typed_too(pg_session):
    from app.models.car_driver import CarDriver
    o = _owner(pg_session)
    d = CarDriver(vehicle_owner_id=o.id, full_name="Ravi", primary_number="8" + str(uuid.uuid4().int)[:9], hashed_password="x",
                  licence_number="TN" + uuid.uuid4().hex[:12], address="a", city="Chennai", pincode="600001", licence_front_img="https://x/lic_" + uuid.uuid4().hex)
    pg_session.add(d)
    pg_session.flush()
    when = date.today() + timedelta(days=900)
    r.set_document_date(_body("driver", d.id, "licence", when.isoformat()), db=pg_session, vehicle_owner_id=str(o.id))
    pg_session.refresh(d)
    assert d.licence_expiry_date == when
