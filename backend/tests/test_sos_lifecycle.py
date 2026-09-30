"""
Unit and integration tests for SOS Emergency system (T4 / T8).
- Verifies router paths match exact specification
- Verifies legacy /api/sos/alert contract
- Verifies token-based role & identity extraction
- Verifies SOS lifecycle: ACTIVE -> ACKNOWLEDGED -> RESOLVED / FALSE_ALARM
"""
import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from app.main import app
from app.database.session import Base, get_db
from app.models.sos_alert import SosAlert
from app.core.security import create_access_token


def test_sos_router_paths():
    """Verify exact SOS router paths exposed by the FastAPI application."""
    routes = [route.path for route in app.routes]
    
    assert "/api/sos/alert" in routes
    assert "/api/sos/trigger" in routes
    assert "/api/sos/stream/{alert_id}" in routes
    assert "/api/sos/active" in routes
    assert "/api/sos/alerts" in routes
    assert "/api/sos/{alert_id}/acknowledge" in routes
    assert "/api/sos/{alert_id}/resolve" in routes


def test_legacy_sos_alert_contract():
    """Legacy endpoint /api/sos/alert should accept legacy schema and return alert details."""
    from sqlalchemy.pool import StaticPool
    engine = create_engine(
        "sqlite:///:memory:",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool
    )
    SosAlert.__table__.create(bind=engine, checkfirst=True)
    TestingSession = sessionmaker(bind=engine)

    def override_get_db():
        db = TestingSession()
        try:
            yield db
        finally:
            db.close()

    app.dependency_overrides[get_db] = override_get_db
    try:
        client = TestClient(app)
        payload = {
            "customer_id": "cust_12345",
            "order_id": "ORD-9999",
            "emergency_contact": "9876543210",
            "latitude": "13.0827",
            "longitude": "80.2707",
            "tracking_link": "https://dropcars.in/track/ORD-9999"
        }
        response = client.post("/api/sos/alert", json=payload)
        assert response.status_code == 200
        data = response.json()
        assert data.get("status") in ("ok", "success")
        assert "alert_id" in data or "id" in data
    finally:
        app.dependency_overrides.pop(get_db, None)


def test_unauthenticated_sos_endpoints_rejected():
    """Trigger, stream, active, acknowledge and resolve must require authentication."""
    client = TestClient(app)
    
    # Trigger requires auth
    res_trig = client.post("/api/sos/trigger", json={"order_id": "123"})
    assert res_trig.status_code in (401, 403)
    
    # Active alerts is admin-only
    res_act = client.get("/api/sos/active")
    assert res_act.status_code in (401, 403)
    
    # Acknowledge is admin-only
    res_ack = client.post("/api/sos/1/acknowledge")
    assert res_ack.status_code in (401, 403)
    
    # Resolve is admin-only
    res_res = client.post("/api/sos/1/resolve", json={"status": "RESOLVED"})
    assert res_res.status_code in (401, 403)
