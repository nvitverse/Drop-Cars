import logging
import uuid
from fastapi import FastAPI, Request, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from sqlalchemy.exc import IntegrityError
from fastapi_utils.tasks import repeat_every
from app.database.session import SessionLocal
from app.api.routes import vendor, vehicle_owner, car_details, car_driver, new_orders, order_assignments, transfer_transactions, admin, hourly_rental, orders, wallet, notification, customer, customer_bookings, website_bookings
from app.api.routes import cities as cities_router
from app.api.routes import announcements as announcements_router
from app.api.routes import geocode as geocode_router
from app.api.routes import tax_admin as tax_admin_router
from app.api.routes import hybrid_auth as hybrid_auth_router
from app.utils.cities import load_cities_once
from app.utils.car_models import load_car_models_once
import app.models.admin
import app.models.worker_management
import app.models.document_model  # document_models table must be known before create_all()
import app.models.chat_trash  # chat_trash table must be known before create_all()
import app.models.billing  # billing_brands / billing_documents tables
import app.models.car_driver
import app.models.vehicle_owner
import app.models.vehicle_owner_details
import app.models.booking_chat
import app.models.support_message
import app.models.guest_help_token
import app.models.fleet_subscription
import app.models.trip_review
import app.models.stale_document_file
import app.models.car_details
import app.models.vendor
import app.models.new_orders
import app.models.vendor_details
import app.models.hourly_rental
import app.models.orders
import app.models.order_assignments
import app.models.transfer_transactions
import app.models.wallet_ledger
import app.models.razorpay_transactions
import app.models.vendor_wallet_ledger
import app.models.admin_wallet_ledger
import app.models.admin_add_money_to_vehicle_owner
from app.database.session import Base, engine
import app.models.end_records
import app.models.platform_setting
import app.models.password_reset_attempt
import app.models.email_otp
import app.models.customer
import app.models.customer_details
import app.models.customer_booking_request
import app.models.route_distance
import app.models.rating
import app.models.payout_request
import app.models.notification_log
import app.models.profile_edit_review
import app.models.carpool
import app.models.vehicle_matching
import app.models.announcement
import app.models.website_integration
import app.models.tax_settings
import app.models.tax_invoice
import app.models.driver_settlement
import app.models.finance_audit_log
import app.models.phone_otp
import app.models.savaari_booking
import app.models.savaari_alert_filter
import app.models.crm_models
# These two were never imported here even though their routes were
# registered (see ai_automation_log_routes/driver_route_request_routes
# below) - Base.metadata never learned about them, so create_all() never
# created their tables, so every endpoint touching them 500'd with
# "relation does not exist" in production this whole time. Found via the
# schema diagnostic, not from any report - see /_schema_diagnostic_temp.
import app.models.ai_automation_log
import app.models.driver_route_request
import app.models.drop_bid
import app.models.customer_wallet_topup
import app.models.staff_directive
import app.models.own_fleet
import app.models.quality_case
import app.models.sos_alert
import app.models.fleet_swap_audit
import app.models.driver_tour_ledger
import app.models.customer_review_queue

# A startup "ALTER TABLE" needs an exclusive lock. If some other session holds the table (a long transaction), Postgres
# queues the ALTER - and every later query on that table queues BEHIND it, so the whole live API freezes until the
# blocker finishes (this took the API down on 2026-09-19 during a deploy). Give every ALTER a short lock timeout: it
# fails fast (the startup migration functions already catch that and continue) instead of freezing everything.
from sqlalchemy import event as _sa_event


@_sa_event.listens_for(engine, "before_cursor_execute")
def _ddl_short_lock_timeout(conn, cursor, statement, parameters, context, executemany):
    if statement.lstrip()[:11].upper() == "ALTER TABLE":
        cursor.execute("SET LOCAL lock_timeout = '5s'")


# Create DB tables
Base.metadata.create_all(bind=engine)

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s: %(message)s")
logger = logging.getLogger("dropcars.api")

from slowapi import _rate_limit_exceeded_handler
from slowapi.errors import RateLimitExceeded
from app.core.limiter import limiter

app = FastAPI(title="Drop Cars API")
app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# Centralized error handling, one place instead of the ~32 repeated
# `except Exception as e: raise HTTPException(500, f"Internal server
# error: {str(e)}")` blocks that used to live in admin.py alone (and the
# same pattern scattered elsewhere) - every route in the API gets this
# automatically now, current and future, with no per-endpoint boilerplate.
# Each response carries an error_id that also goes into the server log, so
# a staff member reporting "I got error XJ12AB4" can be matched straight
# to the full traceback instead of guessing from a vague message.
@app.exception_handler(IntegrityError)
async def integrity_error_handler(request: Request, exc: IntegrityError):
    error_id = uuid.uuid4().hex[:8].upper()
    logger.exception("[%s] Database constraint violation on %s %s", error_id, request.method, request.url.path)
    return JSONResponse(
        status_code=409,
        content={
            "detail": "This action conflicts with existing data (e.g. a duplicate or missing linked record). "
                       f"Nothing was saved. Reference: {error_id}",
            "error_id": error_id,
        },
    )


@app.exception_handler(Exception)
async def unhandled_exception_handler(request: Request, exc: Exception):
    error_id = uuid.uuid4().hex[:8].upper()
    logger.exception("[%s] Unhandled error on %s %s", error_id, request.method, request.url.path)
    return JSONResponse(
        status_code=500,
        content={
            "detail": f"{type(exc).__name__}: {str(exc)} (Reference: {error_id})",
            "error_id": error_id,
        },
    )

@app.middleware("http")
async def _record_request_health(request: Request, call_next):
    """Feeds the Admin App's System Health page (request count / errors / speed) - in-memory, costs nothing."""
    import time as _t
    from app.utils import system_health as _sh
    t0 = _t.perf_counter()
    try:
        response = await call_next(request)
    except Exception:
        _sh.record_request(_t.perf_counter() - t0, 500)
        raise
    if not request.url.path.endswith("/admin/system-health"):
        _sh.record_request(_t.perf_counter() - t0, response.status_code)
    return response


# CORS: required for the web versions of the apps (expo web / browser testing).
# Native phone apps don't enforce CORS, which is why they worked without this.
# Auth uses Bearer tokens (no cookies), so wildcard origins are safe here.
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(vendor.router, prefix="/api/users", tags=["Vendors"])
app.include_router(vehicle_owner.router, prefix="/api/users", tags=["VehicleOwner"])
app.include_router(car_details.router, prefix="/api/users", tags=["CarDetails"])
app.include_router(car_driver.router, prefix="/api/users", tags=["CarDriver"])
app.include_router(new_orders.router, prefix="/api/orders", tags=["NewOrders"])
app.include_router(hourly_rental.router, prefix="/api/orders", tags=["HourlyRental"])
app.include_router(orders.router, prefix="/api/orders", tags=["Orders"])
app.include_router(order_assignments.router, prefix="/api/assignments", tags=["OrderAssignments"])
app.include_router(order_assignments.router, prefix="/api/orders", tags=["OrderAssignments"])
app.include_router(transfer_transactions.router, prefix="/api", tags=["TransferTransactions"])
# Registered BEFORE admin.router - admin.py ends with a catch-all
# GET /admin/{admin_id} that would otherwise shadow /admin/announcements
# (same route-ordering hazard as payout-requests earlier).
from app.api.routes import workers as workers_router
app.include_router(workers_router.router, prefix="/api", tags=["Workers & Operations Hub"])
from app.api.routes import driver_tours as driver_tours_router
app.include_router(driver_tours_router.router, tags=["Driver Tours & Running Ledger"])
from app.api.routes import chat_media_public as chat_media_public_router
app.include_router(chat_media_public_router.router, prefix="/api", tags=["Chat media"])
from app.api.routes import driver_tariff as driver_tariff_router
app.include_router(driver_tariff_router.router, prefix="/api", tags=["Driver Tariff"])    # before admin.router (its catch-all /admin/{id})
from app.api.routes import website_booking_schedule as website_booking_schedule_router
app.include_router(website_booking_schedule_router.router, prefix="/api", tags=["Website Approvals"])
from app.api.routes import fleet_subscriptions as fleet_subscriptions_router
app.include_router(fleet_subscriptions_router.router, prefix="/api", tags=["Fleet Subscriptions"])      # before admin.router (its catch-all /admin/{id})
from app.api.routes import ai_training_routes
app.include_router(ai_training_routes.router, tags=["AI Training & Knowledge Hub"])
from app.api.routes import unified_google_auth
app.include_router(unified_google_auth.router, prefix="/api", tags=["Unified Google Auth"])
app.include_router(announcements_router.router, prefix="/api", tags=["Announcements"])
app.include_router(admin.router, prefix="/api", tags=["Admin"])
from app.api.routes import system_health as _system_health_routes
app.include_router(_system_health_routes.router, prefix="/api", tags=["SystemHealth"])
from app.api.routes import app_content as _app_content_routes
app.include_router(_app_content_routes.router, prefix="/api", tags=["AppContent"])
from app.api.routes import app_updates as _app_updates_routes
app.include_router(_app_updates_routes.router, prefix="/api", tags=["AppUpdates"])
app.include_router(wallet.router, prefix="/api", tags=["Wallet"]) 
app.include_router(notification.router, prefix="/api", tags=["notifications"]) 
app.include_router(cities_router.router, prefix="/api", tags=["Cities"])
app.include_router(geocode_router.router, prefix="/api", tags=["Geocode"])
from app.api.routes import subscriptions as subscriptions_router
app.include_router(subscriptions_router.router, prefix="/api", tags=["Subscriptions"])
app.include_router(customer.router, prefix="/api/users", tags=["Customer"])
# The Customer App calls /api/customer/* and /api/auth/* (no /users): same handlers, mounted where the app looks.
app.include_router(customer.router, prefix="/api", include_in_schema=False)
app.include_router(hybrid_auth_router.router, prefix="/api", tags=["CustomerAuth"])
app.include_router(customer_bookings.router, prefix="/api", tags=["CustomerBookings"])
app.include_router(website_bookings.router, prefix="/api", tags=["WebsiteBookings"])
from app.api.routes import chat as chat_router
app.include_router(chat_router.router)
from app.api.routes import booking_chat as booking_chat_router
app.include_router(booking_chat_router.router, prefix="/api", tags=["Booking Chat"])
from app.api.routes import trip_reviews as trip_reviews_router
app.include_router(trip_reviews_router.router, prefix="/api", tags=["Trip Review"])

from app.api.routes import document_verification
app.include_router(document_verification.router, prefix="/api", tags=["Document Verification"])

from app.api.routes import sos
app.include_router(sos.router, prefix="/api", tags=["SOS Alert"])

from app.api.routes import ai_automation_log_routes
app.include_router(ai_automation_log_routes.router, prefix="/api", tags=["AI Automation Logs"])

from app.api.routes import carpool_routes
app.include_router(carpool_routes.router, prefix="/api", tags=["CarPool & Shared Trips"])

from app.api.routes import drop_bid_routes
app.include_router(drop_bid_routes.router, prefix="/api", tags=["Drop Bid"])

from app.api.routes import ai_whatsapp_assistant
app.include_router(ai_whatsapp_assistant.router, prefix="/api", tags=["AI WhatsApp Assistant"])

from app.api.routes import support as support_router
app.include_router(support_router.router, prefix="/api", tags=["Support"])

from app.api.routes import crm_routes
app.include_router(crm_routes.router, prefix="/api", tags=["CRM & Marketing"])

from app.api.routes import driver_route_request_routes
app.include_router(driver_route_request_routes.router, prefix="/api", tags=["Driver Route Requests"])

