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


def is_car_verified(car: CarDetails) -> bool:
    if car is None:
        return False
    # Allow assignment as long as none of the required documents are explicitly INVALID
    return (
        car.rc_front_status != DocumentStatusEnum.INVALID
        and car.rc_back_status != DocumentStatusEnum.INVALID
        and car.insurance_status != DocumentStatusEnum.INVALID
        and car.permit_status != DocumentStatusEnum.INVALID
    )


def is_driver_verified(driver: CarDriver) -> bool:
    if driver is None:
        return False
    # Allow assignment as long as none of the required documents are explicitly INVALID
    return (
        driver.licence_front_status != DocumentStatusEnum.INVALID
        and driver.licence_back_status != DocumentStatusEnum.INVALID
    )
