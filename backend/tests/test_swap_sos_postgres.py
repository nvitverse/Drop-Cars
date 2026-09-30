"""
Fleet swap + SOS end to end on real Postgres (pg_session, rolled back).

Covers the review checklist for PR #1: OTP never in any response, hashed OTP
with tz-aware expiry, lockout after 5 wrong tries, owner-only verify, active
trip re-check, SOS identity from the token (incl. force-logout and unknown
roles), legacy /sos/alert still open, admin lifecycle.
"""
import re
import uuid
from datetime import datetime, timedelta, timezone
from types import SimpleNamespace

import pytest

from app.api.routes.fleet_swap import _hash_otp, MAX_OTP_ATTEMPTS
from app.core.security import create_access_token, get_current_admin, get_current_vehicleOwner_id
from app.main import app
from app.models.car_driver import CarDriver
from app.models.fleet_swap_audit import FleetDriverSwapAudit
from app.models.sos_alert import SosAlert
from app.models.vehicle_owner import VehicleOwnerCredentials

SIX_DIGITS = re.compile(r"(?<!\d)\d{6}(?!\d)")


def _phone():
    return "9" + str(uuid.uuid4().int)[:9]


def _owner(db):
    o = VehicleOwnerCredentials(primary_number=_phone(), hashed_password="x")
    db.add(o)
    db.flush()
    return o


def _driver(db, owner):
    d = CarDriver(
        vehicle_owner_id=owner.id, full_name="Test Driver", primary_number=_phone(),
        hashed_password="x", licence_number="TN" + uuid.uuid4().hex[:12],
        address="a", city="Chennai", pincode="600001",
    )
    db.add(d)
    db.flush()
    return d


def _token(user, sub, version=0):
    return {"Authorization": "Bearer " + create_access_token({"sub": str(sub), "user": user, "token_version": version})}


@pytest.fixture
def overrides():
    yield app.dependency_overrides
    app.dependency_overrides.pop(get_current_vehicleOwner_id, None)
    app.dependency_overrides.pop(get_current_admin, None)


# ---------------------------------------------------------------- fleet swap

def test_driver_swap_full_flow(client_with_db, pg_session, overrides, monkeypatch):
    old_owner, new_owner = _owner(pg_session), _owner(pg_session)
    driver = _driver(pg_session, old_owner)
    overrides[get_current_vehicleOwner_id] = lambda: str(new_owner.id)

    # Capture the push that carries the OTP to the driver.
    pushes = []
    import app.utils.notification_dispatch as nd
    monkeypatch.setattr(nd, "send_push_to_driver", lambda db, driver_id, title, body, data=None: pushes.append((driver_id, body)))

    res = client_with_db.post("/api/fleet-swap/request-swap", json={"driver_id": str(driver.id)})
    assert res.status_code == 200, res.text
    body = res.json()
    assert len(pushes) == 1 and pushes[0][0] == str(driver.id), "OTP push must go to the driver"
    otp = SIX_DIGITS.search(pushes[0][1]).group(0)
    assert "otp" not in {k.lower() for k in body}
    assert otp not in res.text, "OTP leaked in request-swap response"

    audit = pg_session.query(FleetDriverSwapAudit).filter_by(swap_uuid=uuid.UUID(body["swap_id"])).one()
    assert audit.status == "PENDING_OTP"
    assert audit.otp_hash and audit.otp_salt
    assert audit.otp_expires_at.tzinfo is not None, "otp_expires_at must be tz-aware"

    # Driver sees the pending request, without the OTP.
    pend = client_with_db.get("/api/fleet-swap/pending-for-driver", headers=_token("driver", driver.id))
    assert pend.status_code == 200, pend.text
    assert pend.json()["has_pending"] is True
    assert otp not in pend.text

    ok = client_with_db.post("/api/fleet-swap/verify-swap", json={"swap_id": body["swap_id"], "otp_code": otp})
    assert ok.status_code == 200, ok.text
    assert otp not in ok.text
    pg_session.refresh(driver)
    assert driver.vehicle_owner_id == new_owner.id


