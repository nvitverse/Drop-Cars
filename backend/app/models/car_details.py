# models/car_details.py
from sqlalchemy import Column, String, TIMESTAMP, Integer, Float, Date, func, Enum as SqlEnum, ForeignKey
import uuid
import enum
from sqlalchemy.dialects.postgresql import UUID
from app.database.session import Base
from app.models.common_enums import DocumentStatusEnum

class CarStatusEnum(enum.Enum):
    ONLINE = "ONLINE"
    DRIVING = "DRIVING"
    BLOCKED = "BLOCKED"
    PROCESSING = "PROCESSING"
    
class CarTypeEnum(enum.Enum):
    HATCHBACK = "HATCHBACK"
    SEDAN_4_PLUS_1 = "SEDAN_4_PLUS_1"
    NEW_SEDAN_2022_MODEL = "NEW_SEDAN_2022_MODEL"
    ETIOS_4_PLUS_1 = "ETIOS_4_PLUS_1"
    SUV = "SUV"
    SUV_6_PLUS_1 = "SUV_6_PLUS_1"
    SUV_7_PLUS_1 = "SUV_7_PLUS_1"
    INNOVA = "INNOVA"
    INNOVA_6_PLUS_1 = "INNOVA_6_PLUS_1"
    INNOVA_7_PLUS_1 = "INNOVA_7_PLUS_1"
    INNOVA_CRYSTA = "INNOVA_CRYSTA"
    INNOVA_CRYSTA_6_PLUS_1 = "INNOVA_CRYSTA_6_PLUS_1"
    INNOVA_CRYSTA_7_PLUS_1 = "INNOVA_CRYSTA_7_PLUS_1"
    TEMPO_TRAVELLER_12 = "TEMPO_TRAVELLER_12"
    TEMPO_TRAVELLER_14 = "TEMPO_TRAVELLER_14"
    TEMPO_TRAVELLER_18 = "TEMPO_TRAVELLER_18"
    URBANIA_12 = "URBANIA_12"
    URBANIA_14 = "URBANIA_14"
    URBANIA_16 = "URBANIA_16"

class CarDetails(Base):
    __tablename__ = "car_details"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4, unique=True, index=True)
    vehicle_owner_id = Column(UUID(as_uuid=True), ForeignKey("vehicle_owner.id"), nullable=False)
    car_name = Column(String, nullable=False)
    car_type = Column(SqlEnum(CarTypeEnum,name="car_type_enum"),nullable=False)  # sedan, suv, muv, innova
    car_number = Column(String, nullable=False, unique=True)
    year_of_the_car = Column(String, nullable=True)
    
    rc_front_img_url = Column(String, nullable=True, unique=True)     # GCS public URL
    rc_front_status = Column(SqlEnum(DocumentStatusEnum, name="document_status_enum"), nullable=True, default=DocumentStatusEnum.PENDING)
    # 'MANUAL' or 'API_AUTO' once set - null means not yet verified either
    # way. See crud/auto_verify.py - the auto-verify API isn't wired yet
    # (no API key), this column just leaves room for it.
    rc_verification_source = Column(String, nullable=True)
    rc_back_img_url = Column(String, nullable=True, unique=True)      # GCS public URL
    rc_back_status = Column(SqlEnum(DocumentStatusEnum, name="document_status_enum"), nullable=True, default=DocumentStatusEnum.PENDING)
    insurance_img_url = Column(String , nullable=True, unique=True)  # GCS public URL
    insurance_status = Column(SqlEnum(DocumentStatusEnum, name="document_status_enum"), nullable=True, default=DocumentStatusEnum.PENDING)
    fc_img_url = Column(String, nullable=True, unique=True)  # GCS public URL
    fc_status = Column(SqlEnum(DocumentStatusEnum, name="document_status_enum"), nullable=True, default=DocumentStatusEnum.PENDING)
    car_img_url = Column(String, nullable=True, unique=True)  # GCS public URL
    car_img_status = Column(SqlEnum(DocumentStatusEnum, name="document_status_enum"), nullable=True, default=DocumentStatusEnum.PENDING)
    permit_img_url = Column(String, nullable=True, unique=True)  # GCS public URL
    permit_status = Column(SqlEnum(DocumentStatusEnum, name="document_status_enum"), nullable=True, default=DocumentStatusEnum.PENDING)

    # Expiry dates for the daily document-expiry reminder sweep (see
    # crud/document_expiry.py). Nullable/optional - not every existing car
    # has these entered yet; the reminder simply skips rows with no date set.
    rc_expiry_date = Column(Date, nullable=True)
    insurance_expiry_date = Column(Date, nullable=True)

    car_status = Column(
        SqlEnum(CarStatusEnum, name="car_status_enum"),
        default=CarStatusEnum.PROCESSING,
        nullable=False
    )
    # Aggregate customer rating (1.0-5.0 stars), recomputed whenever a new
    # Rating row is submitted for a trip this car was used on.
    rating_avg = Column(Float, nullable=False, default=0.0, server_default="0")
    rating_count = Column(Integer, nullable=False, default=0, server_default="0")
    created_at = Column(TIMESTAMP(timezone=True), server_default=func.now(), nullable=False)
