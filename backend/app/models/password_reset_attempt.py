# models/password_reset_attempt.py
"""
Brute-force guard for self-service password reset (no SMS available, so the
reset proves identity with stored KYC data — this table caps guesses).
"""
from sqlalchemy import Column, String, Integer, TIMESTAMP, func
from app.database.session import Base


class PasswordResetAttempt(Base):
    __tablename__ = "password_reset_attempts"

    primary_number = Column(String, primary_key=True, index=True)
    attempts = Column(Integer, nullable=False, default=0)
    window_start = Column(TIMESTAMP(timezone=True), server_default=func.now(), nullable=False)