from app.api.routes import unassigned_booking_routes
app.include_router(unassigned_booking_routes.router, prefix="/api", tags=["Unassigned Booking Auto-Removal"])

from app.api.routes import savaari_routes
app.include_router(savaari_routes.router, prefix="/api", tags=["Savaari Monitoring"])

# Self-service forgot-password (no SMS needed - identity proven with stored KYC data)
from app.api.routes import password_reset
app.include_router(password_reset.router, prefix="/api/users", tags=["PasswordReset"])

# Tax / GST Invoicing Hub (imported at top as tax_admin_router - was missing include_router call)
app.include_router(tax_admin_router.router, prefix="/api", tags=["Tax & GST Invoicing"])

from app.api.routes import own_fleet as own_fleet_router
app.include_router(own_fleet_router.router, prefix="/api", tags=["Own Fleet"])

from app.api.routes import quality as quality_router
app.include_router(quality_router.router, prefix="/api", tags=["Ratings & Quality"])
from app.api.routes import account_activity_routes as _activity_routes
app.include_router(_activity_routes.admin_router, prefix="/api", tags=["Active / Inactive"])
app.include_router(_activity_routes.owner_router, prefix="/api/users", tags=["Active / Inactive"])
from app.api.routes import admin_trip_close as _trip_close
from app.api.routes import billing_docs as _billing_docs
app.include_router(_billing_docs.router, prefix="/api", tags=["Invoices & Estimates"])
app.include_router(_billing_docs.public_router, prefix="/api", tags=["Invoices & Estimates (public link)"])
from app.api.routes import document_models as _doc_models
app.include_router(_doc_models.router, prefix="/api", tags=["Document Models"])
app.include_router(_trip_close.router, prefix="/api", tags=["Admin Trip Close"])

from app.api.routes import driver_ops as driver_ops_router
app.include_router(driver_ops_router.router, prefix="/api", tags=["Driver Lookup"])

from app.api.routes import fleet_swap as fleet_swap_router
app.include_router(fleet_swap_router.router, prefix="/api", tags=["Fleet Driver Swap"])

from app.api.routes import notification_sounds as notification_sounds_router
app.include_router(notification_sounds_router.router, prefix="/api", tags=["Notification Sounds"])

from app.api.routes import workers as workers_router
app.include_router(workers_router.router, prefix="/api", tags=["Workers & Operations Hub"])

from app.api.routes import driver_tours as driver_tours_router
app.include_router(driver_tours_router.router, tags=["Driver Tours, Fleet & Autopilot"])


@app.on_event("startup")
async def ensure_sos_alerts_and_swap_columns() -> None:
    """Lightweight migration: add lifecycle and enriched columns to sos_alerts,
    and ensure fleet_driver_swap_audit table and columns exist."""
    from sqlalchemy import text
    db = SessionLocal()
    statements = [
        # Never wait on a busy table at boot - skip and retry next start.
        "SET lock_timeout = '3s'",
        # SOS Alerts new columns
        "ALTER TABLE sos_alerts ADD COLUMN IF NOT EXISTS driver_id VARCHAR",
        "ALTER TABLE sos_alerts ADD COLUMN IF NOT EXISTS triggered_by_id VARCHAR",
        "ALTER TABLE sos_alerts ADD COLUMN IF NOT EXISTS triggered_by_role VARCHAR NOT NULL DEFAULT 'CUSTOMER'",
        "ALTER TABLE sos_alerts ADD COLUMN IF NOT EXISTS customer_phone VARCHAR",
        "ALTER TABLE sos_alerts ADD COLUMN IF NOT EXISTS driver_phone VARCHAR",
        "ALTER TABLE sos_alerts ADD COLUMN IF NOT EXISTS driver_name VARCHAR",
        "ALTER TABLE sos_alerts ADD COLUMN IF NOT EXISTS car_number VARCHAR",
        "ALTER TABLE sos_alerts ADD COLUMN IF NOT EXISTS acknowledged_by VARCHAR",
        "ALTER TABLE sos_alerts ADD COLUMN IF NOT EXISTS acknowledged_at TIMESTAMPTZ",
        "ALTER TABLE sos_alerts ADD COLUMN IF NOT EXISTS resolved_by VARCHAR",
        "ALTER TABLE sos_alerts ADD COLUMN IF NOT EXISTS resolved_at TIMESTAMPTZ",
        "ALTER TABLE sos_alerts ADD COLUMN IF NOT EXISTS resolution_notes TEXT",
        "ALTER TABLE sos_alerts ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()",
        # Backfill defaults on existing rows
        "UPDATE sos_alerts SET updated_at = created_at WHERE updated_at IS NULL AND created_at IS NOT NULL",
        "UPDATE sos_alerts SET triggered_by_role = 'CUSTOMER' WHERE triggered_by_role IS NULL",
        # fleet_driver_swap_audit already exists on prod from c92d94a (driver
        # swaps only, plaintext otp_code). create_all never adds columns.
        "ALTER TABLE fleet_driver_swap_audit ADD COLUMN IF NOT EXISTS swap_uuid UUID",
        "UPDATE fleet_driver_swap_audit SET swap_uuid = md5(random()::text || clock_timestamp()::text || id::text)::uuid WHERE swap_uuid IS NULL",
        "CREATE UNIQUE INDEX IF NOT EXISTS ix_fleet_driver_swap_audit_swap_uuid ON fleet_driver_swap_audit (swap_uuid)",
        "ALTER TABLE fleet_driver_swap_audit ALTER COLUMN swap_uuid SET NOT NULL",
        "ALTER TABLE fleet_driver_swap_audit ADD COLUMN IF NOT EXISTS swap_type VARCHAR NOT NULL DEFAULT 'DRIVER'",
        "ALTER TABLE fleet_driver_swap_audit ADD COLUMN IF NOT EXISTS car_id UUID",
        "ALTER TABLE fleet_driver_swap_audit ADD COLUMN IF NOT EXISTS car_number VARCHAR",
        "ALTER TABLE fleet_driver_swap_audit ADD COLUMN IF NOT EXISTS otp_hash VARCHAR",
        "ALTER TABLE fleet_driver_swap_audit ADD COLUMN IF NOT EXISTS otp_salt VARCHAR",
        "ALTER TABLE fleet_driver_swap_audit ALTER COLUMN driver_id DROP NOT NULL",
        "CREATE INDEX IF NOT EXISTS ix_fleet_driver_swap_audit_car_id ON fleet_driver_swap_audit (car_id)",
        "CREATE INDEX IF NOT EXISTS ix_fleet_driver_swap_audit_car_number ON fleet_driver_swap_audit (car_number)",
        # Naive UTC -> TIMESTAMPTZ, only while the column is still naive.
        """DO $$ BEGIN IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = current_schema() AND table_name = 'fleet_driver_swap_audit' AND column_name = 'otp_expires_at' AND data_type = 'timestamp without time zone') THEN ALTER TABLE fleet_driver_swap_audit ALTER COLUMN otp_expires_at TYPE TIMESTAMPTZ USING otp_expires_at AT TIME ZONE 'UTC'; END IF; END $$""",
        # Pooled connection goes back to normal request use afterwards.
        "RESET lock_timeout",
    ]
    for stmt in statements:
        try:
            db.execute(text(stmt))
            db.commit()
        except Exception as e:
            db.rollback()
            print(f"SOS alert migration step failed (continuing): {stmt} -> {e}")
    db.close()



@app.on_event("startup")
async def ensure_admin_token_version_column() -> None:
    """Lightweight migration: add admin.token_version if missing (create_all does not add columns)."""
    from sqlalchemy import text
    db = SessionLocal()
    try:
        db.execute(text('ALTER TABLE admin ADD COLUMN IF NOT EXISTS token_version INTEGER NOT NULL DEFAULT 1'))
        db.commit()
    except Exception as e:
        db.rollback()
        print(f"admin token_version migration failed (continuing): {e}")
    finally:
        db.close()


@app.on_event("startup")
async def ensure_admin_add_money_admin_id_column() -> None:
    """Lightweight migration: admin_add_money_to_vehicle_owner had no way
    to record WHICH admin credited a given amount - no admin_id column at
    all, so there was no audit trail for who performed a wallet credit."""
    from sqlalchemy import text
    db = SessionLocal()
    try:
        db.execute(text('ALTER TABLE admin_add_money_to_vehicle_owner ADD COLUMN IF NOT EXISTS admin_id UUID'))
        db.commit()
    except Exception as e:
        db.rollback()
        print(f"admin_add_money admin_id migration failed (continuing): {e}")
    finally:
        db.close()


@app.on_event("startup")
async def ensure_vendor_wallet_ledger_reference_columns() -> None:
    """Lightweight migration: vendor_wallet_ledger needs reference_id/
    reference_type (same pattern wallet_ledger already has) so a specific
    hold (e.g. DRIVER_PAYOUT_HOLD) can be found and released later - without
    these columns that lookup in crud/end_records.py can't run at all."""
    from sqlalchemy import text
    db = SessionLocal()
    try:
        db.execute(text('ALTER TABLE vendor_wallet_ledger ADD COLUMN IF NOT EXISTS reference_id VARCHAR'))
        db.execute(text('ALTER TABLE vendor_wallet_ledger ADD COLUMN IF NOT EXISTS reference_type VARCHAR'))
        db.commit()
    except Exception as e:
        db.rollback()
        print(f"vendor_wallet_ledger reference columns migration failed (continuing): {e}")
    finally:
        db.close()


