"""LLM access for the chat bots (customer / partner / booking-group / admin assistant).

Builds on the patterns in utils/ai_llm.py (provider chosen by which key is configured, daily caps, kill switch, never raises)
and adds what chat needs:

  - ONE function per provider call, so tests can replace it and nothing here ever needs a real key to be exercised
  - an OpenAI-compatible provider ("local": Ollama / vLLM / a small FastAPI shim) that is NEVER the default - it is used only
    when the platform setting `chat_bot_provider` is set to "local" (so a model that has not passed the evaluation cannot
    become the default by accident)
  - Anthropic Messages API with tool use and prompt caching for the admin assistant
        models (env-overridable): main = claude-sonnet-5-5, cheap router = claude-haiku-4-5-20251001
        cache_control {"type": "ephemeral"} on the system block and the last tool; Haiku 4.5 needs >= 4096 tokens to cache
        (so the router is not cached), Sonnet 5.5 needs >= 512
        tool_choice is left on "auto": Sonnet 5.5 / Opus 5.5 reject forced tool_choice (any / tool) with HTTP 400

Kill switches (platform settings, "0" turns off):  ai_bot_enabled (everything)  chat_bot_enabled  chat_bot_enabled_<scope>
Caps (stored in the database, so they hold across every Cloud Run instance; if the database write fails the per-instance
fallback below still applies):  chat_bot_daily_limit (per user, default 40),
chat_bot_global_daily_limit (default 4000), admin_assistant_daily_limit (per admin, default 300)

Env vars:  GEMINI_API_KEY / ANTHROPIC_API_KEY (as before)   ANTHROPIC_ASSISTANT_MODEL   ANTHROPIC_ROUTER_MODEL
           LOCAL_LLM_BASE_URL (e.g. http://host:11434/v1)   LOCAL_LLM_MODEL   LOCAL_LLM_API_KEY (optional)
"""
import logging
import os
import time
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional, Tuple

import requests
from sqlalchemy.orm import Session

from app.utils import ai_llm

logger = logging.getLogger(__name__)

ANTHROPIC_MAIN = os.getenv("ANTHROPIC_ASSISTANT_MODEL", "claude-sonnet-5-5")
ANTHROPIC_CHEAP = os.getenv("ANTHROPIC_ROUTER_MODEL", "claude-haiku-4-5-20251001")
ANTHROPIC_URL = "https://api.anthropic.com/v1/messages"
ANTHROPIC_VERSION = "2023-06-01"
TIMEOUT_SCOPED = 14
TIMEOUT_ASSISTANT = 40

_counts: Dict[str, Tuple[str, int]] = {}
_global: List[Any] = ["", 0]


# ---------------------------------------------------------------- switches and caps
def _on(v: str) -> bool:
    return str(v).strip().lower() in ("1", "true", "yes", "on")


def enabled(db: Session, scope: str) -> bool:
    s = ai_llm._setting
    return _on(s(db, "ai_bot_enabled", "1")) and _on(s(db, "chat_bot_enabled", "1")) and _on(s(db, f"chat_bot_enabled_{scope.lower()}", "1"))


def _db_within_limits(db: Session, user_key: str, per_user: int, global_cap: int) -> Optional[bool]:
    """True / False from the shared counters, None when the database cannot be used (the caller falls back to memory)."""
    try:
        from sqlalchemy import text
        today = datetime.now(timezone.utc).date()
        rows = {r[0]: r[1] for r in db.execute(text("SELECT key, count FROM bot_usage_counters WHERE day = :d AND key IN (:u, 'global')"), {"d": today, "u": user_key}).fetchall()}
        if rows.get(user_key, 0) >= per_user or rows.get("global", 0) >= global_cap:
            return False
        for k in (user_key, "global"):
            db.execute(text("INSERT INTO bot_usage_counters (key, day, count) VALUES (:k, :d, 1) ON CONFLICT (key, day) DO UPDATE SET count = bot_usage_counters.count + 1"), {"k": k, "d": today})
        db.commit()
        return True
    except Exception as e:  # noqa: BLE001
        db.rollback()
        logger.warning("usage counters unavailable, using memory: %s", type(e).__name__)
        return None


