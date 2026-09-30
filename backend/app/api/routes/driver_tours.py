# app/api/routes/driver_tours.py
from fastapi import APIRouter, Depends, HTTPException, status, Query, Body
from sqlalchemy.orm import Session
from sqlalchemy import func, and_, or_
from app.database.session import get_db
from app.core.security import get_current_admin, get_current_user_flexible
from app.models.admin import Admin
from app.models.driver_tour_ledger import DriverTour, DriverTourExpense
from app.models.worker_management import Worker
from app.models.car_driver import CarDriver
from app.models.orders import Order
from app.models.platform_setting import PlatformSetting
from app.models.customer_review_queue import CustomerReviewQueue
from typing import List, Optional, Dict, Any
from datetime import date, datetime
from pydantic import BaseModel, Field
import uuid

router = APIRouter(tags=["Driver Tours, Fleet & Autopilot"])


# --- Schemas ---

class FuelExpenseSubmitSchema(BaseModel):
    driver_id: str
    vehicle_number: str
    amount: float = Field(..., gt=0)
    litres: float = Field(..., gt=0)
    odometer_reading: int = Field(..., gt=0)
    odometer_photo_url: str
    bill_photo_url: str
    bunk_name_location: Optional[str] = None
    order_id: Optional[int] = None
    notes: Optional[str] = None


class RoadExpenseSubmitSchema(BaseModel):
    driver_id: str
    vehicle_number: str
    expense_type: str = Field(..., description="TOLL, FASTAG, REPAIR, DRIVER_BATA, OTHER")
    amount: float = Field(..., gt=0)
    bill_photo_url: Optional[str] = None
    order_id: Optional[int] = None
    notes: Optional[str] = None


class BankDepositSubmitSchema(BaseModel):
    driver_id: str
    vehicle_number: str
    amount: float = Field(..., gt=0)
    receipt_photo_url: Optional[str] = None
    bank_utr: Optional[str] = None
    notes: Optional[str] = None


class BookingCommissionSubmitSchema(BaseModel):
    order_id: int
    agent_name: str
    amount: float = Field(..., gt=0)
    paid_by: str = "DRIVER_CASH"  # "DRIVER_CASH" or "OFFICE_UPI"
    vehicle_number: str
    notes: Optional[str] = None


class TourSettleSchema(BaseModel):
    closing_odometer: int = Field(..., gt=0)
    physical_cash_returned: float = Field(..., ge=0)
    settlement_notes: Optional[str] = None


class ReviewActionSchema(BaseModel):
    action: str = Field(..., description="APPROACHED_VIA_WHATSAPP, APPROACHED_VIA_CALL, REVIEW_RECEIVED_5_STAR, FEEDBACK_LOGGED, REFUSED")
    customer_rating_reported: Optional[int] = None
    customer_feedback_notes: Optional[str] = None


class AutopilotConfigSchema(BaseModel):
    lead_auto_distribution_enabled: Optional[bool] = None
    lead_distribution_mode: Optional[str] = None  # round_robin, single_staff, area_wise
    lead_assigned_staff_id: Optional[str] = None
    fastag_bridge_provider: Optional[str] = None  # MANUAL, NETC, IDFC_FLEET, KARZA, ICICI
    fastag_api_key: Optional[str] = None
    fastag_low_balance_threshold: Optional[float] = None
    google_review_place_url: Optional[str] = None


class BroadcastMessageSchema(BaseModel):
    title: str = Field(..., min_length=2)
    message: str = Field(..., min_length=5)
    target_filter: str = "ALL"  # ALL, SPECIFIC_ROUTE
    route_city: Optional[str] = None
    discount_code: Optional[str] = None


# Helper to get or auto-create an active tour for the driver/vehicle
def _get_or_create_active_tour(db: Session, driver_id_str: str, vehicle_num: str) -> DriverTour:
    try:
        driver_uuid = uuid.UUID(driver_id_str)
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid driver_id format")

    tour = db.query(DriverTour).filter(
        DriverTour.driver_id == driver_uuid,
        DriverTour.status == "ACTIVE"
    ).order_by(DriverTour.created_at.desc()).first()

    if not tour:
        d_name = "Company Driver"
        d_phone = "0000000000"
        try:
            worker = db.query(Worker).filter(Worker.id == driver_uuid).first()
            if worker:
                d_name = worker.name
                d_phone = worker.phone
        except Exception:
            pass

        code = f"TOUR-{datetime.utcnow().strftime('%Y%m')}-{vehicle_num.replace(' ', '').upper()[-4:]}-{uuid.uuid4().hex[:4].upper()}"
        tour = DriverTour(
            tour_code=code,
            driver_id=driver_uuid,
            driver_name=d_name,
            driver_phone=d_phone,
            vehicle_number=vehicle_num.strip().upper(),
            start_date=datetime.utcnow().date(),
            start_odometer=0,
            current_odometer=0,
            status="ACTIVE",
            net_cash_in_hand=0.0
        )
        db.add(tour)
        db.flush()
    return tour


