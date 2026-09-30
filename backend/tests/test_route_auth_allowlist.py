"""
Route-table auth audit (B11 / T8).

Walks EVERY route in the FastAPI app and follows each route's full
dependency tree. A route counts as authenticated only if some dependency in
that tree is a real auth dependency (app.core.security.get_current_* or the
website key check). Depends(get_db) and friends do not count.

Every route without one must be listed below, either as public by design or
as a known open route waiting on a backlog task. The test fails when:
  * a new unauthenticated route appears that is in neither list, or
  * a listed route has since been locked (so the list only ever shrinks), or
  * any /api/sos/* or /api/fleet-swap/* route other than the legacy SOS
    alert is unauthenticated, even if someone adds it to a list.
"""
from fastapi.routing import APIRoute

from app.main import app

# Open on purpose: sign-in/up, password reset, public quotes and lookups,
# token-in-URL links, webhooks/internal hooks that check their own secret.
PUBLIC_BY_DESIGN = {
    "POST /api/admin/signin",
    "POST /api/users/cardriver/signin",
    "POST /api/users/cardriver/firebase/verify",
    "POST /api/users/customer/signin",
    "POST /api/users/customer/signup",
    "POST /api/users/vehicleowner/login",
    "POST /api/users/vehicleowner/signup",
    "POST /api/users/vehicleowner/upload-signup-doc",
    "POST /api/users/vendor/signin",
    "POST /api/users/vendor/signup",
    "POST /api/users/forgot-password",
    "POST /api/users/email/request-reset-otp",
    "POST /api/users/email/reset-password",
    "POST /api/customer/bookings/quote",
    "POST /api/orders/oneway/quote",
    "POST /api/orders/roundtrip/quote",
    "POST /api/orders/multicity/quote",
    "POST /api/orders/hourly/quote",
    "GET /api/orders/rental_hrs_data",
    "GET /api/orders/max-assignment-times",
    "GET /api/cities/public",
    "GET /api/cities/local-serviceable",
    "GET /api/geocode/search",
    "GET /api/geocode/reverse",
    "GET /api/users/cardetails/car-models/public",
    "GET /api/trip-review/{token}",
    "POST /api/trip-review/{token}",
    "GET /api/website/trip-link/{token}",
    "POST /api/website/trip-link/{token}/start",
    "POST /api/website/trip-link/{token}/location",
    "POST /api/website/trip-link/{token}/left",
    "POST /api/ai/webhook/whatsapp",
    "POST /api/internal/sweep",
    "POST /api/internal/dispatch-expo-push",
    # Shipped customer app sends no token; an SOS must never fail closed (B4).
    "POST /api/sos/alert",
}

# Open today and should not be. Each one is a backlog item; remove the line
# in the same PR that adds auth to the route.
KNOWN_OPEN_TODO = {
    # B1 - CRM
    "GET /api/crm/leads",
    "PATCH /api/crm/leads/{lead_id}",
    "POST /api/crm/lead",
    "POST /api/crm/leads/{lead_id}/convert",
    "GET /api/crm/owner/financials",
    "GET /api/crm/owner/settings",
    "PUT /api/crm/owner/settings",
    # B2 - order lists leak customer name/number
    "GET /api/orders/all",
    "GET /api/orders/pending-all",
    # B5 - admin/settings/cost endpoints
    "GET /api/admin/ai-automation-logs",
    "GET /api/admin/ai-automation-logs/{log_id}",
    "POST /api/admin/ai-automation-logs/seed-demo",
    "GET /api/admin/assignment-priority-settings",
    "GET /api/api/v1/assignment-priority-settings",
    "GET /api/dropbid/settings",
    "PUT /api/dropbid/settings",
    "POST /api/orders/refresh-rental-hrs-data",
    "POST /api/documents/verify-image",
    "POST /api/documents/verify-face-match",
    "POST /api/ai/chat-assistant",
    # B6 - invoice PDFs by guessable id
    "GET /api/bookings/{booking_id}/invoice-pdf",
    "GET /api/customer/bookings/{booking_id}/invoice-pdf",
    "GET /api/api/bookings/{booking_id}/invoice-pdf",
    "GET /api/api/customer/bookings/{booking_id}/invoice-pdf",
    # Not yet in BACKLOG.md - found by this test, need a B-item
    "GET /api/booking-chat/threads",
    "GET /api/booking-chat/orders/{order_id}",
    "POST /api/booking-chat/orders/{order_id}",
    "GET /api/carpool/journeys",
    "GET /api/carpool/journeys/{journey_id}/requests",
    "POST /api/carpool/journeys/{journey_id}/request",
    "POST /api/driver/route-requests",
    "GET /api/driver/route-requests/{driver_id}",
    "DELETE /api/driver/route-requests/{request_id}",
    "POST /api/orders/{order_id}/trigger-route-assign",
    "PUT /api/orders/orders/{order_id}/advance-received",
    "PUT /api/assignments/orders/{order_id}/advance-received",
    "POST /api/profile-edit-requests/submit",
    "GET /api/trip-review/link/{order_id}",
}

STRICT_PREFIXES = ("/api/sos", "/api/fleet-swap")
STRICT_EXCEPTIONS = {"POST /api/sos/alert"}


def _is_auth_dependency(call) -> bool:
    module = getattr(call, "__module__", "") or ""
    name = getattr(call, "__name__", "") or ""
    if module == "app.core.security" and name.startswith("get_current"):
        return True
    return name == "require_website_key"


def _has_auth(dependant) -> bool:
    for dep in dependant.dependencies:
        if _is_auth_dependency(dep.call) or _has_auth(dep):
            return True
    return False


def _open_routes():
    open_routes = set()
    for route in app.routes:
        if not isinstance(route, APIRoute):
            continue
        if _has_auth(route.dependant):
            continue
        for method in route.methods:
            open_routes.add(f"{method} {route.path}")
    return open_routes


def test_route_table_was_walked():
    api_routes = [r for r in app.routes if isinstance(r, APIRoute)]
    assert len(api_routes) > 300, "route table looks incomplete - did app.main import every router?"


def test_every_open_route_is_listed():
    unexpected = sorted(_open_routes() - PUBLIC_BY_DESIGN - KNOWN_OPEN_TODO)
    assert not unexpected, (
        "Routes without an auth dependency that are not in PUBLIC_BY_DESIGN or "
        f"KNOWN_OPEN_TODO: {unexpected}"
    )


def test_lists_have_no_stale_entries():
    all_routes = {
        f"{m} {r.path}" for r in app.routes if isinstance(r, APIRoute) for m in r.methods
    }
    stale = sorted((PUBLIC_BY_DESIGN | KNOWN_OPEN_TODO) - _open_routes())
    missing = [s for s in stale if s not in all_routes]
    now_locked = [s for s in stale if s in all_routes]
    assert not missing, f"Listed routes that no longer exist: {missing}"
    assert not now_locked, f"Routes now have auth - remove them from the lists: {now_locked}"


def test_sos_and_swap_routes_are_authenticated():
    bad = sorted(
        r for r in _open_routes()
        if r.split(" ", 1)[1].startswith(STRICT_PREFIXES) and r not in STRICT_EXCEPTIONS
    )
    assert not bad, f"Unauthenticated SOS / fleet-swap routes: {bad}"


def test_sos_stream_stays_post():
    methods = {
        m for r in app.routes if isinstance(r, APIRoute) and r.path == "/api/sos/stream/{alert_id}"
        for m in r.methods
    }
    assert methods == {"POST"}
