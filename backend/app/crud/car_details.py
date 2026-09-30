from sqlalchemy.orm import Session
from fastapi import HTTPException, status
from app.models.car_details import CarDetails, CarTypeEnum
from app.schemas.car_details import CarDetailsForm
from app.models.platform_setting import PlatformSetting
from typing import Optional, List
from uuid import UUID

NEW_CAR_MIN_YEAR_KEY = "new_car_min_year"
NEW_CAR_MIN_YEAR_DEFAULT = 2022


def get_new_car_min_year(db: Session) -> int:
    row = db.query(PlatformSetting).filter(PlatformSetting.key == NEW_CAR_MIN_YEAR_KEY).first()
    if row and row.value:
        try:
            return int(row.value)
        except ValueError:
            pass
    return NEW_CAR_MIN_YEAR_DEFAULT


def set_new_car_min_year(db: Session, year: int) -> int:
    row = db.query(PlatformSetting).filter(PlatformSetting.key == NEW_CAR_MIN_YEAR_KEY).first()
    if row:
        row.value = str(year)
    else:
        row = PlatformSetting(key=NEW_CAR_MIN_YEAR_KEY, value=str(year))
        db.add(row)
    db.commit()
    return year


def _check_duplicate_car_number(db: Session, car_number: str) -> None:
    existing_car = db.query(CarDetails).filter(
        CarDetails.car_number == car_number
    ).first()
    if existing_car:
        raise HTTPException(
            status_code=400,
            detail=f"Car with registration number {car_number} is already registered. Please use a different number."
        )


def create_car_details(db: Session, car_data: CarDetailsForm) -> CarDetails:
    """Create a new car details record in the database (driver self-signup path).

    Enforces the admin-configured minimum model year for NEW SEDAN - a driver
    cannot self-register that car_type unless their car's year meets the
    threshold. Older cars can still register under the regular SEDAN type.
    Not enforced for admin-created cars (see create_car_admin)."""
    _check_duplicate_car_number(db, car_data.car_number)

    # car_data.car_type is app.schemas.car_details.CarTypeEnum (a distinct
    # class from this file's CarTypeEnum, despite the identical name/values)
    # - compare by .value, not enum identity, or this check silently never matches.
    if car_data.car_type.value == CarTypeEnum.NEW_SEDAN_2022_MODEL.value:
        min_year = get_new_car_min_year(db)
        try:
            car_year = int(car_data.year_of_the_car) if car_data.year_of_the_car else None
        except ValueError:
            car_year = None
        if car_year is None or car_year < min_year:
            raise HTTPException(
                status_code=400,
                detail=f"NEW SEDAN requires a car model year of {min_year} or later. Register under the regular SEDAN type instead, or enter a valid year."
            )

    car_details = CarDetails(
        vehicle_owner_id=car_data.vehicle_owner_id,
        car_name=car_data.car_name,
        car_type=car_data.car_type.value,
        car_number=car_data.car_number,
        year_of_the_car=car_data.year_of_the_car,
        rc_front_img_url=None,  # Will be updated after GCS upload
        rc_back_img_url=None,   # Will be updated after GCS upload
        insurance_img_url=None, # Will be updated after GCS upload
        fc_img_url=None,        # Will be updated after GCS upload
        car_img_url=None        # Will be updated after GCS upload
    )

    db.add(car_details)
    db.commit()
    db.refresh(car_details)

    return car_details