@app.on_event("startup")
async def ensure_extra_kyc_document_columns() -> None:
    """Lightweight migration: add optional KYC document columns (create_all does not add columns to existing tables)."""
    from sqlalchemy import text
    db = SessionLocal()
    statements = [
        'ALTER TABLE vehicle_owner_details ADD COLUMN IF NOT EXISTS aadhar_back_img VARCHAR',
        'ALTER TABLE vehicle_owner_details ADD COLUMN IF NOT EXISTS aadhar_back_status document_status_enum DEFAULT \'PENDING\'',
        'ALTER TABLE vehicle_owner_details ADD COLUMN IF NOT EXISTS pan_number VARCHAR',
        'ALTER TABLE vehicle_owner_details ADD COLUMN IF NOT EXISTS pan_img VARCHAR',
        'ALTER TABLE vehicle_owner_details ADD COLUMN IF NOT EXISTS pan_status document_status_enum DEFAULT \'PENDING\'',
        'ALTER TABLE car_driver ADD COLUMN IF NOT EXISTS licence_back_img VARCHAR',
        'ALTER TABLE car_driver ADD COLUMN IF NOT EXISTS licence_back_status document_status_enum DEFAULT \'PENDING\'',
        'ALTER TABLE car_driver ADD COLUMN IF NOT EXISTS is_owner_driver BOOLEAN NOT NULL DEFAULT false',
        'ALTER TABLE car_driver ADD COLUMN IF NOT EXISTS aadhar_number VARCHAR',
        'ALTER TABLE trip_reviews ADD COLUMN IF NOT EXISTS bonus_amount INTEGER',
        'ALTER TABLE trip_reviews ADD COLUMN IF NOT EXISTS bonus_paid_at TIMESTAMPTZ',
        'ALTER TABLE trip_reviews ADD COLUMN IF NOT EXISTS flagged BOOLEAN NOT NULL DEFAULT false',
        'ALTER TABLE end_records ADD COLUMN IF NOT EXISTS distance_flagged BOOLEAN NOT NULL DEFAULT false',
        'ALTER TABLE end_records ADD COLUMN IF NOT EXISTS distance_reason TEXT',
        'ALTER TABLE end_records ADD COLUMN IF NOT EXISTS customer_rating INTEGER',
        'ALTER TABLE end_records ADD COLUMN IF NOT EXISTS customer_feedback TEXT',
        'ALTER TABLE end_records ADD COLUMN IF NOT EXISTS amount_paid_total INTEGER',
        'ALTER TABLE end_records ADD COLUMN IF NOT EXISTS other_extras_collected INTEGER',
        'ALTER TABLE end_records ADD COLUMN IF NOT EXISTS completion_at TIMESTAMPTZ',
        'ALTER TABLE car_driver ADD COLUMN IF NOT EXISTS aadhar_front_img VARCHAR',
        'ALTER TABLE car_driver ADD COLUMN IF NOT EXISTS aadhar_front_status document_status_enum DEFAULT \'PENDING\'',
        'ALTER TABLE car_driver ADD COLUMN IF NOT EXISTS aadhar_back_img VARCHAR',
        'ALTER TABLE car_driver ADD COLUMN IF NOT EXISTS aadhar_back_status document_status_enum DEFAULT \'PENDING\'',
        'ALTER TABLE vehicle_owner_details ADD COLUMN IF NOT EXISTS vacant_cities VARCHAR[]',
        'ALTER TABLE vehicle_owner_details ADD COLUMN IF NOT EXISTS vacant_cities_updated_at TIMESTAMPTZ',
        'ALTER TABLE vehicle_owner_details ADD COLUMN IF NOT EXISTS vacant_driver_id VARCHAR',
        'ALTER TABLE vehicle_owner_details ADD COLUMN IF NOT EXISTS vacant_driver_name VARCHAR',
        'ALTER TABLE vehicle_owner_details ADD COLUMN IF NOT EXISTS vacant_car_id VARCHAR',
        'ALTER TABLE vehicle_owner_details ADD COLUMN IF NOT EXISTS vacant_car_number VARCHAR',
        # Yearly-fee billing columns (dormant until an admin enables billing)
        'ALTER TABLE vehicle_owner_details ADD COLUMN IF NOT EXISTS billing_next_date DATE',
        'ALTER TABLE vehicle_owner_details ADD COLUMN IF NOT EXISTS billing_last_charged_at TIMESTAMPTZ',
        'ALTER TABLE vehicle_owner_details ADD COLUMN IF NOT EXISTS billing_suspended BOOLEAN NOT NULL DEFAULT false',
        # Yearly registration/attachment fee paid via Razorpay (verification screen)
        'ALTER TABLE vehicle_owner_details ADD COLUMN IF NOT EXISTS registration_fee_paid_at TIMESTAMPTZ',
        # Booking-level trip OTPs, shown to the vendor right after posting (2026-09-30)
        'ALTER TABLE orders ADD COLUMN IF NOT EXISTS waiting_minutes INTEGER',
        'ALTER TABLE orders ADD COLUMN IF NOT EXISTS closing_breakdown JSON',
        'ALTER TABLE orders ADD COLUMN IF NOT EXISTS start_trip_otp VARCHAR',
        'ALTER TABLE orders ADD COLUMN IF NOT EXISTS end_trip_otp VARCHAR',
        'ALTER TABLE orders ADD COLUMN IF NOT EXISTS customer_phone_reveal_at TIMESTAMPTZ',
        'ALTER TABLE orders ADD COLUMN IF NOT EXISTS commission_percent DOUBLE PRECISION',
        'ALTER TABLE admin ADD COLUMN IF NOT EXISTS last_seen_at TIMESTAMPTZ',
        'ALTER TABLE customer_booking_requests ADD COLUMN IF NOT EXISTS hold_until TIMESTAMPTZ',
        'ALTER TABLE customer_booking_requests ADD COLUMN IF NOT EXISTS escalated_at TIMESTAMPTZ',
        'ALTER TABLE customer_booking_requests ADD COLUMN IF NOT EXISTS post_at_override TIMESTAMPTZ',
        'ALTER TABLE customer_booking_requests ADD COLUMN IF NOT EXISTS custom_driver_fare BOOLEAN NOT NULL DEFAULT false',
        'ALTER TABLE guest_help_tokens ADD COLUMN IF NOT EXISTS language VARCHAR(2)',
        'ALTER TABLE vehicle_owner_details ADD COLUMN IF NOT EXISTS billing_suspended_at TIMESTAMPTZ',
        'ALTER TABLE vehicle_owner_details ADD COLUMN IF NOT EXISTS billing_suspended_by VARCHAR',
        'ALTER TABLE vehicle_owner_details ADD COLUMN IF NOT EXISTS billing_suspended_reason VARCHAR',
        'ALTER TABLE vehicle_owner_details ADD COLUMN IF NOT EXISTS subscription_payment_channel VARCHAR',
        'ALTER TABLE vehicle_owner_details ADD COLUMN IF NOT EXISTS subscription_payment_ref VARCHAR',
        'ALTER TABLE vehicle_owner_details ADD COLUMN IF NOT EXISTS subscription_paid_amount NUMERIC(10,2)',
        'ALTER TABLE vehicle_owner_details ADD COLUMN IF NOT EXISTS subscription_paid_at TIMESTAMPTZ',
        'ALTER TABLE guest_help_tokens ADD COLUMN IF NOT EXISTS reason VARCHAR(100)',
        # Trusted Partner (tier=PREFERRED) - two extra grant paths alongside
        # the yearly-billing evidence above (2026-09-30)
        'ALTER TABLE vehicle_owner_details ADD COLUMN IF NOT EXISTS admin_trusted_override BOOLEAN NOT NULL DEFAULT false',
        'ALTER TABLE vehicle_owner_details ADD COLUMN IF NOT EXISTS trusted_override_by VARCHAR',
        'ALTER TABLE vehicle_owner_details ADD COLUMN IF NOT EXISTS trusted_override_reason VARCHAR',
        'ALTER TABLE vehicle_owner_details ADD COLUMN IF NOT EXISTS trusted_override_at TIMESTAMPTZ',
        'ALTER TABLE vehicle_owner_details ADD COLUMN IF NOT EXISTS driver_pro_trusted_until TIMESTAMPTZ',
        # Key/value platform settings (yearly fee, suspend threshold, billing master switch)
        'CREATE TABLE IF NOT EXISTS platform_settings (key VARCHAR PRIMARY KEY, value VARCHAR NOT NULL, updated_at TIMESTAMPTZ NOT NULL DEFAULT now())',
        # Human-friendly registration IDs (YY + serial of the year, unique across all account types)
        'ALTER TABLE vendor ADD COLUMN IF NOT EXISTS reg_id VARCHAR',
        'ALTER TABLE vehicle_owner ADD COLUMN IF NOT EXISTS reg_id VARCHAR',
        'ALTER TABLE car_driver ADD COLUMN IF NOT EXISTS reg_id VARCHAR',
        'CREATE UNIQUE INDEX IF NOT EXISTS idx_vendor_reg_id ON vendor (reg_id)',
        'CREATE UNIQUE INDEX IF NOT EXISTS idx_vehicle_owner_reg_id ON vehicle_owner (reg_id)',
        'CREATE UNIQUE INDEX IF NOT EXISTS idx_car_driver_reg_id ON car_driver (reg_id)',
        # Optional email for OTP reset + notifications (existing users unaffected)
        'ALTER TABLE vendor ADD COLUMN IF NOT EXISTS email VARCHAR',
        'ALTER TABLE vendor ADD COLUMN IF NOT EXISTS email_verified BOOLEAN NOT NULL DEFAULT false',
        'ALTER TABLE vehicle_owner ADD COLUMN IF NOT EXISTS email VARCHAR',
        'ALTER TABLE vehicle_owner ADD COLUMN IF NOT EXISTS email_verified BOOLEAN NOT NULL DEFAULT false',
        'ALTER TABLE car_driver ADD COLUMN IF NOT EXISTS email VARCHAR',
        'ALTER TABLE car_driver ADD COLUMN IF NOT EXISTS email_verified BOOLEAN NOT NULL DEFAULT false',
        # These CarDriver columns exist in models/car_driver.py but were
        # never actually added here - every ORM query against car_driver
        # (SELECT *, via SQLAlchemy) was failing in production with
        # UndefinedColumn the moment it hit wallet_balance, breaking driver
        # signup, login, and any other car_driver read. Discovered while
        # testing this session's own-cum-driver signup fix - genuinely
        # pre-existing, not something this session's other changes caused.
        'ALTER TABLE car_driver ADD COLUMN IF NOT EXISTS licence_verification_source VARCHAR',
        'ALTER TABLE car_driver ADD COLUMN IF NOT EXISTS licence_expiry_date DATE',
        'ALTER TABLE car_driver ADD COLUMN IF NOT EXISTS permanently_blocked BOOLEAN NOT NULL DEFAULT false',
        'ALTER TABLE car_driver ADD COLUMN IF NOT EXISTS permanently_blocked_reason VARCHAR',
        'ALTER TABLE car_driver ADD COLUMN IF NOT EXISTS wallet_balance INTEGER NOT NULL DEFAULT 0',
        "ALTER TABLE car_driver ADD COLUMN IF NOT EXISTS subscription_tier VARCHAR DEFAULT 'FREE'",
        'ALTER TABLE car_driver ADD COLUMN IF NOT EXISTS subscription_expires_at TIMESTAMPTZ',
        'ALTER TABLE car_driver ADD COLUMN IF NOT EXISTS auto_renew_from_wallet BOOLEAN NOT NULL DEFAULT true',
        'ALTER TABLE car_driver ADD COLUMN IF NOT EXISTS pending_profile_edits JSON',
        # Same class of gap as car_driver above, found by the same schema
        # diagnostic on customer_details.
        'ALTER TABLE customer_details ADD COLUMN IF NOT EXISTS wallet_balance INTEGER NOT NULL DEFAULT 0',
        "ALTER TABLE customer_details ADD COLUMN IF NOT EXISTS subscription_tier VARCHAR DEFAULT 'FREE'",
        'ALTER TABLE customer_details ADD COLUMN IF NOT EXISTS subscription_expires_at TIMESTAMPTZ',
        'ALTER TABLE customer_details ADD COLUMN IF NOT EXISTS auto_renew_from_wallet BOOLEAN NOT NULL DEFAULT true',
        'ALTER TABLE customer_details ADD COLUMN IF NOT EXISTS is_verified_carpooler BOOLEAN NOT NULL DEFAULT false',
        # Vendor-editable acceptance deadline (default pickup+15min, set at
        # order creation). Nullable so existing/old orders fall back to the
        # old pickup+15min sweep behavior.
        'ALTER TABLE orders ADD COLUMN IF NOT EXISTS acceptance_deadline TIMESTAMPTZ',
        # Make vendor_id nullable on orders and new_orders tables to support vendor_id-less platform bookings
        'ALTER TABLE orders ALTER COLUMN vendor_id DROP NOT NULL',
        'ALTER TABLE new_orders ALTER COLUMN vendor_id DROP NOT NULL',
        # Hourly Rental booked by Admin with no vendor (was NOT NULL -> IntegrityError on confirm)
        'ALTER TABLE hourly_rental ALTER COLUMN vendor_id DROP NOT NULL',
        # Round Trip "return" / Multi City "drop" date+time (nullable - Oneway
        # and Hourly Rental don't use it; old rows have none)
        'ALTER TABLE new_orders ADD COLUMN IF NOT EXISTS end_date_time TIMESTAMPTZ',
        'ALTER TABLE orders ADD COLUMN IF NOT EXISTS end_date_time TIMESTAMPTZ',
        # Quote-review distance override (booking-only - never touches the
        # route_distances cache). calculated_trip_distance keeps the original
        # Maps/cache figure so admin can see both when distance_edited=true.
        'ALTER TABLE new_orders ADD COLUMN IF NOT EXISTS distance_edited BOOLEAN NOT NULL DEFAULT false',
        'ALTER TABLE new_orders ADD COLUMN IF NOT EXISTS calculated_trip_distance INTEGER',
        'ALTER TABLE orders ADD COLUMN IF NOT EXISTS distance_edited BOOLEAN NOT NULL DEFAULT false',
        'ALTER TABLE orders ADD COLUMN IF NOT EXISTS calculated_trip_distance INTEGER',
        # Per-stop address/maps links (booking-only, shown to drivers before accepting).
        'ALTER TABLE new_orders ADD COLUMN IF NOT EXISTS location_links JSON',
        'ALTER TABLE orders ADD COLUMN IF NOT EXISTS location_links JSON',
        # Special requirements the vendor can opt into when posting a trip
        # (both off/null by default = no special requirement). The driver
        # app warns in red before accept when either is set.
        'ALTER TABLE new_orders ADD COLUMN IF NOT EXISTS car_make_year_requirement INTEGER',
        'ALTER TABLE new_orders ADD COLUMN IF NOT EXISTS carrier_required BOOLEAN NOT NULL DEFAULT false',
        'ALTER TABLE orders ADD COLUMN IF NOT EXISTS car_make_year_requirement INTEGER',
        'ALTER TABLE orders ADD COLUMN IF NOT EXISTS carrier_required BOOLEAN NOT NULL DEFAULT false',
        # Aggregate 1-5 star customer ratings for drivers and cars (see
        # models/rating.py - Rating table holds the individual submissions,
        # these two columns cache the running average + count).
        'ALTER TABLE car_driver ADD COLUMN IF NOT EXISTS rating_avg FLOAT NOT NULL DEFAULT 0',
        'ALTER TABLE car_driver ADD COLUMN IF NOT EXISTS rating_count INTEGER NOT NULL DEFAULT 0',
        'ALTER TABLE car_details ADD COLUMN IF NOT EXISTS rating_avg FLOAT NOT NULL DEFAULT 0',
        'ALTER TABLE car_details ADD COLUMN IF NOT EXISTS rating_count INTEGER NOT NULL DEFAULT 0',
        # Opt-in auto-renewal of the yearly fee from wallet balance (off by
        # default - today's billing sweep auto-debits everyone unconditionally).
        'ALTER TABLE vehicle_owner_details ADD COLUMN IF NOT EXISTS auto_renew_from_wallet BOOLEAN NOT NULL DEFAULT false',
        # Local Bookings: driver's chosen home city to receive Local trips.
        'ALTER TABLE vehicle_owner_details ADD COLUMN IF NOT EXISTS local_city VARCHAR',
        # Multi-city version - a driver can pick several cities, or ["ALL"].
        'ALTER TABLE vehicle_owner_details ADD COLUMN IF NOT EXISTS local_cities VARCHAR[]',
        # Monthly subscription plan (forced auto-debit, Preferred-tier) + referral program.
        'ALTER TABLE vehicle_owner_details ADD COLUMN IF NOT EXISTS subscription_type VARCHAR',
        'ALTER TABLE vehicle_owner_details ADD COLUMN IF NOT EXISTS referral_code VARCHAR',
        'ALTER TABLE vehicle_owner_details ADD COLUMN IF NOT EXISTS referred_by_code VARCHAR',
        'ALTER TABLE vehicle_owner_details ADD COLUMN IF NOT EXISTS referral_bonus_credited BOOLEAN NOT NULL DEFAULT false',
        'CREATE UNIQUE INDEX IF NOT EXISTS ix_vehicle_owner_details_referral_code_unique ON vehicle_owner_details (referral_code) WHERE referral_code IS NOT NULL',
        # Cash-mismatch audit flag on trip end records.
        'ALTER TABLE end_records ADD COLUMN IF NOT EXISTS cash_mismatch_flagged BOOLEAN NOT NULL DEFAULT false',
        'ALTER TABLE end_records ADD COLUMN IF NOT EXISTS cash_mismatch_amount INTEGER',
        'ALTER TABLE end_records ADD COLUMN IF NOT EXISTS cash_mismatch_cleared BOOLEAN NOT NULL DEFAULT false',
        # Priority window: only Preferred-tier drivers can accept before the
        # cutoff (on by default; vendor can turn it off per booking).
        'ALTER TABLE new_orders ADD COLUMN IF NOT EXISTS priority_for_paid BOOLEAN NOT NULL DEFAULT true',
        'ALTER TABLE new_orders ADD COLUMN IF NOT EXISTS priority_cutoff_at TIMESTAMPTZ',
        'ALTER TABLE orders ADD COLUMN IF NOT EXISTS priority_for_paid BOOLEAN NOT NULL DEFAULT true',
        'ALTER TABLE orders ADD COLUMN IF NOT EXISTS priority_cutoff_at TIMESTAMPTZ',
        'ALTER TABLE order_assignments ADD COLUMN IF NOT EXISTS accepted_tier VARCHAR',
        # These OrderAssignment columns exist in models/order_assignments.py
        # but were never actually added here either (same class of bug just
        # fixed for car_driver above) - broke driver/assigned-orders (the
        # feed quick-dashboard.tsx, My Bookings, and My Rides all depend on)
        # with an UndefinedColumn 500 the moment it hit revised_offer_price.
        'ALTER TABLE order_assignments ADD COLUMN IF NOT EXISTS last_lat VARCHAR',
        'ALTER TABLE order_assignments ADD COLUMN IF NOT EXISTS last_lng VARCHAR',
        'ALTER TABLE order_assignments ADD COLUMN IF NOT EXISTS revised_offer_price INTEGER',
        'ALTER TABLE order_assignments ADD COLUMN IF NOT EXISTS rebid_status VARCHAR',
        'ALTER TABLE order_assignments ADD COLUMN IF NOT EXISTS last_location_at TIMESTAMPTZ',
        'ALTER TABLE order_assignments ADD COLUMN IF NOT EXISTS trip_link_token VARCHAR',
        'ALTER TABLE order_assignments ADD COLUMN IF NOT EXISTS tracking_left_at TIMESTAMPTZ',
        # Fare transparency (all-inclusive vs itemized + named charge
        # breakdown). New enum type - create_all won't retrofit it onto the
        # already-existing orders/new_orders tables, so it's created here
        # like every other post-launch column in this list.
        "CREATE TYPE fare_type_enum AS ENUM ('ALL_INCLUSIVE', 'ITEMIZED')",
        "ALTER TABLE new_orders ADD COLUMN IF NOT EXISTS fare_type fare_type_enum NOT NULL DEFAULT 'ITEMIZED'",
        'ALTER TABLE new_orders ADD COLUMN IF NOT EXISTS charge_items JSON',
        "ALTER TABLE orders ADD COLUMN IF NOT EXISTS fare_type fare_type_enum NOT NULL DEFAULT 'ITEMIZED'",
        'ALTER TABLE orders ADD COLUMN IF NOT EXISTS charge_items JSON',
        # Cash settlement: advance collected upfront (vendor-set at posting)
        # vs. cash the driver actually collects at trip end.
        'ALTER TABLE new_orders ADD COLUMN IF NOT EXISTS advance_received INTEGER',
        'ALTER TABLE orders ADD COLUMN IF NOT EXISTS advance_received INTEGER',
        'ALTER TABLE end_records ADD COLUMN IF NOT EXISTS cash_collection INTEGER',
        'ALTER TABLE notifications ADD COLUMN IF NOT EXISTS muted_until TIMESTAMPTZ',
        'ALTER TABLE notifications ADD COLUMN IF NOT EXISTS sound_channels JSON',
        'ALTER TABLE orders ADD COLUMN IF NOT EXISTS urgent_notify_count INTEGER NOT NULL DEFAULT 0',
        'ALTER TABLE order_assignments ADD COLUMN IF NOT EXISTS deadline_warning_stage INTEGER NOT NULL DEFAULT 0',
        # Website "Urgent" advance-paid flag, mirrored from the source
        # CustomerBookingRequest onto the Order once posted (see
        # models/orders.py) - was missing its own migration line.
        "ALTER TABLE orders ADD COLUMN IF NOT EXISTS is_urgent BOOLEAN NOT NULL DEFAULT false",
        'ALTER TABLE orders ADD COLUMN IF NOT EXISTS commission_waived BOOLEAN NOT NULL DEFAULT false',
        'ALTER TABLE new_orders ADD COLUMN IF NOT EXISTS commission_waived BOOLEAN NOT NULL DEFAULT false',
        'ALTER TABLE orders ADD COLUMN IF NOT EXISTS total_booking_amount INTEGER',
        'ALTER TABLE new_orders ADD COLUMN IF NOT EXISTS total_booking_amount INTEGER',
        'ALTER TABLE orders ADD COLUMN IF NOT EXISTS extra_amount INTEGER',
        'ALTER TABLE new_orders ADD COLUMN IF NOT EXISTS extra_amount INTEGER',
        'ALTER TABLE orders ADD COLUMN IF NOT EXISTS waiting_hours_included INTEGER',
        'ALTER TABLE new_orders ADD COLUMN IF NOT EXISTS waiting_hours_included INTEGER',
        'ALTER TABLE orders ADD COLUMN IF NOT EXISTS executed_platform VARCHAR',
        'ALTER TABLE new_orders ADD COLUMN IF NOT EXISTS executed_platform VARCHAR',
        # Same column also lives on new_orders (see models/new_orders.py) -
        # missing here too, breaking every vendor-posted booking (oneway/
        # roundtrip/multicity confirm) with a raw UndefinedColumn 400.
        "ALTER TABLE new_orders ADD COLUMN IF NOT EXISTS is_urgent BOOLEAN NOT NULL DEFAULT false",
        # Same column also lives on hourly_rental (see models/hourly_rental.py,
        # crud/hourly_rental.py already sets is_urgent=is_urgent_pickup(...))
        # - the standalone run_hourly_rental_is_urgent_migration.py script
        # covered this but was never wired into startup, so it never ran
        # against production. Missing here breaks every hourly-rental booking
        # creation with a raw UndefinedColumn 400.
        "ALTER TABLE hourly_rental ADD COLUMN IF NOT EXISTS is_urgent BOOLEAN NOT NULL DEFAULT false",
        # Trip start/end OTP verification (see api/routes/order_assignments.py)
        # - also missing its own migration line.
        'ALTER TABLE order_assignments ADD COLUMN IF NOT EXISTS start_trip_otp VARCHAR',
        'ALTER TABLE order_assignments ADD COLUMN IF NOT EXISTS end_trip_otp VARCHAR',
        # All-Inclusive pricing (see models/new_orders.py for the
        # source-of-truth comment) - crud/end_records.py's commission rule
        # reads these via getattr() so it never crashed, but silently always
        # got None/0 for every ALL_INCLUSIVE booking without these columns.
        'ALTER TABLE new_orders ADD COLUMN IF NOT EXISTS total_booking_amount INTEGER',
        'ALTER TABLE new_orders ADD COLUMN IF NOT EXISTS extra_amount INTEGER',
        'ALTER TABLE new_orders ADD COLUMN IF NOT EXISTS waiting_hours_included INTEGER',
        'ALTER TABLE orders ADD COLUMN IF NOT EXISTS total_booking_amount INTEGER',
        'ALTER TABLE orders ADD COLUMN IF NOT EXISTS extra_amount INTEGER',
        'ALTER TABLE orders ADD COLUMN IF NOT EXISTS waiting_hours_included INTEGER',
        # Audit record of what the driver actually collected for each
        # non-bundled charge_item (see models/end_records.py) - kept
        # separate from cash_collection since these are never part of the
        # profit split.
        'ALTER TABLE end_records ADD COLUMN IF NOT EXISTS extra_charges_collected JSON',
        # Drop Connect (carpool journeys) - real driver auth wiring, was
        # previously fully unauthenticated with no link to a real driver.
        'ALTER TABLE carpool_journeys ADD COLUMN IF NOT EXISTS driver_id UUID',
        'ALTER TABLE carpool_journeys ADD COLUMN IF NOT EXISTS vehicle_owner_id UUID',
        'ALTER TABLE carpool_journeys ADD COLUMN IF NOT EXISTS intermediate_stops JSON',
        'ALTER TABLE carpool_journeys ADD COLUMN IF NOT EXISTS is_auto_accept BOOLEAN NOT NULL DEFAULT false',
        # Driver App's Create Booking now broadcasts to the open driver pool
        # instead of self-assigning - this tracks who posted it, so the
        # posting bonus still goes to them at trip close regardless of
        # which driver actually accepts and drives it (see
        # order_assignments.py's driver_create_booking_confirm and
        # crud/end_records.py's update_end_trip_record).
        'ALTER TABLE orders ADD COLUMN IF NOT EXISTS posted_by_vehicle_owner_id UUID',
        'ALTER TABLE new_orders ADD COLUMN IF NOT EXISTS posted_by_vehicle_owner_id UUID',
    ]
    for stmt in statements:
        try:
            db.execute(text(stmt))
            db.commit()
        except Exception as e:
            db.rollback()
            print(f"KYC column migration step failed (continuing): {stmt} -> {e}")
    db.close()


