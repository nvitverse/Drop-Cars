# crud/referrals.py
"""
Referral program: an owner shares their own code, a new owner enters it once
(at signup or later, before their first bonus-eligible trip). The bonus is
credited to the REFERRER only after the referred owner's first COMPLETED
trip (see credit_referral_bonus_if_eligible, called from crud/end_records.py)
- not at signup - so a fake/never-driving referral never pays out.
"""
import random
import string
from typing import Optional

from fastapi import HTTPException
from sqlalchemy.orm import Session

from app.models.vehicle_owner_details import VehicleOwnerDetails
from app.models.platform_setting import PlatformSetting

REFERRAL_BONUS_SETTING_KEY = "referral_bonus_amount"
REFERRAL_BONUS_DEFAULT = 100


def get_referral_bonus_amount(db: Session) -> int:
    row = db.query(PlatformSetting).filter(PlatformSetting.key == REFERRAL_BONUS_SETTING_KEY).first()
    return int(row.value) if row and row.value else REFERRAL_BONUS_DEFAULT


def set_referral_bonus_amount(db: Session, amount: int) -> int:
    if amount < 0:
        raise HTTPException(status_code=400, detail="Referral bonus cannot be negative")
    row = db.query(PlatformSetting).filter(PlatformSetting.key == REFERRAL_BONUS_SETTING_KEY).first()
    if row:
        row.value = str(int(amount))
    else:
        row = PlatformSetting(key=REFERRAL_BONUS_SETTING_KEY, value=str(int(amount)))
    db.add(row)
    db.commit()
    return int(amount)


def _generate_unique_code(db: Session) -> str:
    alphabet = string.ascii_uppercase + string.digits
    for _ in range(20):
        code = "DC" + "".join(random.choices(alphabet, k=6))
        exists = db.query(VehicleOwnerDetails).filter(VehicleOwnerDetails.referral_code == code).first()
        if not exists:
            return code
    raise HTTPException(status_code=500, detail="Could not generate a unique referral code, please try again")


def get_or_create_referral_code(db: Session, vehicle_owner_id) -> VehicleOwnerDetails:
    details = db.query(VehicleOwnerDetails).filter(
        VehicleOwnerDetails.vehicle_owner_id == vehicle_owner_id
    ).with_for_update().first()
    if not details:
        raise HTTPException(status_code=404, detail="Account not found")
    if not details.referral_code:
        details.referral_code = _generate_unique_code(db)
        db.add(details)
        db.commit()
        db.refresh(details)
    return details


def apply_referral_code(db: Session, vehicle_owner_id, code: str) -> VehicleOwnerDetails:
    code = (code or "").strip().upper()
    if not code:
        raise HTTPException(status_code=400, detail="Please enter a referral code")

    details = db.query(VehicleOwnerDetails).filter(
        VehicleOwnerDetails.vehicle_owner_id == vehicle_owner_id
    ).with_for_update().first()
    if not details:
        raise HTTPException(status_code=404, detail="Account not found")
    if details.referred_by_code:
        raise HTTPException(status_code=400, detail="A referral code has already been applied to this account")
    if details.referral_code == code:
        raise HTTPException(status_code=400, detail="You can't use your own referral code")

    referrer = db.query(VehicleOwnerDetails).filter(VehicleOwnerDetails.referral_code == code).first()
    if not referrer:
        raise HTTPException(status_code=404, detail="Referral code not found")

    details.referred_by_code = code
    db.add(details)
    db.commit()
    db.refresh(details)
    return details


def credit_referral_bonus_if_eligible(db: Session, vehicle_owner_id) -> None:
    """Called once a trip completes. Best-effort - caller decides whether to
    let a failure here bubble up (it shouldn't; wrap in try/except)."""
    details = db.query(VehicleOwnerDetails).filter(
        VehicleOwnerDetails.vehicle_owner_id == vehicle_owner_id
    ).with_for_update().first()
    if not details or not details.referred_by_code or details.referral_bonus_credited:
        return

    referrer = db.query(VehicleOwnerDetails).filter(
        VehicleOwnerDetails.referral_code == details.referred_by_code
    ).first()
    if not referrer:
        return

    bonus = get_referral_bonus_amount(db)
    if bonus > 0:
        from app.crud.wallet import credit_wallet
        credit_wallet(
            db,
            vehicle_owner_id=str(referrer.vehicle_owner_id),
            amount=bonus,
            reference_id=str(details.vehicle_owner_id),
            reference_type="REFERRAL_BONUS",
            notes=f"Referral bonus - {details.full_name}'s first completed trip",
        )

    details.referral_bonus_credited = True
    db.add(details)
    db.commit()


def credit_customer_referral_bonus_if_eligible(db: Session, booking) -> None:
    """Called once a trip completes, for the CustomerBookingRequest linked to
    that order (customer entered a driver's referral code at booking time -
    see models/customer_booking_request.py). Best-effort - caller wraps in
    try/except. Pays out at most once per (driver, customer) pair: if this
    customer has any other row with the same code already marked
    referral_bonus_credited, this is a repeat booking and nothing is paid."""
    from app.models.customer_booking_request import CustomerBookingRequest

    code = (booking.driver_referral_code or "").strip().upper()
    if not code or booking.referral_bonus_credited:
        return

    already_paid = db.query(CustomerBookingRequest).filter(
        CustomerBookingRequest.customer_id == booking.customer_id,
        CustomerBookingRequest.driver_referral_code == code,
        CustomerBookingRequest.referral_bonus_credited == True,  # noqa: E712
        CustomerBookingRequest.id != booking.id,
    ).first()
    if already_paid:
        return

    driver = db.query(VehicleOwnerDetails).filter(VehicleOwnerDetails.referral_code == code).first()
    if not driver:
        return

    bonus = get_referral_bonus_amount(db)
    if bonus > 0:
        from app.crud.wallet import credit_wallet
        credit_wallet(
            db,
            vehicle_owner_id=str(driver.vehicle_owner_id),
            amount=bonus,
            reference_id=str(booking.id),
            reference_type="CUSTOMER_REFERRAL_BONUS",
            notes=f"Referral bonus - {booking.customer_name}'s first completed trip via your code",
        )

    booking.referral_bonus_credited = True
    db.add(booking)
    db.commit()
