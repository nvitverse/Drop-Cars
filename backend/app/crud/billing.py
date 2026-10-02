# crud/billing.py
"""
Account lifecycle / yearly-fee billing.

Design goals (kept deliberately safe because this moves money and can suspend
real accounts):
  * DORMANT until an admin flips `billing_enabled` on. Nothing auto-charges
    before that, even after deploy.
  * Fee amount + suspend threshold are stored as editable settings, not hardcoded.
  * `run_billing(dry_run=True)` previews exactly what would happen and changes nothing.
  * Only accounts that billing ITSELF suspended (billing_suspended=true) are ever
    auto-reactivated, so a manual admin block is never overridden.
"""
from datetime import date, timedelta, datetime, timezone
from typing import Optional
import uuid

from sqlalchemy.orm import Session

from app.models.platform_setting import PlatformSetting
from app.models.vehicle_owner_details import VehicleOwnerDetails
from app.models.vehicle_owner import VehicleOwnerCredentials, AccountStatusEnum
from app.models.wallet_ledger import WalletLedger, WalletEntryTypeEnum

BILLING_CYCLE_DAYS = 365

MONTHLY_CYCLE_DAYS = 30
MONTHLY_RENEWAL_GRACE_DAYS = 3      # a monthly plan is auto-renewed up to this many days after its date; older ones stay lapsed

DEFAULTS = {
    "billing_enabled": "false",
    "yearly_fee": "0",          # whole rupees
    "monthly_fee": "199",       # whole rupees - Rs.199/month subscription plan
    "suspend_threshold": "-100",  # suspend when balance falls below this (rupees)
    # First-time Monthly signup only: wallet must hold at least this much
    # ON TOP OF the monthly fee before switching Standard -> Monthly, so the
    # owner still has a working balance (not just enough for the fee itself)
    # the moment Preferred status kicks in. Not enforced again on renewal -
    # run_billing()'s regular sweep already debits whatever balance exists,
    # same as before this floor existed.
    "monthly_min_wallet_floor": "500",
}


def _get_raw(db: Session, key: str) -> Optional[str]:
    row = db.query(PlatformSetting).filter(PlatformSetting.key == key).first()
    return row.value if row else DEFAULTS.get(key)


def get_billing_settings(db: Session) -> dict:
    return {
        "billing_enabled": _get_raw(db, "billing_enabled") == "true",
        "yearly_fee": int(_get_raw(db, "yearly_fee") or 0),
        "monthly_fee": int(_get_raw(db, "monthly_fee") or 199),
        "suspend_threshold": int(_get_raw(db, "suspend_threshold") or -100),
        "monthly_min_wallet_floor": int(_get_raw(db, "monthly_min_wallet_floor") or 500),
    }


def update_billing_settings(
    db: Session,
    *,
    billing_enabled: Optional[bool] = None,
    yearly_fee: Optional[int] = None,
    monthly_fee: Optional[int] = None,
    suspend_threshold: Optional[int] = None,
    monthly_min_wallet_floor: Optional[int] = None,
) -> dict:
    def _set(key: str, value: str):
        row = db.query(PlatformSetting).filter(PlatformSetting.key == key).first()
        if row:
            row.value = value
        else:
            row = PlatformSetting(key=key, value=value)
        db.add(row)

    if billing_enabled is not None:
        _set("billing_enabled", "true" if billing_enabled else "false")
    if yearly_fee is not None:
        if yearly_fee < 0:
            from fastapi import HTTPException
            raise HTTPException(status_code=400, detail="yearly_fee cannot be negative")
        _set("yearly_fee", str(int(yearly_fee)))
    if monthly_fee is not None:
        if monthly_fee < 0:
            from fastapi import HTTPException
            raise HTTPException(status_code=400, detail="monthly_fee cannot be negative")
        _set("monthly_fee", str(int(monthly_fee)))
    if suspend_threshold is not None:
        _set("suspend_threshold", str(int(suspend_threshold)))
    if monthly_min_wallet_floor is not None:
        if monthly_min_wallet_floor < 0:
            from fastapi import HTTPException
            raise HTTPException(status_code=400, detail="monthly_min_wallet_floor cannot be negative")
        _set("monthly_min_wallet_floor", str(int(monthly_min_wallet_floor)))
    db.commit()
    return get_billing_settings(db)