@app.on_event("startup")
async def ensure_vacant_cities_cleared_after_24h() -> None:
    """Clear out any vacant city updates that are older than 24 hours or have a NULL updated_at."""
    from sqlalchemy import text
    db = SessionLocal()
    try:
        db.execute(text("""
            UPDATE vehicle_owner_details
            SET vacant_cities = NULL,
                vacant_cities_updated_at = NULL,
                vacant_driver_id = NULL,
                vacant_driver_name = NULL,
                vacant_car_id = NULL,
                vacant_car_number = NULL
            WHERE vacant_cities IS NOT NULL
              AND (
                vacant_cities_updated_at IS NULL 
                OR vacant_cities_updated_at < NOW() - INTERVAL '24 hours'
              )
        """))
        db.commit()
    except Exception as e:
        db.rollback()
        print(f"Vacant cities 24h cleanup failed: {e}")
    finally:
        db.close()


@app.on_event("startup")
async def ensure_new_car_type_enum_values() -> None:
    """Lightweight migration: add Tempo Traveller / Urbania values to both
    Postgres car-type enum types (create_all does not add labels to an enum
    type that already exists - Postgres requires ALTER TYPE ... ADD VALUE).
    There are two distinct physical enum types in this DB despite both being
    named "CarTypeEnum" in Python: car_details.py uses SqlEnum(..., name=
    "car_type_enum") (unquoted, folds to lowercase) while new_orders.py /
    orders.py / hourly_rental.py use name="CAR_TYPE_ENUM" (mixed-case, so
    Postgres stores/quotes it separately) - confirmed via pg_type. Each
    statement commits on its own since ADD VALUE can't run inside a
    multi-statement transaction that also uses the new value."""
    from sqlalchemy import text
    db = SessionLocal()
    new_values = [
        'TEMPO_TRAVELLER_12', 'TEMPO_TRAVELLER_14', 'TEMPO_TRAVELLER_18',
        'URBANIA_12', 'URBANIA_14', 'URBANIA_16',
    ]
    enum_types = ['car_type_enum', '"CAR_TYPE_ENUM"']
    for enum_type in enum_types:
        for value in new_values:
            try:
                db.execute(text(f"ALTER TYPE {enum_type} ADD VALUE IF NOT EXISTS '{value}'"))
                db.commit()
            except Exception as e:
                db.rollback()
                print(f"{enum_type} migration step failed (continuing): {value} -> {e}")
    db.close()


