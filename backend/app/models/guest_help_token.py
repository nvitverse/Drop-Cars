"""Session for someone who can't log in (forgot password) but asked Admin for help.
The Driver App keeps the plain token on the phone; only its SHA-256 hash is stored here, so a database
leak does not let anyone read other people's help threads."""
from sqlalchemy import Column, Integer, String, TIMESTAMP, func
from app.database.session import Base


class GuestHelpToken(Base):
    __tablename__ = "guest_help_tokens"

    id = Column(Integer, primary_key=True, autoincrement=True)
    token_hash = Column(String(64), nullable=False, unique=True, index=True)
    thread_key = Column(String, nullable=False, index=True)       # the account's own id: same thread Admin sees
    role = Column(String, nullable=False)                           # OWNER | DRIVER
    primary_number = Column(String(10), nullable=False)
    created_at = Column(TIMESTAMP(timezone=True), server_default=func.now(), nullable=False)
    expires_at = Column(TIMESTAMP(timezone=True), nullable=False)