def _next_anniversary(created_at, today: date) -> date:
    """The account's NEXT yearly-fee expiry date (each account has its own
    yearly clock based on when it was created - not one common date).

    The paid year runs from the registration date to the DAY BEFORE the
    anniversary: registered 30/05/2025 -> valid through 29/05/2026, so the
    expiry / next-charge date is anniversary minus one day."""
    base = created_at.date() if hasattr(created_at, "date") else (created_at or today)
    anniversary = base
    while anniversary <= today:
        anniversary = anniversary + timedelta(days=BILLING_CYCLE_DAYS)
    expiry = anniversary - timedelta(days=1)
    if expiry <= today:
        expiry = expiry + timedelta(days=BILLING_CYCLE_DAYS)
    return expiry


def start_billing_cycle(db: Session, dry_run: bool = False) -> dict:
    """Seed billing_next_date for ACTIVE owners that don't have one yet.
    Each owner gets their OWN next anniversary of their registration date."""
    today = date.today()

    owners = (
        db.query(VehicleOwnerDetails, VehicleOwnerCredentials)
        .join(VehicleOwnerCredentials, VehicleOwnerCredentials.id == VehicleOwnerDetails.vehicle_owner_id)
        .filter(VehicleOwnerDetails.billing_next_date.is_(None))
        .filter(VehicleOwnerCredentials.account_status == AccountStatusEnum.ACTIVE)
        .all()
    )

    seeded = []
    for d, creds in owners:
        next_date = _next_anniversary(creds.created_at, today)
        seeded.append({
            "vehicle_owner_id": str(d.vehicle_owner_id),
            "full_name": d.full_name,
            "billing_next_date": str(next_date),
        })
        if not dry_run:
            d.billing_next_date = next_date
            db.add(d)

    if not dry_run:
        db.commit()

    return {"dry_run": dry_run, "seeded_count": len(seeded),
            "next_date": "per-account anniversary", "seeded": seeded}


def get_partner_tier(details: VehicleOwnerDetails) -> str:
    """Thin wrapper - VehicleOwnerDetails.tier is the single source of truth
    (also lets admin schemas expose it via from_attributes with no real
    column)."""
    return details.tier if details is not None else "STANDARD"


def get_owner_billing_status(db: Session, vehicle_owner_id) -> dict:
    """Owner-facing: their own fee due date + countdown (shown in the app menu)."""
    details = db.query(VehicleOwnerDetails).filter(
        VehicleOwnerDetails.vehicle_owner_id == vehicle_owner_id
    ).first()
    settings = get_billing_settings(db)
    tier = get_partner_tier(details)
    if not details or details.billing_next_date is None:
        return {
            "billing_active": False,
            "billing_next_date": None,
            "days_remaining": None,
            "yearly_fee": settings["yearly_fee"],
            "billing_suspended": bool(details.billing_suspended) if details else False,
            "auto_renew_from_wallet": bool(details.auto_renew_from_wallet) if details else False,
            "tier": tier,
            "local_city": details.local_city if details else None,
            "local_cities": details.local_cities if details else None,
            "subscription_type": (details.subscription_type if details else None) or "YEARLY",
            "monthly_fee": settings["monthly_fee"],
        }
    days = (details.billing_next_date - date.today()).days
    return {
        "billing_active": True,
        "billing_next_date": str(details.billing_next_date),
        "days_remaining": days,
        "yearly_fee": settings["yearly_fee"],
        "billing_suspended": bool(details.billing_suspended),
        "auto_renew_from_wallet": bool(details.auto_renew_from_wallet),
        "tier": tier,
        "local_city": details.local_city,
        "local_cities": details.local_cities,
        "subscription_type": details.subscription_type or "YEARLY",
        "monthly_fee": settings["monthly_fee"],
    }


