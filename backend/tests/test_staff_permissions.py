"""Staff permission keys: every section the Admin App offers must be accepted, and extras come from a platform setting."""
from app.api.routes import admin as admin_routes


def test_app_offered_keys_are_allowed(monkeypatch):
    monkeypatch.setattr("app.crud.customer_booking_request.get_platform_setting_value", lambda db, k, d: "")
    allowed = admin_routes.allowed_staff_permissions(None)
    for key in ("enquiries", "bookings", "customers", "fleet", "finance", "chats", "tasks",
                "approvals", "verifications", "account_activations", "payment_release"):
        assert key in allowed


def test_extra_keys_from_setting(monkeypatch):
    monkeypatch.setattr("app.crud.customer_booking_request.get_platform_setting_value", lambda db, k, d: " Reports , audit ")
    allowed = admin_routes.allowed_staff_permissions(None)
    assert {"reports", "audit"} <= allowed