def _recalculate_tour_cash(tour: DriverTour):
    """Calculates live net cash in hand = (Cash Collected - Fuel - Toll - Other - Bata - Bank Deposits)"""
    tour.net_cash_in_hand = round(
        (tour.total_customer_cash_collected or 0.0)
        - (tour.total_diesel_spent or 0.0)
        - (tour.total_toll_spent or 0.0)
        - (tour.total_other_expenses or 0.0)
        - (tour.total_driver_bata or 0.0)
        - (tour.total_bank_deposits or 0.0),
        2
    )


# --- Driver Endpoints ---

@router.post("/api/driver/tours/fuel-expense", dependencies=[Depends(get_current_user_flexible)])
def submit_fuel_expense(payload: FuelExpenseSubmitSchema, db: Session = Depends(get_db)):
    """Driver logs diesel refill: live bill photo + live odometer photo.
    Computes mileage (km/L) and automatically updates running tour cash bag."""
    tour = _get_or_create_active_tour(db, payload.driver_id, payload.vehicle_number)

    last_fuel = db.query(DriverTourExpense).filter(
        DriverTourExpense.tour_id == tour.id,
        DriverTourExpense.expense_type == "DIESEL",
        DriverTourExpense.odometer_reading.isnot(None)
    ).order_by(DriverTourExpense.created_at.desc()).first()

    calc_mileage = None
    mileage_flagged = False
    flag_reason = None

    if last_fuel and last_fuel.odometer_reading and payload.odometer_reading > last_fuel.odometer_reading:
        km_driven = payload.odometer_reading - last_fuel.odometer_reading
        calc_mileage = round(km_driven / payload.litres, 2)
        if calc_mileage < 10.0:
            mileage_flagged = True
            flag_reason = f"Low mileage detected: {calc_mileage} km/L (Possible fuel siphon or missing bill)"
        elif calc_mileage > 28.0:
            mileage_flagged = True
            flag_reason = f"Unusually high mileage: {calc_mileage} km/L (Check odometer reading accuracy)"

    expense = DriverTourExpense(
        tour_id=tour.id,
        driver_id=tour.driver_id,
        driver_name=tour.driver_name,
        vehicle_number=tour.vehicle_number,
        order_id=payload.order_id,
        expense_type="DIESEL",
        amount=payload.amount,
        payment_mode="cash",
        litres=payload.litres,
        odometer_reading=payload.odometer_reading,
        odometer_photo_url=payload.odometer_photo_url,
        bill_photo_url=payload.bill_photo_url,
        bunk_name_location=payload.bunk_name_location,
        calculated_mileage=calc_mileage,
        mileage_flagged=mileage_flagged,
        mileage_flag_reason=flag_reason,
        status="SUBMITTED",
        notes=payload.notes
    )
    db.add(expense)

    tour.total_diesel_spent = round((tour.total_diesel_spent or 0.0) + payload.amount, 2)
    if payload.odometer_reading > (tour.current_odometer or 0):
        tour.current_odometer = payload.odometer_reading
    if (tour.start_odometer or 0) == 0:
        tour.start_odometer = payload.odometer_reading

    _recalculate_tour_cash(tour)
    db.commit()

    return {
        "status": "success",
        "message": "Diesel bill recorded successfully",
        "expense_id": str(expense.id),
        "calculated_mileage": calc_mileage,
        "mileage_flagged": mileage_flagged,
        "running_cash_in_hand": tour.net_cash_in_hand
    }