def _cycle_days(details: VehicleOwnerDetails) -> int:
    return MONTHLY_CYCLE_DAYS if details.subscription_type == "MONTHLY" else BILLING_CYCLE_DAYS


def _owner_fee(details: VehicleOwnerDetails, settings: dict) -> int:
    return settings["monthly_fee"] if details.subscription_type == "MONTHLY" else settings["yearly_fee"]


def start_monthly_subscription(db: Session, vehicle_owner_id) -> dict:
    """Standard -> Monthly (Rs.199/mo, Preferred tier). Forced wallet
    auto-debit from here on - the ONLY way off Monthly is upgrading to
    Yearly (see upgrade_to_yearly). Charges the first month immediately so
    Preferred status applies right away instead of waiting for the next
    billing sweep.

    First-time-only wallet floor: the owner's wallet must already hold at
    least monthly_min_wallet_floor + the fee itself before this switch is
    allowed, so they don't land on Preferred with a near-zero/negative
    balance the moment it kicks in. Renewals after this (run_billing's
    sweep) are NOT gated the same way - they debit whatever balance exists,
    same as before this floor existed."""
    details = db.query(VehicleOwnerDetails).filter(
        VehicleOwnerDetails.vehicle_owner_id == vehicle_owner_id
    ).with_for_update().first()
    if not details:
        from fastapi import HTTPException
        raise HTTPException(status_code=404, detail="Account not found")
    if details.subscription_type == "MONTHLY":
        from fastapi import HTTPException
        raise HTTPException(status_code=400, detail="Already on the Monthly plan")

    settings = get_billing_settings(db)
    fee = settings["monthly_fee"]
    if fee <= 0:
        from fastapi import HTTPException
        raise HTTPException(status_code=400, detail="Monthly plan is not available right now")

    # Owner rule (2026-10-02): the plan is activated by paying its fee. The old extra "minimum balance" floor (Rs 500 on top
    # of the fee) made a driver who paid Rs 199 get "recharge to Rs 699" and no subscription.
    min_required = fee
    current_balance = details.wallet_balance or 0
    if current_balance < min_required:
        from fastapi import HTTPException
        raise HTTPException(
            status_code=400,
            detail=f"Add Rs.{min_required - current_balance} to your wallet to start the Monthly plan (fee Rs.{fee}, balance Rs.{current_balance}).",
        )

    from app.crud.wallet import debit_wallet_allow_negative
    debit_wallet_allow_negative(
        db, vehicle_owner_id=str(vehicle_owner_id), amount=fee,
        reference_id=None, reference_type="MONTHLY_SUBSCRIPTION_FEE",
        notes=f"First month of Rs.{fee}/mo subscription",
    )

    details.subscription_type = "MONTHLY"
    details.auto_renew_from_wallet = True
    if details.registration_fee_paid_at is None:
        details.registration_fee_paid_at = datetime.now(timezone.utc)
    details.billing_suspended = False
    details.billing_next_date = date.today() + timedelta(days=MONTHLY_CYCLE_DAYS)
    details.billing_last_charged_at = datetime.now(timezone.utc)
    db.add(details)
    db.commit()
    return get_owner_billing_status(db, vehicle_owner_id)