def within_limits(db: Session, user_key: str, *, per_user_setting: str = "chat_bot_daily_limit", per_user_default: str = "40") -> bool:
    per_user = int(float(ai_llm._setting(db, per_user_setting, per_user_default)))
    global_cap = int(float(ai_llm._setting(db, "chat_bot_global_daily_limit", "4000")))
    shared = _db_within_limits(db, user_key, per_user, global_cap)
    if shared is not None:
        return shared
    today = datetime.now(timezone.utc).strftime("%Y-%m-%d")
    day, n = _counts.get(user_key, (today, 0))
    if day != today:
        n = 0
    if _global[0] != today:
        _global[0], _global[1] = today, 0
    if n >= per_user or _global[1] >= global_cap:
        return False
    _counts[user_key] = (today, n + 1)
    _global[1] += 1
    if len(_counts) > 5000:
        _counts.clear()
    return True


def local_available() -> bool:
    return bool((os.getenv("LOCAL_LLM_BASE_URL") or "").strip() and (os.getenv("LOCAL_LLM_MODEL") or "").strip())


def scoped_provider(db: Session) -> Optional[str]:
    """Which provider answers the customer / partner / booking bots. The local model only when explicitly selected."""
    chosen = ai_llm._setting(db, "chat_bot_provider", "auto").strip().lower()
    if chosen == "local":
        return "local" if local_available() else None
    if chosen == "gemini":
        return "gemini" if ai_llm._real_key("GEMINI_API_KEY") else None
    if chosen == "anthropic":
        return "anthropic" if ai_llm._real_key("ANTHROPIC_API_KEY") else None
    return ai_llm.provider()


def assistant_available() -> bool:
    """The admin assistant needs tool use, which this module implements for Anthropic only."""
    return ai_llm._real_key("ANTHROPIC_API_KEY")


# ---------------------------------------------------------------- scoped bots: JSON reply
def _call_local(system: str, turns: List[Dict[str, str]]) -> Optional[str]:
    base = (os.getenv("LOCAL_LLM_BASE_URL") or "").rstrip("/")
    headers = {"content-type": "application/json"}
    if os.getenv("LOCAL_LLM_API_KEY"):
        headers["authorization"] = f"Bearer {os.getenv('LOCAL_LLM_API_KEY')}"
    body = {
        "model": os.getenv("LOCAL_LLM_MODEL"), "temperature": 0.3, "max_tokens": 500,
        "messages": [{"role": "system", "content": system}] + [{"role": t["role"], "content": t["text"]} for t in turns],
    }
    r = requests.post(f"{base}/chat/completions", headers=headers, json=body, timeout=TIMEOUT_SCOPED)
    if r.status_code != 200:
        logger.warning("local llm HTTP %s", r.status_code)
        return None
    choices = r.json().get("choices") or [{}]
    return ((choices[0].get("message") or {}).get("content")) or None


def complete_json(db: Session, system: str, turns: List[Dict[str, str]]) -> Optional[Dict[str, Any]]:
    """{reply, needs_human, suggestions} or None. Never raises."""
    prov = scoped_provider(db)
    if prov is None:
        return None
    try:
        t0 = time.time()
        if prov == "gemini":
            raw = ai_llm._call_gemini(system, turns)
        elif prov == "local":
            raw = _call_local(system, turns)
        else:
            raw = ai_llm._call_anthropic(system, turns)
        logger.info("chat bot (%s) answered in %.1fs", prov, time.time() - t0)
        return ai_llm._parse(raw or "")
    except Exception as e:  # noqa: BLE001
        logger.warning("chat bot call failed: %s", type(e).__name__)
        return None


# ---------------------------------------------------------------- Anthropic Messages API (admin assistant)
def anthropic_request(body: Dict[str, Any]) -> Optional[Dict[str, Any]]:
    """POST /v1/messages. Returns the parsed response or None. Tests replace this function."""
    try:
        r = requests.post(
            ANTHROPIC_URL,
            headers={"x-api-key": os.getenv("ANTHROPIC_API_KEY", ""), "anthropic-version": ANTHROPIC_VERSION, "content-type": "application/json"},
            json=body, timeout=TIMEOUT_ASSISTANT,
        )
        if r.status_code != 200:
            logger.warning("anthropic assistant HTTP %s: %s", r.status_code, r.text[:200])
            return None
        return r.json()
    except Exception as e:  # noqa: BLE001
        logger.warning("anthropic assistant call failed: %s", type(e).__name__)
        return None


def text_of(content: List[Dict[str, Any]]) -> str:
    return "".join(b.get("text", "") for b in content or [] if b.get("type") == "text").strip()
