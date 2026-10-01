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

# Open on purpose - the only routes that answer without a login:
#  * sign-in / sign-up / password reset (you can't log in before these),
#  * reference lists the apps need on the signup screens (cities, car models,
#    rental hours, geocode - rate limited), no private data,
#  * links whose secret token IS the auth (trip review, driver trip link),
#  * machine hooks that check their own secret (internal sweep / Cloud Tasks,
#    website CRM lead key, WhatsApp webhook ack-only),
#  * legacy SOS alert: the shipped customer app sends no token and an
#    emergency must never fail closed.
PUBLIC_BY_DESIGN = {
    "GET /api/notification-sounds/file/{filename}",
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
    "POST /api/users/email/link-email-and-request-otp",
    "POST /api/users/email/verify-link-and-reset",
    "POST /api/users/vehicleowner/send-email-otp",
    "POST /api/users/vehicleowner/verify-email-otp",
    # Forgot-password help for someone who can't log in, and the support phone number.
    "POST /api/support/public-request-admin-help",
    "GET /api/support/on-duty-contact",
    # Published app content: OTA manifest (checked before login), terms, cards, GST details.
    "GET /api/app-updates/{app}/manifest",
    "GET /api/public/app-content/{key}",
    "GET /api/public/terms/driver",
    "GET /api/public/gst-business-info",
    "GET /api/cities/public",
    "GET /api/cities/local-serviceable",
    "GET /api/orders/rental_hrs_data",
    "GET /api/users/cardetails/car-models/public",
    "GET /api/geocode/search",
    "GET /api/geocode/reverse",
    "GET /api/trip-review/{token}",
    "POST /api/trip-review/{token}",
    "GET /api/website/trip-link/{token}",
    "POST /api/website/trip-link/{token}/start",
    "POST /api/website/trip-link/{token}/location",
    "POST /api/website/trip-link/{token}/left",
    "POST /api/internal/sweep",
    "POST /api/internal/run-sweep",
    "POST /api/internal/dispatch-expo-push",
    "POST /api/crm/lead",
    "POST /api/ai/webhook/whatsapp",
    "POST /api/sos/alert",
}

# Open today and should not be. Empty since the 2026-09-30 lockdown; a route
# may only be added here together with a backlog id and the owner's OK.
KNOWN_OPEN_TODO = set()

STRICT_PREFIXES = ("/api/sos", "/api/fleet-swap")
STRICT_EXCEPTIONS = {"POST /api/sos/alert"}


def _is_auth_dependency(call) -> bool:
    module = getattr(call, "__module__", "") or ""
    name = getattr(call, "__name__", "") or ""
    if module == "app.core.security" and name.startswith("get_current"):
        return True
    return name in ("require_website_key", "require_invoice_access")


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


def test_locked_routes_reject_anonymous_callers():
    from fastapi.testclient import TestClient

    client = TestClient(app)
    for method, path in [
        ("get", "/api/orders/all"),
        ("get", "/api/orders/pending-all"),
        ("get", "/api/crm/leads"),
        ("get", "/api/crm/owner/settings"),
        ("get", "/api/admin/ai-automation-logs"),
        ("put", "/api/dropbid/settings"),
        ("get", "/api/booking-chat/threads"),
        ("get", "/api/carpool/journeys"),
        ("get", "/api/customer/bookings/1/invoice-pdf"),
        ("post", "/api/orders/oneway/quote"),
    ]:
        res = getattr(client, method)(path)
        assert res.status_code in (401, 403, 422), f"{method.upper()} {path} -> {res.status_code}"
        assert res.status_code != 422 or "detail" in res.json()


def test_invoice_signed_link(monkeypatch):
    from app.api.routes.tax_admin import invoice_link_signature

    monkeypatch.setenv("WEBSITE_INTEGRATION_KEY", "k1")
    sig = invoice_link_signature("C26093001")
    assert sig and len(sig) == 64
    assert invoice_link_signature("C26093002") != sig
