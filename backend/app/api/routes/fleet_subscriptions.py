from fastapi import APIRouter, HTTPException, Depends, Query, status
from sqlalchemy.orm import Session
from sqlalchemy import or_, func, text
from datetime import datetime, date, timedelta, timezone
from typing import Optional, List
from pydantic import BaseModel, Field
import uuid

from app.database.session import get_db
from app.core.security import get_current_admin
from app.models.vehicle_owner import VehicleOwnerCredentials
from app.models.vehicle_owner_details import VehicleOwnerDetails
from app.models.car_details import CarDetails
from app.models.car_driver import CarDriver
from app.models.fleet_subscription import FleetSubscriptionHistory
from app.crud.admin_activity_log import log_admin_action

router = APIRouter(prefix="/admin/fleet-subscriptions", tags=["Admin Fleet Subscriptions"])


class ManualPaymentRequest(BaseModel):
    payment_channel: str = Field(..., description="Where they paid: GPay, PhonePe, Bank Transfer, Cash in Hand, Razorpay, etc.")
    payment_ref: Optional[str] = Field(None, description="UTR, Transaction ID or Receipt Number")
    amount: float = Field(..., gt=0, description="Amount paid in INR")
    plan_type: str = Field("MONTHLY", description="MONTHLY, YEARLY, or CUSTOM")
    duration_days: Optional[int] = Field(None, description="Days to extend: default 30 for MONTHLY, 365 for YEARLY")
    mark_as_trusted: bool = Field(True, description="Whether to grant/maintain Trusted Partner status")
    notes: Optional[str] = Field(None, description="Admin notes or remarks")


class PauseSubscriptionRequest(BaseModel):
    reason: str = Field(..., min_length=2, description="Reason for pausing the subscription")


class ResumeSubscriptionRequest(BaseModel):
    extend_paused_days: bool = Field(True, description="Extend billing next date by the duration it was paused")
    notes: Optional[str] = Field(None, description="Admin notes on resumption")


