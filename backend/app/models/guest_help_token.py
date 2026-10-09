"""Session for someone who can't log in (forgot password) but asked Admin for help.
The Driver App keeps the plain token on the phone; only its SHA-256 hash is stored here, so a database
leak does not let anyone read other people's help threads."""
from sqlalchemy import Column, Integer, String, Text, TIMESTAMP, func
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
    language = Column(String(2), nullable=True)           # en | ta | te | hi | kn - chosen in the chat, answers come in it
    reason = Column(String(100), nullable=True)           # what the person asked for in the help form
    topic = Column(String(20), nullable=True)             # the topic the chat is on now (password | mobile | identity | no_email ...)
    collected = Column(Text, nullable=True)               # JSON: the details the person has given in the chat so far (name, vehicle, new mobile, e-mail, last 4 of ID)