@app.on_event("startup")
async def ensure_local_order_type_enum_value() -> None:
    """Lightweight migration: add 'LOCAL' to the Postgres ORDER_TYPE_ENUM type
    (Phase 06 - create_all does not add labels to an enum type that already
    exists, Postgres requires ALTER TYPE ... ADD VALUE). SQLAlchemy's SqlEnum
    persists the Python enum member's NAME (e.g. 'ONEWAY'), not its .value
    ("Oneway") - confirmed via pg_enum against the existing rows - so the
    label to add is 'LOCAL', matching OrderTypeEnum.LOCAL's member name."""
    from sqlalchemy import text
    db = SessionLocal()
    try:
        db.execute(text('ALTER TYPE "ORDER_TYPE_ENUM" ADD VALUE IF NOT EXISTS \'LOCAL\''))
        db.commit()
    except Exception as e:
        db.rollback()
        print(f"ORDER_TYPE_ENUM Local value migration failed (continuing): {e}")
    finally:
        db.close()


@app.on_event("startup")
async def ensure_document_status_needs_review_value() -> None:
    """Lightweight migration: add 'NEEDS_REVIEW' to the Postgres
    document_status_enum type (shared by vehicle_owner/car/driver/vendor
    document status columns - create_all does not add labels to an enum
    type that already exists, Postgres requires ALTER TYPE ... ADD VALUE)."""
    from sqlalchemy import text
    db = SessionLocal()
    try:
        db.execute(text("ALTER TYPE document_status_enum ADD VALUE IF NOT EXISTS 'NEEDS_REVIEW'"))
        db.commit()
    except Exception as e:
        db.rollback()
        print(f"document_status_enum NEEDS_REVIEW migration failed (continuing): {e}")
    finally:
        db.close()


@app.on_event("startup")
async def ensure_target_driver_id_columns() -> None:
    """Lightweight migration: target_driver_id on new_orders/orders, for
    posting a booking directly to one driver instead of a city broadcast."""
    from sqlalchemy import text
    db = SessionLocal()
    statements = [
        'ALTER TABLE new_orders ADD COLUMN IF NOT EXISTS target_driver_id UUID REFERENCES car_driver(id)',
        'ALTER TABLE orders ADD COLUMN IF NOT EXISTS target_driver_id UUID REFERENCES car_driver(id)',
    ]
    for stmt in statements:
        try:
            db.execute(text(stmt))
            db.commit()
        except Exception as e:
            db.rollback()
            print(f"target_driver_id migration step failed (continuing): {stmt} -> {e}")
    db.close()


@app.on_event("startup")
async def ensure_wallet_payout_overhaul_columns() -> None:
    """Lightweight migration: held_amount snapshot on order_assignments,
    bank/UPI payout details on vehicle_owner_details + vendor_details, and
    generalizing payout_requests to cover vendors too (vendor_id + paid_via)."""
    from sqlalchemy import text
    db = SessionLocal()
    statements = [
        'ALTER TABLE order_assignments ADD COLUMN IF NOT EXISTS held_amount INTEGER',
        'ALTER TABLE vehicle_owner_details ADD COLUMN IF NOT EXISTS bank_account_number VARCHAR',
        'ALTER TABLE vehicle_owner_details ADD COLUMN IF NOT EXISTS bank_ifsc VARCHAR',
        'ALTER TABLE vehicle_owner_details ADD COLUMN IF NOT EXISTS bank_account_holder_name VARCHAR',
        'ALTER TABLE vehicle_owner_details ADD COLUMN IF NOT EXISTS upi_id VARCHAR',
        'ALTER TABLE vendor_details ADD COLUMN IF NOT EXISTS bank_account_number VARCHAR',
        'ALTER TABLE vendor_details ADD COLUMN IF NOT EXISTS bank_ifsc VARCHAR',
        'ALTER TABLE vendor_details ADD COLUMN IF NOT EXISTS bank_account_holder_name VARCHAR',
        'ALTER TABLE vendor_details ADD COLUMN IF NOT EXISTS upi_id VARCHAR',
        'ALTER TABLE vendor_details ADD COLUMN IF NOT EXISTS business_name VARCHAR',
        'ALTER TABLE payout_requests ADD COLUMN IF NOT EXISTS vendor_id UUID REFERENCES vendor(id)',
        'ALTER TABLE payout_requests ADD COLUMN IF NOT EXISTS paid_via VARCHAR',
        'ALTER TABLE payout_requests ADD COLUMN IF NOT EXISTS initiated_by_admin BOOLEAN NOT NULL DEFAULT FALSE',
        'ALTER TABLE payout_requests ALTER COLUMN vehicle_owner_id DROP NOT NULL',
    ]
    for stmt in statements:
        try:
            db.execute(text(stmt))
            db.commit()
        except Exception as e:
            db.rollback()
            print(f"wallet/payout overhaul migration step failed (continuing): {stmt} -> {e}")
    db.close()


@app.on_event("startup")
async def ensure_cancelled_by_enum_value() -> None:
    """Lightweight migration: add CANCELLED_WHILE_DRIVING to the Postgres
    cancelled_by_enum type (confirmed single physical type via pg_type,
    unlike car_type_enum which has two)."""
    from sqlalchemy import text
    db = SessionLocal()
    try:
        db.execute(text("ALTER TYPE cancelled_by_enum ADD VALUE IF NOT EXISTS 'CANCELLED_WHILE_DRIVING'"))
        # Website-triggered customer cancel (see api/routes/website_bookings.py)
        db.execute(text("ALTER TYPE cancelled_by_enum ADD VALUE IF NOT EXISTS 'CANCELLED_BY_CUSTOMER'"))
        # Admin cancel-a-booking endpoint (api/routes/admin.py) - added
        # 2026-09-04, there was previously no way for an admin to cancel a
        # booking at all (confirmed by search during this session).
        db.execute(text("ALTER TYPE cancelled_by_enum ADD VALUE IF NOT EXISTS 'CANCELLED_BY_ADMIN'"))
        db.commit()
    except Exception as e:
        db.rollback()
        print(f"cancelled_by_enum migration failed (continuing): {e}")
    finally:
        db.close()


