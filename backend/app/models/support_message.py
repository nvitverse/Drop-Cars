# models/support_message.py
"""Real two-way chat between a driver/owner and Drop Cars Admin, for
anything that ISN'T about one specific booking (a booking question goes
through booking_chat.py's per-order thread instead - see the Driver App's
"About a specific booking" option). One thread per sender (thread_key),
newest message last. No order_id - this is the general Support inbox."""
from sqlalchemy import Column, Integer, String, Text, TIMESTAMP, func
from app.database.session import Base


class SupportMessage(Base):
    __tablename__ = "support_messages"

    id = Column(Integer, primary_key=True, autoincrement=True)
    # Who this thread belongs to - the driver/owner's own id as a string,
    # so every message from them or an Admin reply to them lands in the
    # same thread regardless of which app token sent it.
    thread_key = Column(String, nullable=False, index=True)
    thread_role = Column(String, nullable=False)          # DRIVER | OWNER (who owns the thread)
    thread_name = Column(String, nullable=True)            # display name/number, snapshotted for the Admin inbox list
    sender_side = Column(String, nullable=False)            # DRIVER_OWNER | ADMIN
    sender_name = Column(String, nullable=True)
    text = Column(Text, nullable=False)
    # Set when this message is a voice note - the GCS URL of the recording.
    # `text` still holds a plain-text fallback ("🎤 Voice message").
    voice_url = Column(String, nullable=True)
    created_at = Column(TIMESTAMP(timezone=True), server_default=func.now(), nullable=False, index=True)
    read_at = Column(TIMESTAMP(timezone=True), nullable=True)   # when the OTHER side opened it