def upgrade_to_yearly(db: Session, vehicle_owner_id) -> dict:
    """Monthly -> Yearly, the one allowed way off the forced-auto-debit
    Monthly plan. Charges the full yearly fee immediately (no proration
    for months already paid) and starts a fresh 365-day cycle from today."""
    details = db.query(VehicleOwnerDetails).filter(
        VehicleOwnerDetails.vehicle_owner_id == vehicle_owner_id
    ).with_for_update().first()
    if not details:
        from fastapi import HTTPException
        raise HTTPException(status_code=404, detail="Account not found")
    if details.subscription_type != "MONTHLY":
        from fastapi import HTTPException
        raise HTTPException(status_code=400, detail="Only Monthly subscribers can upgrade to Yearly this way")

    settings = get_billing_settings(db)
    fee = settings["yearly_fee"]
    if fee <= 0:
        from fastapi import HTTPException
        raise HTTPException(status_code=400, detail="Yearly plan is not available right now")

    from app.crud.wallet import debit_wallet_allow_negative
    debit_wallet_allow_negative(
        db, vehicle_owner_id=str(vehicle_owner_id), amount=fee,
        reference_id=None, reference_type="YEARLY_UPGRADE_FEE",
        notes=f"Upgraded from Monthly to Yearly (Rs.{fee})",
    )

    details.subscription_type = "YEARLY"
    if details.registration_fee_paid_at is None:
        details.registration_fee_paid_at = datetime.now(timezone.utc)
    details.billing_suspended = False
    details.billing_next_date = date.today() + timedelta(days=BILLING_CYCLE_DAYS)
    details.billing_last_charged_at = datetime.now(timezone.utc)
    db.add(details)
    db.commit()
    return get_owner_billing_status(db, vehicle_owner_id)


def run_billing(db: Session, dry_run: bool = True) -> dict:
    """
    Charge the yearly fee to owners whose billing_next_date has arrived, suspend
    accounts that fall below the threshold, and reactivate billing-suspended
    accounts that are back above it.
    """
    settings = get_billing_settings(db)
    threshold = settings["suspend_threshold"]
    today = date.today()

    summary = {
        "dry_run": dry_run,
        "enabled": settings["billing_enabled"],
        "yearly_fee": settings["yearly_fee"],
        "monthly_fee": settings["monthly_fee"],
        "suspend_threshold": threshold,
        "seeded": 0,
        "charged": [],
        "awaiting_manual_renewal": [],
        "suspended": [],
        "reactivated": [],
        "warnings": [],
    }

    # Auto-seed: any ACTIVE owner without a due date gets their own
    # registration-anniversary date (new signups need zero admin taps).
    try:
        seed_result = start_billing_cycle(db, dry_run=dry_run)
        summary["seeded"] = seed_result["seeded_count"]
    except Exception as e:
        summary["warnings"].append(f"Auto-seeding failed: {e}")

    if settings["yearly_fee"] <= 0 and settings["monthly_fee"] <= 0:
        summary["warnings"].append("yearly_fee and monthly_fee are both 0 — set a fee in Billing settings before running.")
        return summary

    # --- Charge due accounts ---
    due = (
        db.query(VehicleOwnerDetails, VehicleOwnerCredentials)
        .join(VehicleOwnerCredentials, VehicleOwnerCredentials.id == VehicleOwnerDetails.vehicle_owner_id)
        .filter(VehicleOwnerDetails.billing_next_date.isnot(None))
        .filter(VehicleOwnerDetails.billing_next_date <= today)
        .all()
    )

    for details, creds in due:
        is_monthly = details.subscription_type == "MONTHLY"
        fee = _owner_fee(details, settings)

        # Opt-in only: without auto-renew, a due account is simply left due -
        # it drops to Standard tier (see get_partner_tier) and waits for a
        # manual Razorpay/UPI renewal, same screen as first-time payment.
        # No debit, no account suspension - being unpaid no longer blocks
        # the app, it just changes tier. Monthly subscribers never take this
        # path - their auto-debit is forced and can't be opted out of.
        if not is_monthly and not details.auto_renew_from_wallet:
            summary["awaiting_manual_renewal"].append({
                "vehicle_owner_id": str(details.vehicle_owner_id),
                "full_name": details.full_name,
                "billing_next_date": str(details.billing_next_date),
            })
            continue

        if fee <= 0:
            summary["warnings"].append(f"Skipped {details.full_name}: no fee configured for their plan")
            continue

        before = details.wallet_balance or 0
        after = before - fee  # allowed to go negative
        new_next = (details.billing_next_date or today) + timedelta(days=_cycle_days(details))
        record = {
            "vehicle_owner_id": str(details.vehicle_owner_id),
            "full_name": details.full_name,
            "plan": "MONTHLY" if is_monthly else "YEARLY",
            "balance_before": before,
            "balance_after": after,
            "next_date": str(new_next),
        }
        summary["charged"].append(record)

        if not dry_run:
            details.wallet_balance = after
            details.billing_next_date = new_next
            details.billing_last_charged_at = datetime.now(timezone.utc)
            db.add(details)
            db.add(WalletLedger(
                vehicle_owner_id=details.vehicle_owner_id,
                reference_id=str(uuid.uuid4()),
                reference_type="BILLING_MONTHLY_FEE" if is_monthly else "BILLING_YEARLY_FEE",
                entry_type=WalletEntryTypeEnum.DEBIT,
                amount=fee,
                balance_before=before,
                balance_after=after,
                notes=f"{'Monthly' if is_monthly else 'Yearly'} platform fee ({today})",
            ))

        # Suspend if it dropped below threshold and is currently active
        if after < threshold and creds.account_status == AccountStatusEnum.ACTIVE:
            summary["suspended"].append({
                "vehicle_owner_id": str(details.vehicle_owner_id),
                "full_name": details.full_name,
                "balance_after": after,
            })
            if not dry_run:
                creds.account_status = AccountStatusEnum.INACTIVE
                details.billing_suspended = True
                db.add(creds)
                db.add(details)
                try:
                    from app.utils.trip_emails import send_billing_suspended_email
                    send_billing_suspended_email(db, details.vehicle_owner_id, after, threshold)
                except Exception:
                    pass

    # --- Reactivate billing-suspended accounts back above threshold ---
    suspended_rows = (
        db.query(VehicleOwnerDetails, VehicleOwnerCredentials)
        .join(VehicleOwnerCredentials, VehicleOwnerCredentials.id == VehicleOwnerDetails.vehicle_owner_id)
        .filter(VehicleOwnerDetails.billing_suspended.is_(True))
        .all()
    )
    for details, creds in suspended_rows:
        if (details.wallet_balance or 0) >= threshold:
            summary["reactivated"].append({
                "vehicle_owner_id": str(details.vehicle_owner_id),
                "full_name": details.full_name,
                "balance": details.wallet_balance or 0,
            })
            if not dry_run:
                creds.account_status = AccountStatusEnum.ACTIVE
                details.billing_suspended = False
                db.add(creds)
                db.add(details)

    if not dry_run:
        db.commit()

    return summary