@app.on_event("startup")
async def ensure_website_booking_columns() -> None:
    """Lightweight migration: source/decided_by columns for website-originated
    customer booking requests (create_all does not add columns)."""
    from sqlalchemy import text
    db = SessionLocal()
    try:
        db.execute(text("ALTER TABLE customer_booking_requests ADD COLUMN IF NOT EXISTS source VARCHAR NOT NULL DEFAULT 'APP'"))
        db.execute(text('ALTER TABLE customer_booking_requests ADD COLUMN IF NOT EXISTS decided_by VARCHAR'))
        # Which registered website integration posted this (see
        # models/website_integration.py) - added after website_integrations
        # table exists, so this runs after create_all in startup order.
        db.execute(text('ALTER TABLE customer_booking_requests ADD COLUMN IF NOT EXISTS source_website_id UUID REFERENCES website_integrations(id)'))
        # Website "Urgent - need taxi immediately" flag (see
        # api/routes/website_bookings.py) - was missing here despite the
        # feature depending on it everywhere.
        db.execute(text("ALTER TABLE customer_booking_requests ADD COLUMN IF NOT EXISTS is_urgent BOOLEAN NOT NULL DEFAULT false"))
        # Driver's own referral code entered by the customer at booking time
        # (see models/customer_booking_request.py).
        db.execute(text('ALTER TABLE customer_booking_requests ADD COLUMN IF NOT EXISTS driver_referral_code VARCHAR'))
        db.execute(text("ALTER TABLE customer_booking_requests ADD COLUMN IF NOT EXISTS referral_bonus_credited BOOLEAN NOT NULL DEFAULT false"))
        # Website customer-cancel + refund flow (see models/customer_booking_request.py
        # and api/routes/website_bookings.py) - previously only in a standalone,
        # never-run script under "Testing code/", so these were never actually
        # applied to the live table.
        db.execute(text('ALTER TABLE customer_booking_requests ADD COLUMN IF NOT EXISTS customer_email VARCHAR'))
        db.execute(text('ALTER TABLE customer_booking_requests ADD COLUMN IF NOT EXISTS cancel_otp VARCHAR'))
        db.execute(text('ALTER TABLE customer_booking_requests ADD COLUMN IF NOT EXISTS cancel_otp_expires_at TIMESTAMPTZ'))
        db.execute(text('ALTER TABLE customer_booking_requests ADD COLUMN IF NOT EXISTS refund_eligible BOOLEAN'))
        db.execute(text('ALTER TABLE customer_booking_requests ADD COLUMN IF NOT EXISTS refund_status VARCHAR'))
        db.execute(text('ALTER TABLE customer_booking_requests ADD COLUMN IF NOT EXISTS refund_requested_at TIMESTAMPTZ'))
        db.execute(text('ALTER TABLE customer_booking_requests ADD COLUMN IF NOT EXISTS refund_processed_at TIMESTAMPTZ'))
        db.execute(text('ALTER TABLE customer_booking_requests ADD COLUMN IF NOT EXISTS refund_amount INTEGER'))
        db.execute(text('ALTER TABLE customer_booking_requests ADD COLUMN IF NOT EXISTS refund_notes VARCHAR'))
        db.commit()
    except Exception as e:
        db.rollback()
        print(f"website booking columns migration failed (continuing): {e}")
    finally:
        db.close()


@app.on_event("startup")
async def ensure_drop_bid_counter_offer_columns() -> None:
    """Lightweight migration: counter-offer negotiation fields on
    drop_bid_offers (create_all does not add columns to existing tables).
    Added 2026-09-04 - Drop Bid previously only supported a flat
    submit-then-accept-or-ignore flow with no back-and-forth, which
    competitor research this same day confirmed is the actual core of
    inDrive's real-world model (the platform Drop Bid was built to
    emulate), not a cosmetic extra. See api/routes/drop_bid_routes.py's
    counter-offer endpoints."""
    from sqlalchemy import text
    db = SessionLocal()
    try:
        db.execute(text('ALTER TABLE drop_bid_offers ADD COLUMN IF NOT EXISTS counter_price INTEGER'))
        db.execute(text('ALTER TABLE drop_bid_offers ADD COLUMN IF NOT EXISTS counter_by VARCHAR'))
        # Real Razorpay advance payment (see api/routes/drop_bid_routes.py's
        # pay-advance/verify-advance endpoints) - added 2026-09-04.
        db.execute(text('ALTER TABLE drop_bid_offers ADD COLUMN IF NOT EXISTS advance_amount INTEGER'))
        db.execute(text('ALTER TABLE drop_bid_offers ADD COLUMN IF NOT EXISTS advance_rp_order_id VARCHAR'))
        db.execute(text('ALTER TABLE drop_bid_offers ADD COLUMN IF NOT EXISTS advance_rp_payment_id VARCHAR'))
        db.execute(text('ALTER TABLE drop_bid_offers ADD COLUMN IF NOT EXISTS advance_rp_signature VARCHAR'))
        db.execute(text("ALTER TABLE drop_bid_offers ADD COLUMN IF NOT EXISTS advance_paid BOOLEAN NOT NULL DEFAULT false"))
        db.commit()
    except Exception as e:
        db.rollback()
        print(f"drop_bid_offers counter-offer columns migration failed (continuing): {e}")
    finally:
        db.close()


@app.on_event("startup")
async def ensure_profile_img_columns() -> None:
    """Lightweight migration: selfie/profile photo columns for the free
    Aadhaar/licence-photo face-match check (see utils/document_verifier.py's
    compare_faces) - added 2026-09-04."""
    from sqlalchemy import text
    db = SessionLocal()
    try:
        db.execute(text('ALTER TABLE vehicle_owner_details ADD COLUMN IF NOT EXISTS profile_img VARCHAR'))
        db.execute(text('ALTER TABLE car_driver ADD COLUMN IF NOT EXISTS profile_img VARCHAR'))
        db.commit()
    except Exception as e:
        db.rollback()
        print(f"profile_img columns migration failed (continuing): {e}")
    finally:
        db.close()


@app.on_event("startup")
async def ensure_default_booking_sound() -> None:
    """The owner's own booking tone (uploaded to notification_sounds/ on 2026-10-01) is the starting value of the
    "New booking" sound field in Admin > Notification settings. It only fills the field when it was NEVER set, so an
    upload or a reset from the Admin App is never overwritten."""
    import os
    bucket_name = os.getenv("CREDENTIALS_BUCKET")
    if not bucket_name:
        return
    from app.models.platform_setting import PlatformSetting
    db = SessionLocal()
    try:
        key = "notif_sound_new_booking"
        if not db.query(PlatformSetting).filter(PlatformSetting.key == key).first():
            db.add(PlatformSetting(
                key=key,
                value=f"https://storage.googleapis.com/{bucket_name}/notification_sounds/drop-cars-booking-notification.mp3",
            ))
            db.commit()
    except Exception as e:
        db.rollback()
        print(f"default booking sound setup failed (continuing): {e}")
    finally:
        db.close()


@app.on_event("startup")
async def ensure_commission_waived_column() -> None:
    """Lightweight migration: the "10% CC" toggle column on orders (see
    api/routes/order_assignments.py's driver_create_booking_confirm and
    crud/end_records.py's update_end_trip_record) - added 2026-09-04."""
    from sqlalchemy import text
    db = SessionLocal()
    try:
        db.execute(text("ALTER TABLE orders ADD COLUMN IF NOT EXISTS commission_waived BOOLEAN NOT NULL DEFAULT false"))
        db.execute(text("ALTER TABLE new_orders ADD COLUMN IF NOT EXISTS commission_waived BOOLEAN NOT NULL DEFAULT false"))
        db.commit()
    except Exception as e:
        db.rollback()
        print(f"commission_waived column migration failed (continuing): {e}")
    finally:
        db.close()


@app.on_event("startup")
async def backfill_registration_ids() -> None:
    """
    One-time backfill: give every existing vendor / fleet owner / driver a
    human-friendly reg_id (YY + serial), numbered in the order they registered.
    Idempotent — only rows with reg_id IS NULL are touched, and the yearly
    counter in platform_settings continues where the backfill ends.
    """
    from app.models.vendor import VendorCredentials
    from app.models.vehicle_owner import VehicleOwnerCredentials
    from app.models.car_driver import CarDriver
    from app.utils.reg_id import _next_serial

    db = SessionLocal()
    try:
        pending = []
        for model in (VendorCredentials, VehicleOwnerCredentials, CarDriver):
            for row in db.query(model).filter(model.reg_id.is_(None)).all():
                pending.append((row.created_at, row))
        if not pending:
            return
        # created_at is NOT NULL in all three tables
        pending.sort(key=lambda item: item[0])
        assigned = 0
        for created_at, row in pending:
            yy = created_at.strftime("%y")
            serial = _next_serial(db, yy)
            row.reg_id = f"{yy}{serial:05d}"
            db.add(row)
            assigned += 1
        db.commit()
        print(f"Registration ID backfill: assigned {assigned} reg_id(s)")
    except Exception as e:
        db.rollback()
        print(f"Registration ID backfill failed (continuing): {e}")
    finally:
        db.close()


@app.on_event("startup")
async def load_cities_startup() -> None:
    # Load cities into cache once at startup
    try:
        load_cities_once(".")
    except Exception as e:
        print(f"Failed to load cities.json: {e}")


@app.on_event("startup")
async def load_car_models_startup() -> None:
    # Load the car model catalog into cache once at startup
    try:
        load_car_models_once()
    except Exception as e:
        print(f"Failed to load car models: {e}")


_LAST_HOUSEKEEPING = 0.0


import time as _time_mod
_LAST_PAYMENT_RECONCILE = 0.0
_LAST_MEMBER_RENEWAL = 0.0


