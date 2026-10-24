"""The driver can type the customer's e-mail on the bill screen; the trip bill then goes there (phone / admin / vendor bookings have no e-mail
otherwise). Only a valid e-mail is stored, and only for the driver's own open trip."""
from tests.test_trip_bill_preview import _booking_with_open_trip
from tests.test_trip_exceptions import _auth


def test_the_driver_saves_the_customer_email_and_the_bill_mail_finds_it(pg_session, client_with_db, monkeypatch):
    from app.models.orders import Order
    from app.utils.customer_bill_email import customer_email_for
    db, c = pg_session, client_with_db
    order_id, owner, drv = _booking_with_open_trip(db, c, monkeypatch)
    order = db.query(Order).filter(Order.id == order_id).first()
    assert customer_email_for(db, order) is None                         # a phone booking: no e-mail yet

    bad = c.post(f"/api/assignments/driver/trip-customer-email/{order_id}", headers=_auth("driver", drv), json={"email": "not-an-email"})
    assert bad.status_code == 400
    ok = c.post(f"/api/assignments/driver/trip-customer-email/{order_id}", headers=_auth("driver", drv), json={"email": "  Ravi.K@Example.com "})
    assert ok.status_code == 200 and ok.json()["saved"] is True
    assert customer_email_for(db, order) == "ravi.k@example.com"

    again = c.post(f"/api/assignments/driver/trip-customer-email/{order_id}", headers=_auth("driver", drv), json={"email": "new@example.com"})
    assert again.status_code == 200
    assert customer_email_for(db, order) == "new@example.com"            # replaced, not duplicated


def test_another_driver_cannot_set_the_email_of_a_trip_that_is_not_theirs(pg_session, client_with_db, monkeypatch):
    import uuid
    from app.models.car_driver import CarDriver
    db, c = pg_session, client_with_db
    order_id, owner, drv = _booking_with_open_trip(db, c, monkeypatch)
    other = CarDriver(vehicle_owner_id=owner.id, full_name="Other", primary_number="9" + str(uuid.uuid4().int)[:9], hashed_password="x",
                      licence_number="TN" + uuid.uuid4().hex[:12], address="a", city="Chennai", pincode="600001")
    db.add(other)
    db.commit()
    r = c.post(f"/api/assignments/driver/trip-customer-email/{order_id}", headers=_auth("driver", other), json={"email": "x@example.com"})
    assert r.status_code == 404