def reset_yearly_cycle(db: Session, start_date: Optional[date] = None, dry_run: bool = True, include_lapsed: bool = True) -> dict:
    """Restart the yearly period of EVERY member who has paid (goodwill after a period the app did not work properly).

    A member counts as "has paid" when registration_fee_paid_at is set OR they have a billing_next_date (the same evidence the
    Preferred tier uses). Their new expiry is start_date + one year - 1 day (same convention as _next_anniversary: paid year
    runs to the DAY BEFORE the anniversary). Monthly subscribers are left alone (they renew monthly). Members who never paid
    are untouched. No money moves and no suspension is changed - only billing_next_date. dry_run=True (default) changes
    nothing and returns the preview."""
    today = date.today()
    start = start_date or (today + timedelta(days=1))
    new_next = start + timedelta(days=BILLING_CYCLE_DAYS) - timedelta(days=1)

    rows = (
        db.query(VehicleOwnerDetails, VehicleOwnerCredentials)
        .join(VehicleOwnerCredentials, VehicleOwnerCredentials.id == VehicleOwnerDetails.vehicle_owner_id)
        .all()
    )
    summary = {
        "dry_run": dry_run, "start_date": str(start), "new_expiry_date": str(new_next),
        "total_members": len(rows), "will_update": 0, "still_active": 0, "lapsed": 0, "suspended_flag": 0,
        "skipped_monthly": 0, "skipped_never_paid": 0, "skipped_lapsed_by_choice": 0, "sample": [],
    }
    for details, creds in rows:
        if details.subscription_type == "MONTHLY":
            summary["skipped_monthly"] += 1
            continue
        paid_evidence = details.registration_fee_paid_at is not None or details.billing_next_date is not None
        if not paid_evidence:
            summary["skipped_never_paid"] += 1
            continue
        lapsed = details.billing_next_date is not None and details.billing_next_date < today
        if lapsed and not include_lapsed:
            summary["skipped_lapsed_by_choice"] += 1
            continue
        summary["will_update"] += 1
        summary["lapsed" if lapsed else "still_active"] += 1
        if details.billing_suspended:
            summary["suspended_flag"] += 1
        if len(summary["sample"]) < 8:
            summary["sample"].append({
                "name": details.full_name, "old_expiry": str(details.billing_next_date) if details.billing_next_date else None,
                "new_expiry": str(new_next),
            })
        if not dry_run:
            details.billing_next_date = new_next
            db.add(details)
    if not dry_run:
        import json as _json
        from app.models.platform_setting import PlatformSetting
        row = db.query(PlatformSetting).filter(PlatformSetting.key == "billing_yearly_reset_log").first()
        payload = _json.dumps({"at": datetime.now(timezone.utc).isoformat(), **{k: v for k, v in summary.items() if k != "sample"}})
        if row:
            row.value = payload
        else:
            db.add(PlatformSetting(key="billing_yearly_reset_log", value=payload))
        db.commit()
    return summary


