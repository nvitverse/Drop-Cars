"""The customer's e-mail for a booking that did not come from the website (a phone / admin / vendor booking): the driver asks the customer
at the end of the trip and types it on the bill screen, and the trip bill is mailed there. Kept apart from the order tables so no order flow
has to change. One row per order, replaced on every save."""
from sqlalchemy import Column, Integer, String, TIMESTAMP, func

from app.database.session import Base


class OrderCustomerEmail(Base):
    __tablename__ = "order_customer_emails"

    order_id = Column(Integer, primary_key=True, autoincrement=False)
    email = Column(String, nullable=False)
    added_by = Column(String, nullable=True)          # driver id
    created_at = Column(TIMESTAMP(timezone=True), server_default=func.now(), nullable=False)
