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
    kind = Column(String, nullable=False, default="TEXT")  # TEXT | QUICK | VOICE
    quick_key = Column(String, nullable=True)              # which default question / suggested reply it came from
    text = Column(Text, nullable=False)
    # Set only when kind == "VOICE" - the GCS URL of the recording. `text`
    # still holds a plain-text fallback ("🎤 Voice message") for any client
    # that doesn't render audio yet, so nothing renders blank.
    voice_url = Column(String, nullable=True)
    reply_to_id = Column(Integer, nullable=True)            # WhatsApp-style reply: the message this one answers
    created_at = Column(TIMESTAMP(timezone=True), server_default=func.now(), nullable=False, index=True)
    read_at = Column(TIMESTAMP(timezone=True), nullable=True)   # when the OTHER side opened it
