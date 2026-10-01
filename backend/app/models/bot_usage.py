"""Daily usage counters for the chat bots / assistant / voice typing.

The per-instance counters in utils/chat_llm.py were only a cost guard: with several Cloud Run instances the real ceiling was
(limit x instances). These rows make the caps global. One row per (key, day): key is "user:<scope>:<role>:<id>", "admin:<id>",
"stt:<id>" or "global".
"""
from sqlalchemy import Column, Date, Integer, String

from app.database.session import Base


class BotUsageCounter(Base):
    __tablename__ = "bot_usage_counters"

    key = Column(String, primary_key=True)
    day = Column(Date, primary_key=True)
    count = Column(Integer, nullable=False, default=0)