@router.get("")
def get_fleet_subscriptions(
    status_filter: str = Query("ALL", alias="status", description="ALL, PAID, OVERDUE, PAUSED, TRUSTED"),
    search: Optional[str] = Query(None, description="Search by name, phone, reg_id, city"),
    skip: int = Query(0, ge=0),
    limit: int = Query(50, ge=1, le=200),
    db: Session = Depends(get_db),
    current_admin=Depends(get_current_admin),
):
    """
    Dedicated Fleet Accounts & Subscription Tracking view.
    Returns fleet accounts with live subscription status, payment channels, pause records, and trusted partner status.
    """
    today = date.today()
    now_utc = datetime.now(timezone.utc)

    # Base query: join VehicleOwnerCredentials and VehicleOwnerDetails
    base_query = db.query(
        VehicleOwnerCredentials,
        VehicleOwnerDetails
    ).outerjoin(
        VehicleOwnerDetails,
        VehicleOwnerCredentials.id == VehicleOwnerDetails.vehicle_owner_id
    )

    if search:
        s = f"%{search.strip()}%"
        base_query = base_query.filter(
            or_(
                VehicleOwnerCredentials.primary_number.ilike(s),
                VehicleOwnerCredentials.reg_id.ilike(s),
                VehicleOwnerDetails.full_name.ilike(s),
                VehicleOwnerDetails.city.ilike(s),
                VehicleOwnerDetails.local_city.ilike(s),
            )
        )

    # Count cars and drivers per owner in bulk
    all_owners = base_query.all()
    owner_ids = [o[0].id for o in all_owners]

    cars_count_map = {}
    if owner_ids:
        car_rows = db.query(
            CarDetails.vehicle_owner_id,
            func.count(CarDetails.id)
        ).filter(CarDetails.vehicle_owner_id.in_(owner_ids)).group_by(CarDetails.vehicle_owner_id).all()
        for cid, count in car_rows:
            cars_count_map[cid] = count

    drivers_count_map = {}
    if owner_ids:
        driver_rows = db.query(
            CarDriver.vehicle_owner_id,
            func.count(CarDriver.id)
        ).filter(CarDriver.vehicle_owner_id.in_(owner_ids)).group_by(CarDriver.vehicle_owner_id).all()
        for did, count in driver_rows:
            drivers_count_map[did] = count

    # Categorize and compile items
    total_count = len(all_owners)
    paid_count = 0
    overdue_count = 0
    paused_count = 0
    trusted_count = 0

    items = []
    for creds, details in all_owners:
        if not details:
            details = VehicleOwnerDetails(vehicle_owner_id=creds.id, full_name=f"Owner ({creds.primary_number})", primary_number=creds.primary_number)

        # Status computation
        is_suspended = bool(details.billing_suspended)
        billing_next = details.billing_next_date
        reg_paid_at = details.registration_fee_paid_at

        # Determine sub status
        if is_suspended:
            sub_status = "PAUSED"
            paused_count += 1
        elif billing_next and billing_next >= today:
            sub_status = "PAID"
            paid_count += 1
        elif reg_paid_at and (not billing_next or billing_next >= today):
            sub_status = "PAID"
            paid_count += 1
        elif billing_next and billing_next < today:
            sub_status = "OVERDUE"
            overdue_count += 1
        else:
            sub_status = "UNPAID"
            overdue_count += 1

        is_trusted = bool(details.admin_trusted_override) or (details.driver_pro_trusted_until and details.driver_pro_trusted_until > now_utc)
        if is_trusted:
            trusted_count += 1

        # Apply filter
        sf = status_filter.upper()
        if sf == "PAID" and sub_status != "PAID":
            continue
        elif sf == "OVERDUE" and sub_status not in ("OVERDUE", "UNPAID"):
            continue
        elif sf == "PAUSED" and sub_status != "PAUSED":
            continue
        elif sf == "TRUSTED" and not is_trusted:
            continue

        days_remaining = (billing_next - today).days if billing_next else None

        items.append({
            "id": str(creds.id),
            "reg_id": creds.reg_id or "—",
            "full_name": details.full_name or "Fleet Partner",
            "primary_number": creds.primary_number,
            "city": details.city or details.local_city or "—",
            "account_status": creds.account_status.value if hasattr(creds.account_status, "value") else str(creds.account_status),
            "tier": details.tier,
            "subscription_type": details.subscription_type or "YEARLY",
            "subscription_status": sub_status,
            "is_paid": sub_status == "PAID",
            "is_trusted": is_trusted,
            "admin_trusted_override": details.admin_trusted_override,
            "trusted_override_by": details.trusted_override_by,
            "trusted_override_reason": details.trusted_override_reason,
            "trusted_override_at": details.trusted_override_at.isoformat() if details.trusted_override_at else None,
            "billing_next_date": billing_next.isoformat() if billing_next else None,
            "days_remaining": days_remaining,
            "registration_fee_paid_at": reg_paid_at.isoformat() if reg_paid_at else None,
            "billing_suspended": is_suspended,
            "billing_suspended_at": details.billing_suspended_at.isoformat() if details.billing_suspended_at else None,
            "billing_suspended_by": details.billing_suspended_by,
            "billing_suspended_reason": details.billing_suspended_reason,
            "subscription_payment_channel": details.subscription_payment_channel,
            "subscription_payment_ref": details.subscription_payment_ref,
            "subscription_paid_amount": float(details.subscription_paid_amount) if details.subscription_paid_amount else None,
            "subscription_paid_at": details.subscription_paid_at.isoformat() if details.subscription_paid_at else None,
            "wallet_balance": details.wallet_balance or 0,
            "cars_count": cars_count_map.get(creds.id, 0),
            "drivers_count": drivers_count_map.get(creds.id, 0),
        })

    # Pagination slice
    paginated_items = items[skip : skip + limit]

    return {
        "summary": {
            "total_fleets": total_count,
            "paid_count": paid_count,
            "overdue_count": overdue_count,
            "paused_count": paused_count,
            "trusted_count": trusted_count,
        },
        "total_filtered": len(items),
        "items": paginated_items,
    }