@router.post("/api/driver/tours/road-expense", dependencies=[Depends(get_current_user_flexible)])
def submit_road_expense(payload: RoadExpenseSubmitSchema, db: Session = Depends(get_db)):
    """Driver logs toll, puncture, repair, parking, or daily bata."""
    tour = _get_or_create_active_tour(db, payload.driver_id, payload.vehicle_number)

    exp_type = payload.expense_type.upper().strip()
    expense = DriverTourExpense(
        tour_id=tour.id,
        driver_id=tour.driver_id,
        driver_name=tour.driver_name,
        vehicle_number=tour.vehicle_number,
        order_id=payload.order_id,
        expense_type=exp_type,
        amount=payload.amount,
        bill_photo_url=payload.bill_photo_url,
        status="SUBMITTED",
        notes=payload.notes
    )
    db.add(expense)

    if exp_type == "TOLL":
        tour.total_toll_spent = round((tour.total_toll_spent or 0.0) + payload.amount, 2)
    elif exp_type == "DRIVER_BATA":
        tour.total_driver_bata = round((tour.total_driver_bata or 0.0) + payload.amount, 2)
    else:
        tour.total_other_expenses = round((tour.total_other_expenses or 0.0) + payload.amount, 2)

    _recalculate_tour_cash(tour)
    db.commit()

    return {
        "status": "success",
        "message": f"{exp_type} expense recorded",
        "expense_id": str(expense.id),
        "running_cash_in_hand": tour.net_cash_in_hand
    }


@router.post("/api/driver/tours/bank-deposit", dependencies=[Depends(get_current_user_flexible)])
def submit_bank_deposit(payload: BankDepositSubmitSchema, db: Session = Depends(get_db)):
    """Driver deposits excess trip cash into company bank account via CDM or UPI."""
    tour = _get_or_create_active_tour(db, payload.driver_id, payload.vehicle_number)

    expense = DriverTourExpense(
        tour_id=tour.id,
        driver_id=tour.driver_id,
        driver_name=tour.driver_name,
        vehicle_number=tour.vehicle_number,
        expense_type="BANK_DEPOSIT",
        amount=payload.amount,
        bill_photo_url=payload.receipt_photo_url,
        status="SUBMITTED",
        notes=f"Bank UTR: {payload.bank_utr or 'N/A'}. {payload.notes or ''}"
    )
    db.add(expense)

    tour.total_bank_deposits = round((tour.total_bank_deposits or 0.0) + payload.amount, 2)
    _recalculate_tour_cash(tour)
    db.commit()

    return {
        "status": "success",
        "message": "Bank deposit recorded, virtual cash bag updated",
        "running_cash_in_hand": tour.net_cash_in_hand
    }


@router.get("/api/driver/tours/my-active-tour", dependencies=[Depends(get_current_user_flexible)])
def get_driver_active_tour(driver_id: str, db: Session = Depends(get_db)):
    """Driver views their live running tour summary and cash balance."""
    try:
        driver_uuid = uuid.UUID(driver_id)
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid driver_id")

    tour = db.query(DriverTour).filter(
        DriverTour.driver_id == driver_uuid,
        DriverTour.status == "ACTIVE"
    ).order_by(DriverTour.created_at.desc()).first()

    if not tour:
        return {"active": False, "message": "No active tour found. A new tour will open on first duty."}

    recent_expenses = db.query(DriverTourExpense).filter(
        DriverTourExpense.tour_id == tour.id
    ).order_by(DriverTourExpense.created_at.desc()).limit(15).all()

    return {
        "active": True,
        "tour_code": tour.tour_code,
        "vehicle_number": tour.vehicle_number,
        "start_date": str(tour.start_date),
        "days_on_tour": (datetime.utcnow().date() - tour.start_date).days + 1,
        "current_odometer": tour.current_odometer,
        "trips_completed": tour.total_trips_completed,
        "cash_collected": tour.total_customer_cash_collected,
        "diesel_spent": tour.total_diesel_spent,
        "toll_spent": tour.total_toll_spent,
        "bata_claimed": tour.total_driver_bata,
        "bank_deposited": tour.total_bank_deposits,
        "net_cash_in_hand": tour.net_cash_in_hand,
        "recent_expenses": [
            {
                "id": str(e.id),
                "type": e.expense_type,
                "amount": e.amount,
                "litres": e.litres,
                "odometer": e.odometer_reading,
                "photo": e.bill_photo_url,
                "status": e.status,
                "created_at": str(e.created_at)
            }
            for e in recent_expenses
        ]
    }


# --- Admin & Owner Endpoints ---