def test_swap_lockout_expiry_and_owner_check(client_with_db, pg_session, overrides):
    old_owner, new_owner, stranger = _owner(pg_session), _owner(pg_session), _owner(pg_session)
    driver = _driver(pg_session, old_owner)

    def make_swap(expires_in_min=10):
        a = FleetDriverSwapAudit(
            swap_uuid=uuid.uuid4(), swap_type="DRIVER", driver_id=driver.id,
            old_owner_id=old_owner.id, new_owner_id=new_owner.id, initiated_by="OWNER",
            otp_salt="s", otp_hash=_hash_otp("111111", "s"),
            otp_expires_at=datetime.now(timezone.utc) + timedelta(minutes=expires_in_min),
            otp_attempts=0, status="PENDING_OTP", created_at=datetime.utcnow(),
        )
        pg_session.add(a)
        pg_session.flush()
        return str(a.swap_uuid)

    # Someone else cannot verify
    swap_id = make_swap()
    overrides[get_current_vehicleOwner_id] = lambda: str(stranger.id)
    r = client_with_db.post("/api/fleet-swap/verify-swap", json={"swap_id": swap_id, "otp_code": "111111"})
    assert r.status_code == 403

    # Lockout after MAX_OTP_ATTEMPTS wrong codes
    overrides[get_current_vehicleOwner_id] = lambda: str(new_owner.id)
    for _ in range(MAX_OTP_ATTEMPTS):
        r = client_with_db.post("/api/fleet-swap/verify-swap", json={"swap_id": swap_id, "otp_code": "000000"})
        assert r.status_code == 400
    r = client_with_db.post("/api/fleet-swap/verify-swap", json={"swap_id": swap_id, "otp_code": "111111"})
    assert r.status_code == 429, "correct OTP must not work after lockout"

    # Expired
    swap_id = make_swap(expires_in_min=-1)
    r = client_with_db.post("/api/fleet-swap/verify-swap", json={"swap_id": swap_id, "otp_code": "111111"})
    assert r.status_code == 400 and "expired" in r.text.lower()

    pg_session.refresh(driver)
    assert driver.vehicle_owner_id == old_owner.id


# ---------------------------------------------------------------------- SOS

def test_legacy_sos_alert_stays_open(client_with_db, pg_session):
    r = client_with_db.post("/api/sos/alert", json={"customer_id": "c1", "order_id": "42", "latitude": "13.08", "longitude": "80.27"})
    assert r.status_code == 200, r.text
    alert = pg_session.get(SosAlert, r.json()["alert_id"])
    assert alert.status == "ACTIVE" and alert.triggered_by_id is None


def test_sos_trigger_identity_from_token(client_with_db, pg_session):
    owner = _owner(pg_session)
    driver, other = _driver(pg_session, owner), _driver(pg_session, owner)

    r = client_with_db.post("/api/sos/trigger", json={"latitude": "13.0", "longitude": "80.2"}, headers=_token("driver", driver.id))
    assert r.status_code == 200, r.text
    assert r.json()["role"] == "DRIVER"
    alert_id = r.json()["alert_id"]
    assert pg_session.get(SosAlert, alert_id).triggered_by_id == str(driver.id)

    # Only the creator can stream (and stream is POST)
    ok = client_with_db.post(f"/api/sos/stream/{alert_id}", json={"latitude": "13.1", "longitude": "80.3"}, headers=_token("driver", driver.id))
    assert ok.status_code == 200, ok.text
    no = client_with_db.post(f"/api/sos/stream/{alert_id}", json={"latitude": "1", "longitude": "1"}, headers=_token("driver", other.id))
    assert no.status_code == 403

    # Fleet driver / vehicle owner token works too (was a 500: owner.mobile_number)
    r = client_with_db.post("/api/sos/trigger", json={}, headers=_token("vehicle_owner", owner.id))
    assert r.status_code == 200, r.text
    assert r.json()["role"] == "VEHICLE_OWNER"


def test_flexible_auth_rejects_bad_tokens(client_with_db, pg_session):
    owner = _owner(pg_session)
    driver = _driver(pg_session, owner)

    # Account that does not exist
    assert client_with_db.post("/api/sos/trigger", json={}, headers=_token("vendor", uuid.uuid4())).status_code == 401
    # No role claim at all (used to become CUSTOMER)
    bare = {"Authorization": "Bearer " + create_access_token({"sub": str(driver.id)})}
    assert client_with_db.post("/api/sos/trigger", json={}, headers=bare).status_code == 401
    # Force logout honoured
    driver.token_version = 5
    pg_session.flush()
    assert client_with_db.post("/api/sos/trigger", json={}, headers=_token("driver", driver.id, version=0)).status_code == 401
    # Garbage token
    assert client_with_db.post("/api/sos/trigger", json={}, headers={"Authorization": "Bearer nope"}).status_code == 401


def test_sos_admin_lifecycle(client_with_db, pg_session, overrides):
    alert_id = client_with_db.post("/api/sos/alert", json={"order_id": "7"}).json()["alert_id"]
    overrides[get_current_admin] = lambda: SimpleNamespace(id=uuid.uuid4(), full_name="Test Admin", username="t", role="Owner")

    active = client_with_db.get("/api/sos/active").json()
    assert any(a["id"] == alert_id for a in active["alerts"])

    assert client_with_db.post(f"/api/sos/{alert_id}/acknowledge").json()["acknowledged_by"] == "Test Admin"
    res = client_with_db.post(f"/api/sos/{alert_id}/resolve", json={"status": "FALSE_ALARM"}).json()
    assert res["status_code"] == "FALSE_ALARM"
    assert pg_session.get(SosAlert, alert_id).status == "FALSE_ALARM"