async def _run_assignment_sweep() -> dict:
    """Cancel/complete assignments and bookings that passed their deadlines.
    Called by the internal timer AND by the /api/internal/sweep endpoint
    (Cloud Scheduler) so the container can scale to zero between requests."""
    db = SessionLocal()
    try:
        from app.crud.order_assignments import cancel_timed_out_pending_assignments, complete_no_start_assignments, cancel_expired_unaccepted_orders, send_urgent_booking_reminders, send_assignment_deadline_warnings
        from app.crud.customer_booking_request import auto_approve_expired_booking_requests
        # process_drop_bid_timeouts (app/crud/drop_bid_engine.py) intentionally
        # NOT called here - found 2026-09-04 while extending Drop Bid. It was
        # written against an OrderAssignment-based candidate/retry model
        # (candidate_offers, target_price, response_attempts) that was never
        # actually implemented on Order/OrderAssignment - the real Drop Bid
        # build (drop_bid_routes.py / models/drop_bid.py DropBidRequest+
        # DropBidOffer) never creates a PENDING OrderAssignment for an unaccepted
        # offer at all, so its query `PENDING assignments past expires_at` had
        # no Drop-Bid-specific filter and was silently matching ORDINARY
        # driver-assignment timeouts too - extending their expires_at into the
        # future every 35s (so cancel_timed_out_pending_assignments right below
        # could never catch them) while spamming city-wide "URGENT Drop Bid"
        # pushes for orders that were never Drop Bid at all. Left the function
        # itself in place (unused) rather than delete it, in case its
        # escalation design is revisited properly later.
        warned = await send_assignment_deadline_warnings(db)
        if warned:
            print(f"Sent {warned} assign-before-deadline warning(s) to fleet drivers")
        cancelled = await cancel_timed_out_pending_assignments(db)
        if cancelled:
            print(f"Auto-cancelled {cancelled} timed-out assignment(s)")
        completed = await complete_no_start_assignments(db)
        if completed:
            print(f"Auto-completed {completed} no-start assignment(s) (24h past pickup)")
        urgent_notified = await send_urgent_booking_reminders(db)
        if urgent_notified:
            print(f"Sent {urgent_notified} urgent-reminder push(es) for bookings nearing their deadline")
        expired = await cancel_expired_unaccepted_orders(db)
        if expired:
            print(f"Cancelled {expired} unaccepted booking(s) past their deadline")
        auto_approved = await auto_approve_expired_booking_requests(db)
        if auto_approved:
            print(f"Auto-approved {auto_approved} booking request(s) past their approval window")
        try:
            from app.api.routes.trip_reviews import pay_review_bonuses
            _bonus = pay_review_bonuses(db)
            if _bonus:
                print(f"Paid {_bonus} customer-rating bonus(es)")
        except Exception as _e:
            db.rollback()
            print(f"review bonus sweep failed (continuing): {_e}")
        # Yearly members whose year ran out are renewed from their wallet automatically (checked about every 3 hours)
        global _LAST_MEMBER_RENEWAL
        if _time_mod.time() - _LAST_MEMBER_RENEWAL > 10800:
            _LAST_MEMBER_RENEWAL = _time_mod.time()
            try:
                from app.crud.billing import run_member_auto_renewals
                _ren = run_member_auto_renewals(db)
                if _ren.get("renewed"):
                    print(f"Auto-renewed {_ren['renewed']} yearly member(s) from wallet ({_ren.get('wallet_too_low', 0)} had too little wallet)")
            except Exception as _e:
                db.rollback()
                print(f"member auto-renewal failed (continuing): {_e}")
        # Payments Razorpay took but the app never confirmed (yearly fee / wallet top-up) - finish them (every ~5 minutes)
        global _LAST_PAYMENT_RECONCILE
        if _time_mod.time() - _LAST_PAYMENT_RECONCILE > 300:
            _LAST_PAYMENT_RECONCILE = _time_mod.time()
            try:
                from app.crud.payment_reconcile import reconcile_razorpay_payments
                _rec = reconcile_razorpay_payments(db)
                if _rec.get("membership_activated") or _rec.get("wallet_credited"):
                    print(f"Recovered unconfirmed Razorpay payments: {_rec}")
                    try:
                        from app.crud.notification import send_push_notification_to_admin
                        await send_push_notification_to_admin(db, "Payments recovered", f"{_rec['membership_activated']} membership(s) activated and {_rec['wallet_credited']} wallet top-up(s) credited automatically.")
                    except Exception:
                        pass
            except Exception as _e:
                db.rollback()
                print(f"payment reconcile failed (continuing): {_e}")
            # Payment links on invoices / estimates (advance, GST, balance): record whichever were paid while nobody was watching
            try:
                from app.crud.billing_docs import reconcile_pending_links as _bill_links
                _bl = _bill_links(db)
                if _bl.get("paid"):
                    print(f"Recorded {_bl['paid']} invoice payment-link payment(s)")
            except Exception as _e:
                db.rollback()
                print(f"invoice payment-link reconcile failed (continuing): {_e}")
            # Payment links staff shared on WhatsApp for Standard -> Trusted upgrades: activate whichever were paid
            try:
                from app.crud.fleet_payment_links import reconcile_pending_links
                _lnk = reconcile_pending_links(db)
                if _lnk.get("activated"):
                    print(f"Activated {_lnk['activated']} partner plan(s) from paid payment links")
                    try:
                        from app.crud.notification import send_push_notification_to_admin
                        await send_push_notification_to_admin(db, "Payment link paid", f"{_lnk['activated']} partner(s) upgraded to Trusted automatically.")
                    except Exception:
                        pass
            except Exception as _e:
                db.rollback()
                print(f"payment link reconcile failed (continuing): {_e}")
        # Driver asked the booking's poster something and got no answer for 10 minutes -> Drop Cars support joins the chat
        try:
            from app.crud.booking_chat import escalate_unanswered_chats
            _esc = escalate_unanswered_chats(db)
            if _esc:
                print(f"Added Drop Cars support to {_esc} unanswered booking chat(s)")
        except Exception as _e:
            db.rollback()
            print(f"chat escalation failed (continuing): {_e}")
        # Housekeeping (chat 10 days, old odometer photos 3 months, replaced documents): hourly is plenty
        import time as _time
        global _LAST_HOUSEKEEPING
        if _time.time() - _LAST_HOUSEKEEPING > 3600:
            _LAST_HOUSEKEEPING = _time.time()
            try:
                from app.crud.end_records import purge_old_trip_photos
                _photos = purge_old_trip_photos(db)
                if _photos:
                    print(f"Removed odometer photos of {_photos} trip(s) older than 3 months (records kept)")
            except Exception as _e:
                db.rollback()
                print(f"trip photo purge failed (continuing): {_e}")
            try:
                from app.crud.stale_documents import purge_verified_stale_files
                _stale = purge_verified_stale_files(db)
                if _stale:
                    print(f"Removed {_stale} old document file(s) whose replacement is verified")
            except Exception as _e:
                db.rollback()
                print(f"stale document purge failed (continuing): {_e}")
            try:
                from app.crud.booking_chat import purge_old_chat_messages
                purged = purge_old_chat_messages(db)
                if purged:
                    print(f"Purged {purged} chat message(s) older than 10 days")
            except Exception as _e:
                db.rollback()
                print(f"chat purge failed (continuing): {_e}")
            try:
                from app.crud.chat_trash import purge_expired_trash
                _trash = purge_expired_trash(db)
                if any(_trash.values()):
                    print(f"Chat Trash cleared for good: {_trash}")
            except Exception as _e:
                db.rollback()
                print(f"chat trash purge failed (continuing): {_e}")
            try:
                from app.api.routes.support import purge_old_support_messages
                _support_purged = purge_old_support_messages(db)
                if _support_purged:
                    print(f"Purged {_support_purged} Support chat message(s) older than 10 days")
            except Exception as _e:
                db.rollback()
                print(f"support chat purge failed (continuing): {_e}")
        result = {"deadline_warned": warned or 0, "cancelled": cancelled or 0, "completed": completed or 0, "urgent_notified": urgent_notified or 0, "expired": expired or 0, "auto_approved": auto_approved or 0}
        try:
            from app.utils import system_health as _sh
            _sh.record_sweep(True, result)
            # Health alerts to the admin phones (each alert at most once per hour by default)
            await _sh.check_and_alert(db)
        except Exception as _e:
            db.rollback()
            print(f"health check failed (continuing): {_e}")
        return result
    finally:
        db.close()


# COST NOTE: this in-process timer keeps the Cloud Run container alive 24/7,
# which is what most of the Cloud Run bill pays for. To cut it: set env var
# DISABLE_INTERNAL_SWEEPS=true, deploy with --min-instances=0, and create a
# Cloud Scheduler job (free) that calls POST /api/internal/sweep every minute.
import os as _os
_INTERNAL_SWEEPS_DISABLED = _os.getenv("DISABLE_INTERNAL_SWEEPS", "").lower() == "true"

# Shared secret for Cloud Tasks -> this endpoint auth (see
# crud/notification.py's _enqueue_expo_push). Not OIDC-based on purpose -
# this endpoint does one narrow thing (relay a batch of Expo push payloads)
# and a header check is simpler to operate than wiring up a service-account
# token flow for it. Falls back to sending synchronously (old behavior) if
# this isn't set, so a missing/misconfigured secret never blocks real
# notifications from going out - it only loses the async offload.
INTERNAL_TASK_SECRET = _os.getenv("INTERNAL_TASK_SECRET", "")


def _require_internal_secret(request: Request) -> None:
    """Cloud Tasks and the Cloud Scheduler sweep job both send this header."""
    import hmac
    got = request.headers.get("X-Internal-Secret") or ""
    if not INTERNAL_TASK_SECRET or not hmac.compare_digest(got, INTERNAL_TASK_SECRET):
        raise HTTPException(status_code=403, detail="Forbidden")
@app.post("/api/internal/run-sweep")
async def run_sweep_task_endpoint(request: Request):
    """Cloud Tasks target (see crud/notification.schedule_internal_sweep): runs the deadline sweep at a scheduled moment
    even when no instance was alive."""
    _require_internal_secret(request)
    return await _run_assignment_sweep()


@app.post("/api/internal/dispatch-expo-push")
async def dispatch_expo_push_endpoint(request: Request):
    """Cloud Tasks target: takes a batch of already-built Expo push payloads
    and actually sends them. Exists so notification-sending call sites (see
    crud/notification.py) can enqueue this work instead of blocking the
    booking-creation request on the Expo HTTP round trip themselves."""
    _require_internal_secret(request)
    body = await request.json()
    payloads = body.get("payloads") or []
    from app.crud.notification import _post_expo_payloads_sync, _handle_expo_response
    result = _post_expo_payloads_sync(payloads)
    db = SessionLocal()
    try:
        tokens = [p.get("to") for p in payloads]
        _handle_expo_response(db, result, tokens)
    finally:
        db.close()
    return {"status": "dispatched", "count": len(payloads), "expo_response": result}


@app.on_event("startup")
@repeat_every(seconds=35, wait_first=True)
async def cancel_expired_assignments_task() -> None:
    """Background job: cancel pending assignments that exceeded their max assignment time."""
    if _INTERNAL_SWEEPS_DISABLED:
        return
    await _run_assignment_sweep()


_SWEEP_RUNNING = False


async def _run_off_loop(coro_fn):
    """Run one of the sweeps in a worker thread with its own event loop.

    The sweeps are `async def` but do blocking work (database queries, Razorpay / Expo / SMTP calls) between their awaits. Run
    directly on the server's event loop they froze EVERY request for as long as the sweep took (observed 2026-10-06: a
    /internal/sweep of 122 s made every other request wait 100-140 s and exhausted the database pool). In a worker thread the
    server keeps answering while the sweep works."""
    import asyncio
    from starlette.concurrency import run_in_threadpool

    def _runner():
        return asyncio.run(coro_fn())
    return await run_in_threadpool(_runner)


@app.post("/api/internal/sweep")
async def internal_sweep_endpoint(request: Request):
    """Endpoint for Cloud Scheduler: runs the same sweep as the internal timer.
    Runs the deadline sweep every call and the daily billing sweep at most
    once per day. Safe to call repeatedly (all sweeps are idempotent).
    Requires X-Internal-Secret (the drop-cars-sweep scheduler job sends it)."""
    _require_internal_secret(request)
    global _SWEEP_RUNNING
    if _SWEEP_RUNNING:                       # the scheduler fires every minute; never stack a second sweep on a running one
        return {"skipped": "previous sweep still running"}
    _SWEEP_RUNNING = True
    try:
        import time as _t
        _started = _t.time()
        result = await _run_off_loop(_run_assignment_sweep)
        if isinstance(result, dict):
            result["seconds"] = round(_t.time() - _started, 1)
    finally:
        _SWEEP_RUNNING = False

    # Daily billing sweep piggybacks on the scheduler too (replaces the
    # 86400s internal timer when internal sweeps are disabled).
    global _LAST_BILLING_SWEEP_DATE, _LAST_EXPIRY_SWEEP_DATE
    from datetime import date as _date
    today = _date.today()
    if _INTERNAL_SWEEPS_DISABLED and _LAST_BILLING_SWEEP_DATE != today:
        _LAST_BILLING_SWEEP_DATE = today
        await _run_off_loop(_run_billing_sweep)
        result["billing_sweep"] = "ran"
    if _INTERNAL_SWEEPS_DISABLED and _LAST_EXPIRY_SWEEP_DATE != today:
        _LAST_EXPIRY_SWEEP_DATE = today
        await _run_off_loop(_run_document_expiry_sweep)
        result["document_expiry_sweep"] = "ran"
    return result


_LAST_BILLING_SWEEP_DATE = None
_LAST_EXPIRY_SWEEP_DATE = None


async def _run_billing_sweep() -> None:
    """
    Daily billing sweep. DORMANT until an admin turns on `billing_enabled` in
    platform settings, so it does nothing on its own after deploy. When enabled,
    it charges due yearly fees, suspends accounts below the threshold, and
    reactivates billing-suspended accounts that recharged.
    """
    db = SessionLocal()
    try:
        from app.crud.billing import get_billing_settings, run_billing
        if not get_billing_settings(db)["billing_enabled"]:
            return
        result = run_billing(db, dry_run=False)
        print(
            f"Billing sweep: charged={len(result['charged'])} "
            f"suspended={len(result['suspended'])} reactivated={len(result['reactivated'])}"
        )
    except Exception as e:
        db.rollback()
        print(f"Billing sweep failed (continuing): {e}")
    finally:
        db.close()


@app.on_event("startup")
@repeat_every(seconds=86400, wait_first=True)  # once a day
async def yearly_billing_task() -> None:
    """Internal daily timer for the billing sweep (skipped when internal
    sweeps are disabled - Cloud Scheduler drives it via /api/internal/sweep)."""
    if _INTERNAL_SWEEPS_DISABLED:
        return
    await _run_billing_sweep()