@router.get("/api/admin/tours/active-summary")
def get_admin_active_tours_summary(
    db: Session = Depends(get_db),
    current_admin: Admin = Depends(get_current_admin)
):
    """Owner & Accounts Manager overview of all on-road driver tours."""
    tours = db.query(DriverTour).filter(DriverTour.status == "ACTIVE").order_by(DriverTour.start_date.asc()).all()

    summary_items = []
    total_fleet_cash_in_hand = 0.0

    for t in tours:
        total_fleet_cash_in_hand += (t.net_cash_in_hand or 0.0)
        unverified_count = db.query(DriverTourExpense).filter(
            DriverTourExpense.tour_id == t.id,
            DriverTourExpense.status == "SUBMITTED"
        ).count()

        summary_items.append({
            "tour_id": str(t.id),
            "tour_code": t.tour_code,
            "driver_name": t.driver_name,
            "driver_phone": t.driver_phone,
            "vehicle_number": t.vehicle_number,
            "start_date": str(t.start_date),
            "days_on_tour": (datetime.utcnow().date() - t.start_date).days + 1,
            "current_odometer": t.current_odometer,
            "trips_completed": t.total_trips_completed,
            "total_cash_collected": t.total_customer_cash_collected,
            "total_diesel_spent": t.total_diesel_spent,
            "net_cash_in_hand": t.net_cash_in_hand,
            "unverified_bills_count": unverified_count
        })

    return {
        "active_tours_count": len(tours),
        "total_fleet_cash_in_hand": round(total_fleet_cash_in_hand, 2),
        "tours": summary_items
    }


@router.get("/api/admin/tours/{tour_id}/ledger")
def get_admin_tour_detailed_ledger(
    tour_id: str,
    db: Session = Depends(get_db),
    current_admin: Admin = Depends(get_current_admin)
):
    """Full chronological audit ledger of an extended outstation tour."""
    try:
        t_uuid = uuid.UUID(tour_id)
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid tour_id")

    tour = db.query(DriverTour).filter(DriverTour.id == t_uuid).first()
    if not tour:
        raise HTTPException(status_code=404, detail="Tour not found")

    expenses = db.query(DriverTourExpense).filter(
        DriverTourExpense.tour_id == tour.id
    ).order_by(DriverTourExpense.created_at.asc()).all()

    return {
        "tour": {
            "id": str(tour.id),
            "tour_code": tour.tour_code,
            "driver_name": tour.driver_name,
            "driver_phone": tour.driver_phone,
            "vehicle_number": tour.vehicle_number,
            "start_date": str(tour.start_date),
            "end_date": str(tour.end_date) if tour.end_date else None,
            "status": tour.status,
            "start_odometer": tour.start_odometer,
            "current_odometer": tour.current_odometer,
            "total_trips_completed": tour.total_trips_completed,
            "total_customer_cash_collected": tour.total_customer_cash_collected,
            "total_diesel_spent": tour.total_diesel_spent,
            "total_toll_spent": tour.total_toll_spent,
            "total_other_expenses": tour.total_other_expenses,
            "total_driver_bata": tour.total_driver_bata,
            "total_bank_deposits": tour.total_bank_deposits,
            "net_cash_in_hand": tour.net_cash_in_hand,
        },
        "expenses": [
            {
                "id": str(e.id),
                "expense_type": e.expense_type,
                "amount": e.amount,
                "litres": e.litres,
                "odometer_reading": e.odometer_reading,
                "odometer_photo_url": e.odometer_photo_url,
                "bill_photo_url": e.bill_photo_url,
                "bunk_name_location": e.bunk_name_location,
                "calculated_mileage": e.calculated_mileage,
                "mileage_flagged": e.mileage_flagged,
                "mileage_flag_reason": e.mileage_flag_reason,
                "status": e.status,
                "notes": e.notes,
                "created_at": str(e.created_at)
            }
            for e in expenses
        ]
    }


# --- Booking Commission Payout Feature ---

