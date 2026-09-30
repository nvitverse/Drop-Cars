from sqlalchemy import Column, Integer, String, TIMESTAMP, Boolean, Text
from datetime import datetime
from app.database.session import Base

class SosAlert(Base):
    __tablename__ = "sos_alerts"

    id = Column(Integer, primary_key=True, index=True, autoincrement=True)
    customer_id = Column(String, nullable=True)
    order_id = Column(String, nullable=True)
    emergency_contact = Column(String, nullable=True)
    latitude = Column(String, nullable=True)
    longitude = Column(String, nullable=True)
    tracking_link = Column(String, nullable=True)
    status = Column(String, nullable=False, default="ACTIVE")
    created_at = Column(TIMESTAMP, nullable=False, default=datetime.utcnow)