async def _run_document_expiry_sweep() -> None:
    """Daily RC/Insurance/Licence expiry reminder sweep - always active (no
    settings toggle needed, unlike billing). See crud/document_expiry.py."""
    db = SessionLocal()
    try:
        from app.crud.document_expiry import send_expiry_reminders
        result = send_expiry_reminders(db)
        if any(result.values()):
            print(f"Document expiry sweep: {result}")
        from app.crud.account_activity import refresh_auto_inactive
        _act = refresh_auto_inactive(db)          # switch cars / drivers off (or on) by customer rating
        if any(_act.values()):
            print(f"Rating-based active/inactive refresh: {_act}")
    except Exception as e:
        db.rollback()
        print(f"Document expiry sweep failed (continuing): {e}")
    finally:
        db.close()


@app.on_event("startup")
async def ensure_hybrid_auth_columns() -> None:
    """Lightweight migration: Google Sign-In / Phone OTP / Firebase columns
    on the existing customer + car_driver tables (create_all does not add
    columns to a table that already exists in production) - see
    models/customer.py, models/car_driver.py, api/routes/hybrid_auth.py,
    api/routes/car_driver.py."""
    from sqlalchemy import text
    db = SessionLocal()
    try:
        db.execute(text("ALTER TABLE customer ADD COLUMN IF NOT EXISTS auth_provider VARCHAR NOT NULL DEFAULT 'email_smtp'"))
        db.execute(text('ALTER TABLE customer ADD COLUMN IF NOT EXISTS google_sub VARCHAR UNIQUE'))
        db.execute(text('ALTER TABLE customer ADD COLUMN IF NOT EXISTS firebase_uid VARCHAR UNIQUE'))
        db.execute(text("ALTER TABLE customer ADD COLUMN IF NOT EXISTS phone_verified BOOLEAN NOT NULL DEFAULT false"))
        db.execute(text('ALTER TABLE customer ADD COLUMN IF NOT EXISTS notification_preference VARCHAR'))
        db.execute(text("ALTER TABLE car_driver ADD COLUMN IF NOT EXISTS auth_provider VARCHAR NOT NULL DEFAULT 'password'"))
        db.execute(text('ALTER TABLE car_driver ADD COLUMN IF NOT EXISTS firebase_uid VARCHAR UNIQUE'))
        db.commit()
    except Exception as e:
        db.rollback()
        print(f"hybrid auth columns migration failed (continuing): {e}")
    finally:
        db.close()


@app.on_event("startup")
async def ensure_order_assignment_cancel_reason_column() -> None:
    """Lightweight migration: per-assignment cancel reason (see
    models/order_assignments.py's OrderAssignment.cancel_reason) - lets the
    Driver App's Executed tab tell "this owner's window timed out"
    (Unallocated) apart from a generic cancel, for bookings that got
    reposted instead of fully cancelled (where Order.cancelled_by stays
    null for that owner)."""
    from sqlalchemy import text
    db = SessionLocal()
    try:
        db.execute(text('ALTER TABLE order_assignments ADD COLUMN IF NOT EXISTS cancel_reason VARCHAR'))
        db.execute(text('ALTER TABLE order_assignments ADD COLUMN IF NOT EXISTS cancel_note VARCHAR'))
        db.execute(text('ALTER TABLE orders ADD COLUMN IF NOT EXISTS cancel_note VARCHAR'))
        db.execute(text('ALTER TABLE orders ADD COLUMN IF NOT EXISTS commission_class VARCHAR'))
        db.execute(text('ALTER TABLE orders ADD COLUMN IF NOT EXISTS gst_percent INTEGER'))
        # These two were added to the Order model alongside gst_percent above
        # but never got their own ALTER here - every query against Order
        # (SQLAlchemy selects all mapped columns) was crashing live with
        # psycopg2.errors.UndefinedColumn: column orders.gst_included does
        # not exist, breaking pending-orders, booking-chat threads, and
        # anything else that touches the orders table. Found 2026-09-22.
        db.execute(text("ALTER TABLE orders ADD COLUMN IF NOT EXISTS gst_included BOOLEAN NOT NULL DEFAULT false"))
        db.execute(text('ALTER TABLE orders ADD COLUMN IF NOT EXISTS gst_amount INTEGER'))
        # A staff/owner admin toggles this themselves (Admin App > Settings)
        # to say "I'm on duty right now" - GET /api/support/on-duty-contact
        # uses it to give drivers a real phone number to call instead of a
        # hardcoded placeholder.
        db.execute(text("ALTER TABLE admin ADD COLUMN IF NOT EXISTS is_on_duty BOOLEAN NOT NULL DEFAULT false"))
        db.execute(text('ALTER TABLE admin ADD COLUMN IF NOT EXISTS on_duty_since TIMESTAMPTZ'))
        # Voice notes in both chat systems (booking_chat + support_messages).
        db.execute(text('ALTER TABLE booking_chat_messages ADD COLUMN IF NOT EXISTS voice_url VARCHAR'))
        db.execute(text('ALTER TABLE booking_chat_messages ADD COLUMN IF NOT EXISTS reply_to_id INTEGER'))
        db.execute(text('ALTER TABLE support_messages ADD COLUMN IF NOT EXISTS voice_url VARCHAR'))
        # Same gst_included/gst_amount pair as orders above, but on the two
        # other tables that also declared them on their models without ever
        # getting an ALTER: customer_booking_requests (breaking
        # /admin/website-bookings/pending and every other query touching
        # this table) and new_orders. Found live 2026-09-23 via Cloud Run
        # logs: psycopg2.errors.UndefinedColumn: column
        # customer_booking_requests.gst_included does not exist.
        db.execute(text("ALTER TABLE customer_booking_requests ADD COLUMN IF NOT EXISTS gst_included BOOLEAN NOT NULL DEFAULT false"))
        db.execute(text('ALTER TABLE customer_booking_requests ADD COLUMN IF NOT EXISTS gst_amount INTEGER'))
        db.execute(text("ALTER TABLE new_orders ADD COLUMN IF NOT EXISTS gst_included BOOLEAN NOT NULL DEFAULT false"))
        db.execute(text('ALTER TABLE new_orders ADD COLUMN IF NOT EXISTS gst_amount INTEGER'))
        # vehicle_owner_details.vacant_fleet_entries (multi-vehicle fleet
        # vacant-entries JSON list) was added to the model but never
        # migrated - broke EVERY query touching vehicle_owner_details
        # (owner login, profile, admin owner listing, etc). Found live
        # 2026-09-23: psycopg2.errors.UndefinedColumn: column
        # vehicle_owner_details.vacant_fleet_entries does not exist.
        db.execute(text('ALTER TABLE vehicle_owner_details ADD COLUMN IF NOT EXISTS vacant_fleet_entries JSON'))
        # pincode is Optional on both the VehicleOwnerDetails model and the
        # signup form ("Area Pincode (Optional)" in the Driver App) but the
        # live table still had a legacy NOT NULL constraint from before it
        # became optional - every fresh fleet-owner signup that left pincode
        # blank was failing with psycopg2.errors.NotNullViolation, then
        # getting swallowed into a misleading "already exists" error by the
        # broad except in create_user(). Found live 2026-09-23 by actually
        # testing the signup flow end-to-end.
        db.execute(text('ALTER TABLE vehicle_owner_details ALTER COLUMN pincode DROP NOT NULL'))
        # New car document: Pollution / PUC certificate, plus expiry dates
        # for FC/Permit/Pollution (RC and Insurance expiry already existed).
        # Added 2026-09-23 alongside the Add Car document-expiry feature.
        db.execute(text('ALTER TABLE car_details ADD COLUMN IF NOT EXISTS pollution_img_url VARCHAR'))
        db.execute(text("ALTER TABLE car_details ADD COLUMN IF NOT EXISTS pollution_status document_status_enum DEFAULT 'PENDING'"))
        db.execute(text('ALTER TABLE car_details ADD COLUMN IF NOT EXISTS rc_expiry_date DATE'))
        db.execute(text('ALTER TABLE car_details ADD COLUMN IF NOT EXISTS registration_date DATE'))
        db.execute(text('ALTER TABLE car_details ADD COLUMN IF NOT EXISTS document_notes TEXT'))
        db.execute(text('ALTER TABLE car_driver ADD COLUMN IF NOT EXISTS document_notes TEXT'))
        db.execute(text('ALTER TABLE car_details ADD COLUMN IF NOT EXISTS manual_inactive_reason TEXT'))
        db.execute(text('ALTER TABLE car_details ADD COLUMN IF NOT EXISTS auto_inactive_reason TEXT'))
        db.execute(text('ALTER TABLE car_driver ADD COLUMN IF NOT EXISTS manual_inactive_reason TEXT'))
        db.execute(text('ALTER TABLE car_driver ADD COLUMN IF NOT EXISTS auto_inactive_reason TEXT'))
        db.execute(text('ALTER TABLE car_driver ADD COLUMN IF NOT EXISTS police_verification_img VARCHAR'))
        db.execute(text("ALTER TABLE car_driver ADD COLUMN IF NOT EXISTS police_verification_status document_status_enum DEFAULT 'PENDING'"))
        db.execute(text('ALTER TABLE vendor_details ADD COLUMN IF NOT EXISTS manual_inactive_reason TEXT'))
        db.execute(text('ALTER TABLE vehicle_owner_details ADD COLUMN IF NOT EXISTS manual_inactive_reason TEXT'))
        db.execute(text('ALTER TABLE car_details ADD COLUMN IF NOT EXISTS insurance_expiry_date DATE'))
        db.execute(text('ALTER TABLE car_details ADD COLUMN IF NOT EXISTS fc_expiry_date DATE'))
        db.execute(text('ALTER TABLE car_details ADD COLUMN IF NOT EXISTS permit_expiry_date DATE'))
        db.execute(text('ALTER TABLE car_details ADD COLUMN IF NOT EXISTS pollution_expiry_date DATE'))
        db.execute(text('ALTER TABLE IF EXISTS billing_documents ADD COLUMN IF NOT EXISTS created_by_phone VARCHAR'))
        db.commit()
        from app.crud.billing_docs import seed_default_brands
        _seeded = seed_default_brands(db)
        if _seeded:
            print(f"Billing: seeded {_seeded} brand(s)")
        from app.crud.one_time_fixes import reset_false_invalid_documents
        _fixed = reset_false_invalid_documents(db)
        if not _fixed.get("skipped"):
            print(f"One-time repair of false INVALID documents: {_fixed}")
    except Exception as e:
        db.rollback()
        print(f"order_assignments.cancel_reason migration failed (continuing): {e}")
    finally:
        db.close()


@app.on_event("startup")
@repeat_every(seconds=86400, wait_first=True)  # once a day
async def document_expiry_task() -> None:
    """Internal daily timer for the expiry-reminder sweep (skipped when
    internal sweeps are disabled - Cloud Scheduler drives it via
    /api/internal/sweep)."""
    if _INTERNAL_SWEEPS_DISABLED:
        return
    await _run_document_expiry_sweep()


@app.on_event("startup")
@repeat_every(seconds=60, wait_first=True)  # every 60 seconds
async def savaari_booking_monitor_task() -> None:
    """Background monitor for Savaari vendor portal bookings.
    Polls every 60s, matches against active alert filters, and triggers Expo push with sound."""
    if _INTERNAL_SWEEPS_DISABLED:
        return
    db = SessionLocal()
    try:
        from app.utils.savaari_monitor import run_savaari_monitor_cycle
        result = run_savaari_monitor_cycle(db)
        if result.get("new_detected", 0) > 0:
            print(f"🚕 Savaari monitor sweep: detected={result['new_detected']} notified={result['notifications_sent']}")
    except Exception as e:
        db.rollback()
        print(f"Savaari monitor sweep failed (continuing): {e}")
    finally:
        db.close()

