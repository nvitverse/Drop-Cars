from sqlalchemy import Column, Integer, String, TIMESTAMP, Boolean, Text
from datetime import datetime
from app.database.session import Base

class SosAlert(Base):
    __tablename__ = "sos_alerts"

    id = Column(Integer, primary_key=True, index=True, autoincrement=True)
    customer_id = Column(String, nullable=True)
    driver_id = Column(String, nullable=True)
    order_id = Column(String, nullable=True)
    triggered_by_role = Column(String, nullable=False, default="CUSTOMER")  # CUSTOMER, DRIVER, OWNER
    customer_phone = Column(String, nullable=True)
    driver_phone = Column(String, nullable=True)
    driver_name = Column(String, nullable=True)
    car_number = Column(String, nullable=True)
    emergency_contact = Column(String, nullable=True)
    latitude = Column(String, nullable=True)
    longitude = Column(String, nullable=True)
    tracking_link = Column(String, nullable=True)
    status = Column(String, nullable=False, default="ACTIVE")  # ACTIVE, ACKNOWLEDGED, RESOLVED, FALSE_ALARM
    acknowledged_by = Column(String, nullable=True)
    acknowledged_at = Column(TIMESTAMP, nullable=True)
    resolved_by = Column(String, nullable=True)
    resolved_at = Column(TIMESTAMP, nullable=True)
    resolution_notes = Column(Text, nullable=True)
    created_at = Column(TIMESTAMP, nullable=False, default=datetime.utcnow)
    updated_at = Column(TIMESTAMP, nullable=False, default=datetime.utcnow, onupdate=datetime.utcnow)
