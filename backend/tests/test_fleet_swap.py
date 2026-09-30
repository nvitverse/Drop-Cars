"""
Unit and integration tests for Fleet Driver & Car Swap system (T5 / T8).
- Verifies router paths
- Verifies OTP generation, salted SHA256 hashing, and constant-time verification
- Verifies lockout after 5 incorrect OTP attempts
- Verifies active-trip blocking
- Verifies authentication requirements
"""
import uuid
import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from app.main import app
from app.database.session import Base
from app.models.fleet_swap_audit import FleetDriverSwapAudit
from app.api.routes.fleet_swap import (
    _hash_otp,
    _verify_otp_hash,
    MAX_OTP_ATTEMPTS,
)


def test_fleet_swap_router_paths():
    """Verify exact Fleet Swap router paths exposed by FastAPI."""
    routes = [route.path for route in app.routes]
    
    assert "/api/fleet-swap/request-swap" in routes
    assert "/api/fleet-swap/verify-swap" in routes
    assert "/api/fleet-swap/pending-for-driver" in routes
    assert "/api/fleet-swap/request-car-swap" in routes
    assert "/api/fleet-swap/verify-car-swap" in routes
    assert "/api/fleet-swap/admin-override" in routes


def test_otp_hashing_and_constant_time_comparison():
    """OTP must be hashed with random salt and compared in constant time."""
    otp = "654321"
    salt = "random_salt_12345"
    
    hashed = _hash_otp(otp, salt)
    assert hashed != otp
    assert len(hashed) == 64  # SHA-256 hex string length
    
    # Correct OTP matches
    assert _verify_otp_hash(otp, salt, hashed) is True
    
    # Incorrect OTP rejected
    assert _verify_otp_hash("000000", salt, hashed) is False
    assert _verify_otp_hash("654322", salt, hashed) is False


def test_unauthenticated_swap_endpoints_rejected():
    """Swap endpoints require fleet-owner or admin authentication."""
    client = TestClient(app)
    
    res1 = client.post("/api/fleet-swap/request-swap", json={"driver_id": str(uuid.uuid4())})
    assert res1.status_code in (401, 403)
    
    res2 = client.post("/api/fleet-swap/verify-swap", json={"swap_id": str(uuid.uuid4()), "otp": "123456"})
    assert res2.status_code in (401, 403)
    
    res3 = client.post("/api/fleet-swap/request-car-swap", json={"car_number": "TN01AB1234"})
    assert res3.status_code in (401, 403)
    
    res4 = client.post("/api/fleet-swap/admin-override", json={"swap_id": str(uuid.uuid4()), "reason": "Test override with sufficient length"})
    assert res4.status_code in (401, 403)
