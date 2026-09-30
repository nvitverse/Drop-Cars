from sqlalchemy import Column, String, Boolean, TIMESTAMP, JSON
from sqlalchemy.dialects.postgresql import ARRAY
from app.database.session import Base

class Notification(Base):
    __tablename__ = "notifications"
    user = Column(String,nullable=False)
    sub = Column(String, primary_key=True, index=True)  # User ID from JWT
    permission1 = Column(Boolean, default=False)
    permission2 = Column(Boolean, default=False)
    token = Column(String, nullable=True)  # Expo push token
    selected_city = Column(ARRAY(String), nullable=True)
    # Temporary snooze (Settings > Mute Notifications: 15m/1h/5h/8h/24h).
    # Checked server-side before every push send - not just client-side -
    # so muting still works even if the app is fully closed. Null = not muted.
    muted_until = Column(TIMESTAMP(timezone=True), nullable=True)
    # {event_key: channel_id} of the custom-sound channels this device has
    # created (see utils/notification_settings.apply_device_sound_channels).
    sound_channels = Column(JSON, nullable=True)
