"""KYC/document verification gates for the booking-assignment flow.

Rule (per the Verification Gate Redesign spec):
- Accepting a booking only requires the fleet owner's own KYC to be
  verified (Aadhar + PAN) - they don't need a specific car/driver picked
  out yet at accept time.
- Assigning a specific driver + car to an already-accepted booking
  requires THAT car and THAT driver to each be individually verified -
  an owner with one verified car and one unverified car can still accept
  bookings, they just can't assign the unverified one.

"Verified" mirrors the same mandatory-document set already surfaced to
users elsewhere in the product (see admin App Settings hint: "Mandatory
RC, Insurance, Permit & License validation") - FC and the car photo are
not gated on, matching that existing policy.
"""

from app.models.vehicle_owner_details import VehicleOwnerDetails
from app.models.car_details import CarDetails
from app.models.car_driver import CarDriver
from app.models.common_enums import DocumentStatusEnum


def is_owner_kyc_verified(owner: VehicleOwnerDetails) -> bool:
    if owner is None:
        return False
    # Owner must have submitted Aadhar details (number or image)
    if not owner.aadhar_front_img and not owner.aadhar_number:
        return False
    # Do not allow if explicitly rejected (DocumentStatusEnum has no
    # REJECTED member - INVALID is the real name for a document that
    # failed verification. The old `DocumentStatusEnum.REJECTED` here was
    # a bare class-attribute lookup that raises AttributeError on its own,
    # unconditionally, before ever comparing anything - so this function,
    # and therefore both accept_order and driver_create_booking_confirm
    # (the only two callers), 500'd on every single call.)
    if owner.aadhar_status == DocumentStatusEnum.INVALID or owner.pan_status == DocumentStatusEnum.INVALID:
        return False
    # Accept if VERIFIED or PENDING (submitted)
    return True


def _add_years(d, years: int):
    try:
        return d.replace(year=d.year + years)
    except ValueError:                      # 29 Feb
        return d.replace(year=d.year + years, day=28)


def fc_status_for_car(car, today=None) -> dict:
    """Does this vehicle need a Fitness Certificate? A NEW vehicle gets none for its first two years - no RTO issues one - so nothing is
    asked and nothing can expire until two years after the registration date printed on the RC. Returns
    {required: bool, free_until: date|None}. The registration date is what counts; the model year is only a fallback for older records."""
    from datetime import date
    today = today or date.today()
    reg = getattr(car, "registration_date", None)
    if reg is not None:
        free_until = _add_years(reg, 2)
        return {"required": today >= free_until, "free_until": free_until}
    year_text = str(getattr(car, "year_of_the_car", "") or "").strip()
    if year_text.isdigit() and len(year_text) == 4:
        return {"required": today.year - int(year_text) >= 2, "free_until": None}
    return {"required": bool(getattr(car, "fc_img_url", None) or getattr(car, "fc_expiry_date", None)), "free_until": None}


def expired_car_documents(car: CarDetails, today=None) -> list:
    """Names of the car's documents whose saved expiry date has passed. The RC has NO expiry date (only a registration date), so it never
    appears here. The FC counts only when the vehicle needs one (older than two years). A document with no date saved is not blocked."""
    from datetime import date
    today = today or date.today()
    out = []
    for label, field in (("Insurance", "insurance_expiry_date"), ("Permit", "permit_expiry_date")):
        d = getattr(car, field, None)
        if d is not None and d < today:
            out.append(label)
    fc_date = getattr(car, "fc_expiry_date", None)
    if fc_date is not None and fc_date < today and fc_status_for_car(car, today)["required"]:
        out.append("FC")
    return out


def expired_driver_documents(driver: CarDriver, today=None) -> list:
    from datetime import date
    today = today or date.today()
    d = getattr(driver, "licence_expiry_date", None)
    return ["Driving licence"] if (d is not None and d < today) else []


def invalid_car_documents(car: CarDetails, today=None) -> list:
    """Documents marked INVALID: the wrong document (an Aadhaar in the RC slot...), not an original, unreadable, or a date that
    does not match / is already expired. INVALID is NOT the same as "not verified yet" (PENDING / NEEDS_REVIEW) - those never block."""
    out = []
    for label, field in (("RC front", "rc_front_status"), ("RC back", "rc_back_status"),
                         ("Insurance", "insurance_status"), ("Permit", "permit_status")):
        if getattr(car, field, None) == DocumentStatusEnum.INVALID:
            out.append(label)
    if getattr(car, "fc_status", None) == DocumentStatusEnum.INVALID and fc_status_for_car(car, today)["required"]:
        out.append("FC")
    return out


def invalid_driver_documents(driver: CarDriver) -> list:
    out = []
    if getattr(driver, "licence_front_status", None) == DocumentStatusEnum.INVALID:
        out.append("Driving licence front")
    if getattr(driver, "licence_back_status", None) == DocumentStatusEnum.INVALID:
        out.append("Driving licence back")
    return out


def car_document_problems(car: CarDetails, today=None) -> list:
    """Plain-language reasons a car cannot take a booking: "Insurance has expired", "Permit is not valid - upload it again"."""
    return [f"{n} has expired" for n in expired_car_documents(car, today)] +            [f"{n} is not valid - upload the correct original again" for n in invalid_car_documents(car, today)]


def driver_document_problems(driver: CarDriver, today=None) -> list:
    return [f"{n} has expired" for n in expired_driver_documents(driver, today)] +            [f"{n} is not valid - upload the correct original again" for n in invalid_driver_documents(driver)]


def is_car_verified(car: CarDetails) -> bool:
    """A car may take bookings unless a document is EXPIRED or INVALID (wrong document / date mismatch). "Not verified yet"
    (PENDING / NEEDS_REVIEW) does NOT block (owner rule). The RC has no expiry date; the FC only counts for a vehicle that needs one."""
    if car is None:
        return False
    return not car_document_problems(car)


def is_driver_verified(driver: CarDriver) -> bool:
    """Same rule for the driver: an expired or INVALID licence blocks assignment; unverified does not."""
    if driver is None:
        return False
    return not driver_document_problems(driver)