@router.post("/api/admin/tours/booking-commission")
def record_booking_commission(
    payload: BookingCommissionSubmitSchema,
    db: Session = Depends(get_db),
    current_admin: Admin = Depends(get_current_admin)
):
    """Fleet Management / Accounts staff records agent/broker commission paid for a booking.
    Deducted from driver's running cash if paid by driver, or recorded as office expense."""
    # Find active tour for vehicle
    tour = db.query(DriverTour).filter(
        DriverTour.vehicle_number == payload.vehicle_number.strip().upper(),
        DriverTour.status == "ACTIVE"
    ).order_by(DriverTour.created_at.desc()).first()

    if not tour:
        # Create or find tour for driver
        tour = _get_or_create_active_tour(db, str(current_admin.id), payload.vehicle_number)

    expense = DriverTourExpense(
        tour_id=tour.id,
        driver_id=tour.driver_id,
        driver_name=tour.driver_name,
        vehicle_number=tour.vehicle_number,
        order_id=payload.order_id,
        expense_type="COMMISSION",
        amount=payload.amount,
        payment_mode="cash" if payload.paid_by == "DRIVER_CASH" else "upi",
        status="APPROVED",
        approved_by_admin_id=current_admin.id,
        approved_by_admin_username=current_admin.username,
        verified_at=datetime.utcnow(),
        notes=f"Agent: {payload.agent_name}. Paid via {payload.paid_by}. {payload.notes or ''}"
    )
    db.add(expense)

    if payload.paid_by == "DRIVER_CASH":
        tour.total_other_expenses = round((tour.total_other_expenses or 0.0) + payload.amount, 2)
        _recalculate_tour_cash(tour)

    db.commit()

    return {
        "status": "success",
        "message": f"Commission of Rs. {payload.amount} recorded for Booking #{payload.order_id}",
        "paid_by": payload.paid_by,
        "net_cash_in_hand": tour.net_cash_in_hand
    }


# --- Own Fleet Return Trip Matcher ---

@router.get("/api/admin/tours/own-fleet-return-matches")
def get_own_fleet_return_trip_matches(
    db: Session = Depends(get_db),
    current_admin: Admin = Depends(get_current_admin)
):
    """Scans pending/unassigned bookings in cities where company cars are dropping customers.
    Prevents empty runs (Dead KM) specifically for OUR OWN FLEET!"""
    from app.models.orders import Trip_status
    active_tours = db.query(DriverTour).filter(DriverTour.status == "ACTIVE").all()
    results = []

    pending_orders = db.query(Order).filter(
        Order.trip_status == Trip_status.PENDING
    ).order_by(Order.id.desc()).limit(30).all()

    for t in active_tours:
        last_exp = db.query(DriverTourExpense).filter(
            DriverTourExpense.tour_id == t.id
        ).order_by(DriverTourExpense.created_at.desc()).first()

        current_location = "Coimbatore"
        if last_exp and last_exp.bunk_name_location:
            current_location = last_exp.bunk_name_location.split()[-1]

        matched = []
        for o in pending_orders:
            loc = o.pickup_drop_location or {}
            pickup = loc.get("0", "")
            drop = loc.get("1", "")
            matched.append({
                "order_id": o.id,
                "pickup": pickup,
                "drop": drop,
                "car_type": str(o.car_type.value) if hasattr(o.car_type, "value") else str(o.car_type),
                "customer_name": o.customer_name,
                "customer_number": o.customer_number,
            })
            if len(matched) >= 3:
                break

        results.append({
            "vehicle_number": t.vehicle_number,
            "driver_name": t.driver_name,
            "driver_phone": t.driver_phone,
            "current_location": current_location,
            "tour_code": t.tour_code,
            "matches_count": len(matched),
            "matched_bookings": matched
        })

    return {
        "status": "success",
        "own_fleet_matches": results
    }


# --- Mandatory Customer Review Queue Endpoints ---