def activate_membership(db: Session, details: VehicleOwnerDetails, start: Optional[date] = None) -> date:
    """Make an owner a paid (Trusted / Preferred) member for a year. The ONE place every yearly-fee payment path calls, so a
    payment can never leave someone half-activated again.

    - registration_fee_paid_at is stamped (first payment evidence)
    - billing_next_date = expiry: paying early EXTENDS from the current expiry, otherwise the year starts `start` (default today);
      the paid year ends the DAY BEFORE the anniversary (same rule as _next_anniversary)
    - a billing suspension is lifted
    Does not commit (the caller does)."""
    today = date.today()
    first_day = start or today
    if details.billing_next_date is not None and details.billing_next_date >= today:
        new_next = details.billing_next_date + timedelta(days=BILLING_CYCLE_DAYS)
    else:
        new_next = first_day + timedelta(days=BILLING_CYCLE_DAYS) - timedelta(days=1)
    details.registration_fee_paid_at = datetime.now(timezone.utc)
    details.billing_next_date = new_next
    details.billing_last_charged_at = datetime.now(timezone.utc)
    details.billing_suspended = False
    db.add(details)
    return new_next



def activate_plan_from_payment(db: Session, vehicle_owner_id, plan: str) -> Optional[str]:
    """The driver tapped Subscribe, paid in Razorpay and the money is in the wallet: buy the plan right now, so a payment
    always ends in an active subscription (no second tap). Returns a short result text, or None if nothing was needed.
    Called from the payment verify endpoint and from the payment recovery sweep. Commits."""
    plan = (plan or "").upper()
    details = db.query(VehicleOwnerDetails).filter(VehicleOwnerDetails.vehicle_owner_id == vehicle_owner_id).with_for_update().first()
    if details is None or plan not in ("MONTHLY", "YEARLY"):
        return None
    settings = get_billing_settings(db)
    today = date.today()
    active = details.billing_next_date is not None and details.billing_next_date >= today
    from app.crud.wallet import debit_wallet_allow_negative
    if plan == "MONTHLY":
        fee = int(settings["monthly_fee"])
        if fee <= 0 or (details.subscription_type == "MONTHLY" and active):
            return None
        debit_wallet_allow_negative(db, vehicle_owner_id=str(vehicle_owner_id), amount=fee, reference_id=None,
                                    reference_type="MONTHLY_SUBSCRIPTION_FEE", notes=f"Monthly subscription Rs.{fee} - activated by your payment")
        details.subscription_type = "MONTHLY"
        details.billing_next_date = today + timedelta(days=MONTHLY_CYCLE_DAYS)
    else:
        fee = int(settings["yearly_fee"])
        if fee <= 0 or (details.subscription_type == "YEARLY" and active):
            return None
        debit_wallet_allow_negative(db, vehicle_owner_id=str(vehicle_owner_id), amount=fee, reference_id=None,
                                    reference_type="YEARLY_UPGRADE_FEE", notes=f"Yearly subscription Rs.{fee} - activated by your payment")
        details.subscription_type = "YEARLY"
        details.billing_next_date = today + timedelta(days=BILLING_CYCLE_DAYS)
    details.auto_renew_from_wallet = True
    details.registration_fee_paid_at = details.registration_fee_paid_at or datetime.now(timezone.utc)
    details.billing_suspended = False
    details.billing_last_charged_at = datetime.now(timezone.utc)
    db.add(details)
    db.commit()
    return plan


