# models/vehicle_matching.py
#
# Vehicle-type matching for booking acceptance: a booking is posted for a
# specific car type (e.g. INNOVA_CRYSTA), and only a fleet owner who
# actually has a matching, verified car should be able to accept/assign
# it - previously nothing enforced this at all, so a driver whose whole
# fleet was Sedans could accept and assign a Crysta-requested booking.
#
# Two tables here support that gate plus its escape hatch:
# - VehicleMismatchAttempt: a log of every blocked attempt (no matching
#   car in the fleet), for Admin App visibility into real unmet demand.
# - CarSubstitutionRequest: "I don't have that exact car, but let me
#   offer mine instead" - reviewed and approved/rejected by Admin only
#   (not the original poster - simpler and matches how Admin already
#   oversees every trip type).

from sqlalchemy import Column, String, TIMESTAMP, Integer, Enum as SqlEnum, ForeignKey, Text
from sqlalchemy.dialects.postgresql import UUID
import uuid
import enum
from datetime import datetime
from app.database.session import Base

import app.models.orders
import app.models.vehicle_owner
import app.models.car_details
import app.models.car_driver
from app.models.new_orders import CarTypeEnum


class VehicleMismatchAttempt(Base):
    __tablename__ = "vehicle_mismatch_attempts"

    id = Column(Integer, primary_key=True, autoincrement=True)
    order_id = Column(Integer, ForeignKey("orders.id"), nullable=False)
    vehicle_owner_id = Column(UUID(as_uuid=True), ForeignKey("vehicle_owner.id"), nullable=False)
    required_car_type = Column(SqlEnum(CarTypeEnum, name="car_type_enum"), nullable=False)
    attempted_at = Column(TIMESTAMP, default=datetime.utcnow, nullable=False)


class SubstitutionRequestStatusEnum(str, enum.Enum):
    PENDING = "PENDING"
    APPROVED = "APPROVED"
    REJECTED = "REJECTED"


class CarSubstitutionRequest(Base):
    """A fleet owner without the exact required car type asking to fulfil
    the booking with a different car of theirs instead. Admin reviews and
    either approves (which assigns that car+driver to the booking, same
    as a normal accept+assign) or rejects it."""
    __tablename__ = "car_substitution_requests"

    id = Column(Integer, primary_key=True, autoincrement=True)
    order_id = Column(Integer, ForeignKey("orders.id"), nullable=False)
    vehicle_owner_id = Column(UUID(as_uuid=True), ForeignKey("vehicle_owner.id"), nullable=False)
    car_id = Column(UUID(as_uuid=True), ForeignKey("car_details.id"), nullable=False)
    driver_id = Column(UUID(as_uuid=True), ForeignKey("car_driver.id"), nullable=False)
    required_car_type = Column(SqlEnum(CarTypeEnum, name="car_type_enum"), nullable=False)
    offered_car_type = Column(SqlEnum(CarTypeEnum, name="car_type_enum"), nullable=False)
    status = Column(SqlEnum(SubstitutionRequestStatusEnum), nullable=False, default=SubstitutionRequestStatusEnum.PENDING)
    admin_notes = Column(Text, nullable=True)
    created_at = Column(TIMESTAMP, default=datetime.utcnow, nullable=False)
    decided_at = Column(TIMESTAMP, nullable=True)
    decided_by_admin_id = Column(UUID(as_uuid=True), nullable=True)