@router.post("/{vehicle_owner_id}/manual-payment")
def record_manual_subscription_payment(
    vehicle_owner_id: uuid.UUID,
    payload: ManualPaymentRequest,
    db: Session = Depends(get_db),
    current_admin=Depends(get_current_admin),
):
    """
    Manually marks a fleet account's subscription as PAID and optionally Trusted.
    Records the exact payment channel (e.g. GPay, Bank Transfer, Cash), reference ID, amount, and admin who approved.
    """
    details = db.query(VehicleOwnerDetails).filter(
        VehicleOwnerDetails.vehicle_owner_id == vehicle_owner_id
    ).first()
    if not details:
        raise HTTPException(status_code=404, detail="Fleet Owner account details not found")

    today = date.today()
    now_utc = datetime.now(timezone.utc)
    admin_name = getattr(current_admin, "username", "Admin")

    plan = payload.plan_type.upper()
    duration = payload.duration_days
    if not duration:
        duration = 365 if plan == "YEARLY" else 30

    start_date = today
    # If currently active and paid in future, extend from future date
    if details.billing_next_date and details.billing_next_date > today:
        end_date = details.billing_next_date + timedelta(days=duration)
    else:
        end_date = today + timedelta(days=duration)

    clean_channel = payload.payment_channel.strip()
    clean_ref = (payload.payment_ref or "").strip() or None
    clean_notes = (payload.notes or "").strip() or f"Manual {plan} payment via {clean_channel}"

    # Update VehicleOwnerDetails
    details.subscription_type = plan
    details.registration_fee_paid_at = now_utc
    details.subscription_paid_at = now_utc
    details.subscription_paid_amount = payload.amount
    details.subscription_payment_channel = clean_channel
    details.subscription_payment_ref = clean_ref
    details.billing_next_date = end_date
    details.billing_last_charged_at = now_utc
    details.billing_suspended = False
    details.billing_suspended_at = None
    details.billing_suspended_by = None
    details.billing_suspended_reason = None

    if payload.mark_as_trusted:
        details.admin_trusted_override = True
        details.trusted_override_by = admin_name
        details.trusted_override_reason = f"Verified manual subscription payment via {clean_channel} (Ref: {clean_ref or 'Direct'})"
        details.trusted_override_at = now_utc

    # Log to FleetSubscriptionHistory
    history_entry = FleetSubscriptionHistory(
        id=uuid.uuid4(),
        vehicle_owner_id=vehicle_owner_id,
        event_type="MANUAL_PAYMENT",
        payment_channel=clean_channel,
        payment_ref=clean_ref,
        amount=payload.amount,
        plan_type=plan,
        duration_days=duration,
        period_start=start_date,
        period_end=end_date,
        is_trusted=payload.mark_as_trusted,
        reason=clean_notes,
        admin_id=current_admin.id,
        admin_username=admin_name,
        created_at=now_utc,
    )
    db.add(history_entry)

    # Activity log
    log_admin_action(
        db,
        admin_id=str(current_admin.id),
        admin_username=admin_name,
        admin_role=current_admin.role,
        action="FLEET_SUBSCRIPTION_MANUAL_PAY",
        target_type="vehicle_owner",
        target_id=str(vehicle_owner_id),
        target_name=details.full_name,
        details={
            "channel": clean_channel,
            "ref": clean_ref,
            "amount": payload.amount,
            "plan": plan,
            "valid_until": end_date.isoformat(),
            "marked_trusted": payload.mark_as_trusted,
        },
    )

    db.commit()

    return {
        "success": True,
        "message": f"Successfully activated {plan} subscription via {clean_channel}",
        "vehicle_owner_id": str(vehicle_owner_id),
        "billing_next_date": end_date.isoformat(),
        "is_trusted": details.admin_trusted_override,
        "payment_channel": clean_channel,
        "payment_ref": clean_ref,
    }


@router.post("/{vehicle_owner_id}/pause")
def pause_fleet_subscription(
    vehicle_owner_id: uuid.UUID,
    payload: PauseSubscriptionRequest,
    db: Session = Depends(get_db),
    current_admin=Depends(get_current_admin),
):
    """
    Pauses a fleet subscription with an explicit timestamp and reason.
    """
    details = db.query(VehicleOwnerDetails).filter(
        VehicleOwnerDetails.vehicle_owner_id == vehicle_owner_id
    ).first()
    if not details:
        raise HTTPException(status_code=404, detail="Fleet Owner account details not found")

    now_utc = datetime.now(timezone.utc)
    admin_name = getattr(current_admin, "username", "Admin")
    clean_reason = payload.reason.strip()

    details.billing_suspended = True
    details.billing_suspended_at = now_utc
    details.billing_suspended_by = admin_name
    details.billing_suspended_reason = clean_reason

    # Add history log
    history_entry = FleetSubscriptionHistory(
        id=uuid.uuid4(),
        vehicle_owner_id=vehicle_owner_id,
        event_type="PAUSED",
        reason=clean_reason,
        admin_id=current_admin.id,
        admin_username=admin_name,
        created_at=now_utc,
    )
    db.add(history_entry)

    log_admin_action(
        db,
        admin_id=str(current_admin.id),
        admin_username=admin_name,
        admin_role=current_admin.role,
        action="FLEET_SUBSCRIPTION_PAUSED",
        target_type="vehicle_owner",
        target_id=str(vehicle_owner_id),
        target_name=details.full_name,
        details={"reason": clean_reason},
    )

    db.commit()

    return {
        "success": True,
        "message": f"Subscription paused for {details.full_name}",
        "paused_at": now_utc.isoformat(),
        "paused_by": admin_name,
        "reason": clean_reason,
    }