RECOVER_WINDOW_DAYS = 3


def _has_active_plan(details) -> bool:
    return details.billing_next_date is not None and details.billing_next_date >= date.today()


def activate_if_fee_topup(db: Session, vehicle_owner_id, credited: int) -> Optional[str]:
    """Older Driver App builds do not say that a top-up is a subscription purchase. A top-up of exactly the monthly fee by someone
    with no active plan IS that purchase (owner rule 2026-10-02: paying the fee activates the plan), so activate it. Anything
    else is an ordinary wallet top-up and is left alone."""
    fee = int(get_billing_settings(db).get("monthly_fee") or 0)
    if fee <= 0 or int(credited or 0) != fee:
        return None
    details = db.query(VehicleOwnerDetails).filter(VehicleOwnerDetails.vehicle_owner_id == vehicle_owner_id).first()
    if details is None or _has_active_plan(details) or (details.wallet_balance or 0) < fee:
        return None
    return activate_plan_from_payment(db, vehicle_owner_id, "MONTHLY")


def recover_recent_fee_topups(db: Session) -> dict:
    """Finish what activate_if_fee_topup would have done for top-ups of exactly the monthly fee in the last few days (drivers who
    paid Rs 199 and only got wallet money). Idempotent: once the plan is active the owner no longer qualifies."""
    fee = int(get_billing_settings(db).get("monthly_fee") or 0)
    out = {"activated": 0, "checked": 0}
    if fee <= 0:
        return out
    since = datetime.now(timezone.utc) - timedelta(days=RECOVER_WINDOW_DAYS)
    owners = [r[0] for r in (
        db.query(WalletLedger.vehicle_owner_id)
        .filter(WalletLedger.reference_type == "RAZORPAY_PAYMENT", WalletLedger.entry_type == WalletEntryTypeEnum.CREDIT,
                WalletLedger.amount == fee, WalletLedger.created_at >= since)
        .distinct().all()
    )]
    for oid in owners:
        out["checked"] += 1
        try:
            if activate_if_fee_topup(db, oid, fee):
                out["activated"] += 1
        except Exception:  # noqa: BLE001
            db.rollback()
    return out


def run_monthly_auto_renewals(db: Session) -> dict:
    """Monthly subscribers are renewed from their wallet the day the month ends: wallet >= the fee -> the fee is debited
    (ledger MONTHLY_SUBSCRIPTION_FEE) and the next 30 days start; wallet too low -> nothing is taken and the plan simply lapses
    to Standard (tier follows the due date) until money is added and the plan is bought again. A renewed plan's date moves
    ahead, so running this repeatedly never double-charges."""
    fee = int(get_billing_settings(db).get("monthly_fee") or 0)
    out = {"renewed": 0, "wallet_too_low": 0, "checked": 0}
    if fee <= 0:
        return out
    today = date.today()
    rows = (
        db.query(VehicleOwnerDetails)
        .filter(VehicleOwnerDetails.subscription_type == "MONTHLY")
        .filter(VehicleOwnerDetails.billing_next_date.isnot(None))
        .filter(VehicleOwnerDetails.billing_next_date <= today)
        .filter(VehicleOwnerDetails.billing_next_date >= today - timedelta(days=MONTHLY_RENEWAL_GRACE_DAYS))   # long-lapsed plans are not charged behind the owner's back
        .filter(VehicleOwnerDetails.billing_suspended.is_(False))
        .filter(VehicleOwnerDetails.auto_renew_from_wallet.isnot(False))
        .all()
    )
    for d in rows:
        out["checked"] += 1
        before = d.wallet_balance or 0
        if before < fee:
            out["wallet_too_low"] += 1
            continue
        d.wallet_balance = before - fee
        d.billing_next_date = today + timedelta(days=MONTHLY_CYCLE_DAYS)
        d.billing_last_charged_at = datetime.now(timezone.utc)
        db.add(d)
        db.add(WalletLedger(
            vehicle_owner_id=d.vehicle_owner_id, reference_id=str(uuid.uuid4()), reference_type="MONTHLY_SUBSCRIPTION_FEE",
            entry_type=WalletEntryTypeEnum.DEBIT, amount=fee, balance_before=before, balance_after=before - fee,
            notes=f"Monthly subscription renewed automatically from your wallet (valid until {d.billing_next_date})",
        ))
        out["renewed"] += 1
    if out["renewed"]:
        db.commit()
    return out


