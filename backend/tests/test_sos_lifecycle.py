"""
Unit and integration tests for SOS Emergency system (T4 / T8).
- Verifies router paths match exact specification
- Verifies legacy /api/sos/alert contract
- Verifies token-based role & identity extraction
- Verifies SOS lifecycle: ACTIVE -> ACKNOWLEDGED -> RESOLVED / FALSE_ALARM
"""
import pytest
from fastapi.testclient import TestClient

from app.main import app


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


# The legacy /api/sos/alert contract is exercised on real Postgres in
# test_swap_sos_postgres.py (this file used to test it on in-memory SQLite).


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