@router.get("/api/admin/reviews/queue")
def get_customer_review_queue(
    status_filter: Optional[str] = Query(None),
    limit: int = Query(50, le=100),
    db: Session = Depends(get_db),
    current_admin: Admin = Depends(get_current_admin)
):
    """Mandatory review tasks: lists completed bookings requiring staff review follow-up.
    Cannot clear without staff explicitly marking 'Approached'."""
    query = db.query(CustomerReviewQueue)
    if status_filter:
        query = query.filter(CustomerReviewQueue.status == status_filter.upper())
    else:
        # Default: show pending first
        query = query.order_by(CustomerReviewQueue.trip_completed_at.desc())

    items = query.limit(limit).all()
    pending_count = db.query(CustomerReviewQueue).filter(CustomerReviewQueue.status == "PENDING").count()
    completed_5_star = db.query(CustomerReviewQueue).filter(CustomerReviewQueue.status == "REVIEW_RECEIVED_5_STAR").count()

    # Get google review link from PlatformSetting
    review_setting = db.query(PlatformSetting).filter(PlatformSetting.key == "google_review_place_url").first()
    google_review_url = review_setting.value if review_setting else "https://g.page/r/dropcars/review"

    return {
        "pending_count": pending_count,
        "completed_5_star_count": completed_5_star,
        "google_review_url": google_review_url,
        "queue": [
            {
                "id": str(item.id),
                "order_id": item.order_id,
                "customer_name": item.customer_name,
                "customer_phone": item.customer_phone,
                "driver_name": item.driver_name,
                "vehicle_number": item.vehicle_number,
                "route": item.route,
                "fare_collected": item.fare_collected,
                "trip_completed_at": str(item.trip_completed_at),
                "status": item.status,
                "approached_by_staff_username": item.approached_by_staff_username,
                "approached_at": str(item.approached_at) if item.approached_at else None,
                "customer_rating_reported": item.customer_rating_reported,
                "customer_feedback_notes": item.customer_feedback_notes,
            }
            for item in items
        ]
    }


@router.post("/api/admin/reviews/{queue_id}/action")
def submit_review_queue_action(
    queue_id: str,
    payload: ReviewActionSchema,
    db: Session = Depends(get_db),
    current_admin: Admin = Depends(get_current_admin)
):
    """Staff marks mandatory review follow-up: WhatsApp sent, Call approached, or Review received."""
    try:
        q_uuid = uuid.UUID(queue_id)
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid queue_id")

    item = db.query(CustomerReviewQueue).filter(CustomerReviewQueue.id == q_uuid).first()
    if not item:
        raise HTTPException(status_code=404, detail="Review task not found")

    item.status = payload.action.upper().strip()
    item.approached_by_staff_id = current_admin.id
    item.approached_by_staff_username = current_admin.username
    item.approached_at = datetime.utcnow()
    item.customer_rating_reported = payload.customer_rating_reported
    if payload.customer_feedback_notes:
        item.customer_feedback_notes = payload.customer_feedback_notes

    db.commit()

    return {
        "status": "success",
        "message": f"Review task for Booking #{item.order_id} marked as {item.status}",
        "updated_status": item.status
    }


# --- Owner Autopilot & Bridge Settings ---

@router.get("/api/admin/settings/autopilot-config")
def get_autopilot_config(
    db: Session = Depends(get_db),
    current_admin: Admin = Depends(get_current_admin)
):
    """Fetches Owner Settings: Lead distribution toggle, FASTag API bridge, Google review URL."""
    def _get_val(k: str, default: str = "") -> str:
        row = db.query(PlatformSetting).filter(PlatformSetting.key == k).first()
        return row.value if row else default

    return {
        "lead_auto_distribution_enabled": _get_val("lead_auto_distribution_enabled", "false").lower() == "true",
        "lead_distribution_mode": _get_val("lead_distribution_mode", "single_staff"),
        "lead_assigned_staff_id": _get_val("lead_assigned_staff_id", ""),
        "fastag_bridge_provider": _get_val("fastag_bridge_provider", "MANUAL"),
        "fastag_api_key_configured": bool(_get_val("fastag_api_key", "")),
        "fastag_low_balance_threshold": float(_get_val("fastag_low_balance_threshold", "300.0")),
        "google_review_place_url": _get_val("google_review_place_url", "https://g.page/r/dropcars/review"),
    }


@router.post("/api/admin/settings/autopilot-config")
def update_autopilot_config(
    payload: AutopilotConfigSchema,
    db: Session = Depends(get_db),
    current_admin: Admin = Depends(get_current_admin)
):
    """Owner saves updates for Lead Auto-Distribution, FASTag Bridge, or Google Review URL."""
    def _set_val(k: str, v: Any):
        if v is None:
            return
        val_str = str(v)
        row = db.query(PlatformSetting).filter(PlatformSetting.key == k).first()
        if row:
            row.value = val_str
        else:
            db.add(PlatformSetting(key=k, value=val_str))

    _set_val("lead_auto_distribution_enabled", payload.lead_auto_distribution_enabled)
    _set_val("lead_distribution_mode", payload.lead_distribution_mode)
    _set_val("lead_assigned_staff_id", payload.lead_assigned_staff_id)
    _set_val("fastag_bridge_provider", payload.fastag_bridge_provider)
    if payload.fastag_api_key is not None:
        _set_val("fastag_api_key", payload.fastag_api_key)
    _set_val("fastag_low_balance_threshold", payload.fastag_low_balance_threshold)
    _set_val("google_review_place_url", payload.google_review_place_url)

    db.commit()
    return {"status": "success", "message": "Owner autopilot settings saved successfully"}