def run_member_auto_renewals(db: Session) -> dict:
    """Yearly members whose year has run out are renewed AUTOMATICALLY from their wallet (no reminders, no opt-in).

    Deliberately separate from run_billing(): that one is switched off (billing_enabled=false) and, when on, first "seeds" a
    billing date for EVERY active account - which would turn never-paid accounts into Trusted members. This touches ONLY
    accounts that already paid (registration_fee_paid_at set or a billing_next_date) and whose date has arrived:
      * wallet >= yearly fee -> the fee is debited (ledger entry BILLING_YEARLY_FEE) and the year is extended
      * wallet too low       -> nothing is taken; the member becomes Standard when the date passes and can pay again any time
    Monthly subscribers are skipped (their own cycle). Safe to run repeatedly - a renewed member's date moves a year ahead."""
    settings = get_billing_settings(db)
    fee = int(settings.get("yearly_fee") or 0)
    out = {"renewed": 0, "wallet_too_low": 0, "checked": 0}
    try:                                   # monthly plans renew in the same 3-hourly pass (their own function, own fee)
        m = run_monthly_auto_renewals(db)
        for k in out:
            out[k] += m.get(k, 0)
        r = recover_recent_fee_topups(db)       # Rs 199 paid on an older app build, only wallet money so far: buy the plan now
        out["renewed"] += r.get("activated", 0)
    except Exception:  # noqa: BLE001
        db.rollback()
    if fee <= 0:
        return out
    today = date.today()
    rows = (
        db.query(VehicleOwnerDetails)
        .filter(VehicleOwnerDetails.billing_next_date.isnot(None))
        .filter(VehicleOwnerDetails.billing_next_date <= today)
        .filter(VehicleOwnerDetails.billing_suspended.is_(False))
        .filter((VehicleOwnerDetails.subscription_type.is_(None)) | (VehicleOwnerDetails.subscription_type != "MONTHLY"))
        .all()
    )
    for d in rows:
        out["checked"] += 1
        before = d.wallet_balance or 0
        if before < fee:
            out["wallet_too_low"] += 1
            continue
        new_next = d.billing_next_date + timedelta(days=BILLING_CYCLE_DAYS)
        if new_next <= today:
            new_next = today + timedelta(days=BILLING_CYCLE_DAYS) - timedelta(days=1)
        d.wallet_balance = before - fee
        d.billing_next_date = new_next
        d.billing_last_charged_at = datetime.now(timezone.utc)
        db.add(d)
        db.add(WalletLedger(
            vehicle_owner_id=d.vehicle_owner_id, reference_id=str(uuid.uuid4()), reference_type="BILLING_YEARLY_FEE",
            entry_type=WalletEntryTypeEnum.DEBIT, amount=fee, balance_before=before, balance_after=before - fee,
            notes=f"Yearly membership renewed automatically from your wallet (valid until {new_next})",
        ))
        out["renewed"] += 1
    if out["renewed"]:
        db.commit()
    return out