def create_car_admin(
    db: Session,
    vehicle_owner_id: UUID,
    car_name: str,
    car_type: str,
    car_number: str,
    year_of_the_car: Optional[str] = None,
) -> CarDetails:
    """Admin-assigns a car directly to a fleet owner. Not subject to the
    NEW SEDAN minimum-year restriction (see create_car_details) - admin is
    trusted to assign the correct type. Documents are attached afterwards
    from the Cars screen, so car_status stays PROCESSING until then."""
    _check_duplicate_car_number(db, car_number)

    try:
        car_type_enum = CarTypeEnum(car_type)
    except ValueError:
        raise HTTPException(status_code=400, detail=f"Invalid car type: {car_type}")

    car_details = CarDetails(
        vehicle_owner_id=vehicle_owner_id,
        car_name=car_name,
        car_type=car_type_enum.value,
        car_number=car_number,
        year_of_the_car=year_of_the_car,
    )

    db.add(car_details)
    db.commit()
    db.refresh(car_details)

    return car_details

def update_car_images(db: Session, car_id: UUID, image_urls: dict, statuses: Optional[dict] = None) -> CarDetails:
    """Update the image URLs for an existing car details record.
    `statuses` (e.g. {'rc_front_img_url': DocumentStatusEnum.VERIFIED}) lets
    the caller pass the OCR auto-verification result per image instead of
    always defaulting to PENDING - optional, so existing callers that don't
    pass it keep the old always-PENDING behavior."""
    from app.models.common_enums import DocumentStatusEnum
    statuses = statuses or {}

    car_details = db.query(CarDetails).filter(
        CarDetails.id == car_id
    ).first()

    if not car_details:
        raise HTTPException(
            status_code=404,
            detail=f"Car details not found for ID: {car_id}"
        )

    # Update image URLs and set status (auto-verified if provided, else Pending)
    if 'rc_front_img_url' in image_urls:
        car_details.rc_front_img_url = image_urls['rc_front_img_url']
        car_details.rc_front_status = statuses.get('rc_front_img_url', DocumentStatusEnum.PENDING)
    if 'rc_back_img_url' in image_urls:
        car_details.rc_back_img_url = image_urls['rc_back_img_url']
        car_details.rc_back_status = statuses.get('rc_back_img_url', DocumentStatusEnum.PENDING)
    if 'insurance_img_url' in image_urls:
        car_details.insurance_img_url = image_urls['insurance_img_url']
        car_details.insurance_status = statuses.get('insurance_img_url', DocumentStatusEnum.PENDING)
    if 'fc_img_url' in image_urls:
        car_details.fc_img_url = image_urls['fc_img_url']
        car_details.fc_status = statuses.get('fc_img_url', DocumentStatusEnum.PENDING)
    if 'car_img_url' in image_urls:
        car_details.car_img_url = image_urls['car_img_url']
        car_details.car_img_status = statuses.get('car_img_url', DocumentStatusEnum.PENDING)
    if 'permit_img_url' in image_urls:
        car_details.permit_img_url = image_urls['permit_img_url']
        car_details.permit_status = statuses.get('permit_img_url', DocumentStatusEnum.PENDING)

    db.commit()
    db.refresh(car_details)

    return car_details

def get_car_by_id(db: Session, car_id: UUID) -> Optional[CarDetails]:
    """Get car details by ID"""
    return db.query(CarDetails).filter(CarDetails.id == car_id).first()


def get_car_detail_by_id(db: Session, car_id: UUID) -> Optional[CarDetails]:
    return db.query(CarDetails).filter(CarDetails.id == car_id).first()


def get_available_cars(db: Session, vehicle_owner_id: str) -> List[CarDetails]:
    """Get all available cars with ONLINE status for a fleet owner"""
    from app.models.car_details import CarStatusEnum
    return db.query(CarDetails).filter(
        CarDetails.vehicle_owner_id == vehicle_owner_id,
        CarDetails.car_status.in_([CarStatusEnum.ONLINE, CarStatusEnum.DRIVING])
    ).all()

def get_all_cars(db: Session, vehicle_owner_id: str) -> List[CarDetails]:
    """Get all available cars with ONLINE status for a fleet owner"""
    from app.models.car_details import CarStatusEnum
    return db.query(CarDetails).filter(
        CarDetails.vehicle_owner_id == vehicle_owner_id
    ).all()