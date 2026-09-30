from sqlalchemy import Column, Integer, String, Text, TIMESTAMP, ForeignKey, func
from app.database.session import Base


class BookingChatMessage(Base):
    """One message in the chat attached to a booking: the person who POSTED it (vendor / driver poster) talks to the
    driver side (accepting fleet owner + assigned driver). Chat data is purged automatically after 10 days
    (crud/booking_chat.py purge_old_chat_messages) to keep storage clean."""
    __tablename__ = "booking_chat_messages"

    id = Column(Integer, primary_key=True, autoincrement=True)
    order_id = Column(Integer, ForeignKey("orders.id"), nullable=False, index=True)
    sender_side = Column(String, nullable=False)          # POSTER | DRIVER
    sender_id = Column(String, nullable=True)
    sender_name = Column(String, nullable=True)
    kind = Column(String, nullable=False, default="TEXT")  # TEXT | QUICK
    quick_key = Column(String, nullable=True)              # which default question / suggested reply it came from
    text = Column(Text, nullable=False)
    created_at = Column(TIMESTAMP(timezone=True), server_default=func.now(), nullable=False, index=True)
    read_at = Column(TIMESTAMP(timezone=True), nullable=True)   # when the OTHER side opened it