@router.post("/{vehicle_owner_id}/resume")
def resume_fleet_subscription(
    vehicle_owner_id: uuid.UUID,
    payload: ResumeSubscriptionRequest,
    db: Session = Depends(get_db),
    current_admin=Depends(get_current_admin),
):
    """
    Resumes a paused fleet subscription, with option to extend due date by the days paused.
    """
    details = db.query(VehicleOwnerDetails).filter(
        VehicleOwnerDetails.vehicle_owner_id == vehicle_owner_id
    ).first()
    if not details:
        raise HTTPException(status_code=404, detail="Fleet Owner account details not found")

    today = date.today()
    now_utc = datetime.now(timezone.utc)
    admin_name = getattr(current_admin, "username", "Admin")

    paused_days = 0
    if payload.extend_paused_days and details.billing_suspended_at and details.billing_next_date:
        paused_days = max(0, (today - details.billing_suspended_at.date()).days)
        details.billing_next_date = details.billing_next_date + timedelta(days=paused_days)

    prev_pause_reason = details.billing_suspended_reason
    details.billing_suspended = False
    details.billing_suspended_at = None
    details.billing_suspended_by = None
    details.billing_suspended_reason = None

    history_entry = FleetSubscriptionHistory(
        id=uuid.uuid4(),
        vehicle_owner_id=vehicle_owner_id,
        event_type="RESUMED",
        duration_days=paused_days,
        reason=payload.notes or f"Resumed after {paused_days} paused days (previous pause reason: {prev_pause_reason or 'None'})",
        admin_id=current_admin.id,
        admin_username=admin_name,
        created_at=now_utc,
    )
    db.add(history_entry)

    log_admin_action(
        db,
        admin_id=str(current_admin.id),
        admin_username=admin_name,
        admin_role=current_admin.role,
        action="FLEET_SUBSCRIPTION_RESUMED",
        target_type="vehicle_owner",
        target_id=str(vehicle_owner_id),
        target_name=details.full_name,
        details={
            "days_extended": paused_days,
            "new_due_date": details.billing_next_date.isoformat() if details.billing_next_date else None,
        },
    )

    db.commit()

    return {
        "success": True,
        "message": f"Subscription resumed. Extended by {paused_days} days.",
        "billing_next_date": details.billing_next_date.isoformat() if details.billing_next_date else None,
    }


@router.get("/{vehicle_owner_id}/history")
def get_fleet_subscription_history(
    vehicle_owner_id: uuid.UUID,
    db: Session = Depends(get_db),
    current_admin=Depends(get_current_admin),
):
    """
    Returns full chronological history of payments, pause/resume events, and trusted status changes for this fleet.
    """
    rows = db.query(FleetSubscriptionHistory).filter(
        FleetSubscriptionHistory.vehicle_owner_id == vehicle_owner_id
    ).order_by(FleetSubscriptionHistory.created_at.desc()).all()

    return [
        {
            "id": str(r.id),
            "event_type": r.event_type,
            "payment_channel": r.payment_channel,
            "payment_ref": r.payment_ref,
            "amount": float(r.amount) if r.amount else None,
            "plan_type": r.plan_type,
            "duration_days": r.duration_days,
            "period_start": r.period_start.isoformat() if r.period_start else None,
            "period_end": r.period_end.isoformat() if r.period_end else None,
            "is_trusted": r.is_trusted,
            "reason": r.reason,
            "admin_username": r.admin_username,
            "created_at": r.created_at.isoformat() if r.created_at else None,
        }
        for r in rows
    ]