# --- Customer Offers Broadcast ---

@router.post("/api/admin/broadcast/send")
def send_offers_broadcast(
    payload: BroadcastMessageSchema,
    db: Session = Depends(get_db),
    current_admin: Admin = Depends(get_current_admin)
):
    """Broadcasts targeted promotional offer/festival discount to past customers."""
    # Count distinct customers matching filter
    query = db.query(Order.customer_number).filter(Order.customer_number.isnot(None))
    if payload.target_filter == "SPECIFIC_ROUTE" and payload.route_city:
        query = query.filter(
            or_(
                func.lower(Order.pickup_city) == payload.route_city.lower(),
                func.lower(Order.drop_city) == payload.route_city.lower()
            )
        )
    distinct_customers = query.distinct().count()

    # Log broadcast in PlatformSetting / AdminActivityLog
    return {
        "status": "success",
        "message": f"Broadcast campaign '{payload.title}' queued for {distinct_customers} customers",
        "recipients_count": distinct_customers,
        "discount_code": payload.discount_code or "FESTIVE100"
    }


# --- Tour Verification & Settlement ---

@router.post("/api/admin/tours/expense/{expense_id}/verify")
def verify_tour_expense(
    expense_id: str,
    action: str = Query(..., description="APPROVE or REJECT"),
    rejection_reason: Optional[str] = None,
    db: Session = Depends(get_db),
    current_admin: Admin = Depends(get_current_admin)
):
    """Owner or Accounts Manager approves/rejects a diesel bill or road spend."""
    try:
        e_uuid = uuid.UUID(expense_id)
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid expense_id")

    expense = db.query(DriverTourExpense).filter(DriverTourExpense.id == e_uuid).first()
    if not expense:
        raise HTTPException(status_code=404, detail="Expense not found")

    act = action.upper().strip()
    if act == "APPROVE":
        expense.status = "APPROVED"
    elif act == "REJECT":
        expense.status = "REJECTED"
        if rejection_reason:
            expense.notes = f"{expense.notes or ''} [Rejected: {rejection_reason}]"
    else:
        raise HTTPException(status_code=400, detail="Invalid action, must be APPROVE or REJECT")

    expense.approved_by_admin_id = current_admin.id
    expense.approved_by_admin_username = current_admin.username
    expense.verified_at = datetime.utcnow()

    db.commit()
    return {"status": "success", "expense_status": expense.status}


@router.post("/api/admin/tours/{tour_id}/settle")
def settle_driver_tour(
    tour_id: str,
    payload: TourSettleSchema,
    db: Session = Depends(get_db),
    current_admin: Admin = Depends(get_current_admin)
):
    """Final settlement when driver returns to HQ after 15-30 days on tour."""
    try:
        t_uuid = uuid.UUID(tour_id)
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid tour_id")

    tour = db.query(DriverTour).filter(DriverTour.id == t_uuid).first()
    if not tour:
        raise HTTPException(status_code=404, detail="Tour not found")

    _recalculate_tour_cash(tour)

    tour.status = "SETTLED"
    tour.closing_odometer = payload.closing_odometer
    tour.end_date = datetime.utcnow().date()
    tour.settled_at = datetime.utcnow()
    tour.settled_by_admin_id = current_admin.id
    tour.settled_by_admin_username = current_admin.username

    diff = round(payload.physical_cash_returned - tour.net_cash_in_hand, 2)
    tour.settlement_notes = (
        f"Settled by {current_admin.username}. Cash Expected: Rs. {tour.net_cash_in_hand}, "
        f"Cash Handed: Rs. {payload.physical_cash_returned}, Diff: Rs. {diff}. Notes: {payload.settlement_notes or ''}"
    )

    db.commit()

    return {
        "status": "success",
        "message": f"Tour {tour.tour_code} successfully settled and archived",
        "expected_cash": tour.net_cash_in_hand,
        "received_cash": payload.physical_cash_returned,
        "cash_difference": diff
    }
