"""Lightweight health monitoring for the Admin App's "System Health" page.

Everything here is free: request timings are kept in this instance's memory (a small ring buffer), and the database is
asked a couple of cheap questions (SELECT 1, connection count, size). Nothing is stored except the last-alert timestamps
in platform_settings, so an alert is not re-sent every minute.

Note: Cloud Run may run several instances - the request numbers are for the instance that answers the page (labelled
in the response); database numbers are global.
"""
import time
from collections import deque
from datetime import datetime, timezone
from typing import Any, Dict, List

from sqlalchemy import text
from sqlalchemy.orm import Session

STARTED_AT = time.time()
_WINDOW_SECONDS = 15 * 60
_requests: deque = deque(maxlen=5000)   # (timestamp, seconds, status_code)
_last_sweep: Dict[str, Any] = {"at": None, "ok": None, "detail": None}

HEALTH_DEFAULTS = {
    "health_db_ms_warn": 500,       # database answer slower than this (ms) -> alert
    "health_error_pct_warn": 5,     # more than this % of requests failing (5xx) in the last 15 min -> alert
    "health_slow_ms_warn": 3000,    # average API answer slower than this (ms) -> alert
    "health_conn_pct_warn": 80,     # more than this % of database connections in use -> alert
    "health_alerts_enabled": 1,     # push alerts to the admin phones
    "health_alert_gap_minutes": 60, # do not repeat the same alert more often than this
}
ALERT_LAST_KEY = "health_alert_last_sent"   # platform_settings: JSON {alert_key: iso timestamp}


def record_request(seconds: float, status_code: int) -> None:
    _requests.append((time.time(), seconds, status_code))


def record_sweep(ok: bool, detail: Any = None) -> None:
    _last_sweep.update({"at": datetime.now(timezone.utc).isoformat(), "ok": ok, "detail": detail})


def _thresholds(db: Session) -> Dict[str, float]:
    from app.models.platform_setting import PlatformSetting
    out = dict(HEALTH_DEFAULTS)
    rows = db.query(PlatformSetting).filter(PlatformSetting.key.in_(list(HEALTH_DEFAULTS.keys()))).all()
    for r in rows:
        try:
            out[r.key] = float(r.value)
        except (TypeError, ValueError):
            pass
    return out


def save_thresholds(db: Session, updates: Dict[str, Any]) -> Dict[str, float]:
    from app.models.platform_setting import PlatformSetting
    for k, v in updates.items():
        if k not in HEALTH_DEFAULTS:
            continue
        row = db.query(PlatformSetting).filter(PlatformSetting.key == k).first()
        if row:
            row.value = str(v)
        else:
            db.add(PlatformSetting(key=k, value=str(v)))
    db.commit()
    return _thresholds(db)


def _request_stats() -> Dict[str, Any]:
    cutoff = time.time() - _WINDOW_SECONDS
    rows = [r for r in _requests if r[0] >= cutoff]
    n = len(rows)
    if not n:
        return {"window_minutes": _WINDOW_SECONDS // 60, "requests": 0, "errors_5xx": 0, "error_pct": 0.0,
                "avg_ms": 0, "p95_ms": 0, "slowest_ms": 0}
    ms = sorted(int(r[1] * 1000) for r in rows)
    errors = sum(1 for r in rows if r[2] >= 500)
    return {
        "window_minutes": _WINDOW_SECONDS // 60,
        "requests": n,
        "errors_5xx": errors,
        "error_pct": round(errors * 100.0 / n, 1),
        "avg_ms": int(sum(ms) / n),
        "p95_ms": ms[min(n - 1, int(n * 0.95))],
        "slowest_ms": ms[-1],
    }


def _db_stats(db: Session) -> Dict[str, Any]:
    from app.database.session import engine
    out: Dict[str, Any] = {"ok": False}
    try:
        t0 = time.perf_counter()
        db.execute(text("SELECT 1"))
        out["ping_ms"] = int((time.perf_counter() - t0) * 1000)
        row = db.execute(text(
            "SELECT (SELECT count(*) FROM pg_stat_activity WHERE datname = current_database()) AS conns, "
            "(SELECT setting::int FROM pg_settings WHERE name = 'max_connections') AS max_conns, "
            "pg_database_size(current_database()) AS size_bytes"
        )).first()
        out["connections"] = int(row.conns)
        out["max_connections"] = int(row.max_conns)
        out["connections_pct"] = round(int(row.conns) * 100.0 / max(1, int(row.max_conns)), 1)
        out["size_mb"] = round(int(row.size_bytes) / (1024 * 1024), 1)
        out["ok"] = True
    except Exception as e:  # noqa: BLE001
        out["error"] = f"{type(e).__name__}: {e}"
    try:
        pool = engine.pool
        out["pool_in_use"] = pool.checkedout()
        out["pool_size"] = pool.size()
    except Exception:  # noqa: BLE001
        pass
    return out


def collect(db: Session) -> Dict[str, Any]:
    th = _thresholds(db)
    req = _request_stats()
    dbs = _db_stats(db)
    alerts: List[Dict[str, str]] = []

    if not dbs.get("ok"):
        alerts.append({"key": "db_down", "level": "critical", "title": "Database is not answering",
                       "message": dbs.get("error") or "The database did not answer a simple test query."})
    else:
        if dbs["ping_ms"] > th["health_db_ms_warn"]:
            alerts.append({"key": "db_slow", "level": "warning", "title": "Database is slow",
                           "message": f"A simple database check took {dbs['ping_ms']} ms (limit {int(th['health_db_ms_warn'])} ms). "
                                      "If this keeps happening, the database may need a bigger size."})
        if dbs["connections_pct"] > th["health_conn_pct_warn"]:
            alerts.append({"key": "db_connections", "level": "warning", "title": "Database connections are almost full",
                           "message": f"{dbs['connections']} of {dbs['max_connections']} database connections are in use ({dbs['connections_pct']}%)."})
    if req["requests"] >= 20 and req["error_pct"] > th["health_error_pct_warn"]:
        alerts.append({"key": "errors", "level": "critical", "title": "Many requests are failing",
                       "message": f"{req['errors_5xx']} of {req['requests']} requests failed in the last {req['window_minutes']} minutes ({req['error_pct']}%)."})
    if req["requests"] >= 20 and req["avg_ms"] > th["health_slow_ms_warn"]:
        alerts.append({"key": "slow_api", "level": "warning", "title": "The app is answering slowly",
                       "message": f"Average answer time is {req['avg_ms']} ms over the last {req['window_minutes']} minutes."})

    return {
        "status": "critical" if any(a["level"] == "critical" for a in alerts) else ("warning" if alerts else "ok"),
        "alerts": alerts,
        "database": dbs,
        "requests": req,
        "this_instance_up_minutes": int((time.time() - STARTED_AT) / 60),
        "last_sweep": dict(_last_sweep),
        "thresholds": th,
        "note": "Request numbers are for the server instance that answered this page; database numbers cover everything.",
    }


async def check_and_alert(db: Session) -> int:
    """Called from the sweep. Push admins when something is wrong - each alert at most once per gap (default 60 min)."""
    import json
    from app.models.platform_setting import PlatformSetting
    from app.crud.notification import send_push_notification_to_admin

    th = _thresholds(db)
    if not int(th["health_alerts_enabled"]):
        return 0
    report = collect(db)
    if not report["alerts"]:
        return 0
    row = db.query(PlatformSetting).filter(PlatformSetting.key == ALERT_LAST_KEY).first()
    try:
        last = json.loads(row.value) if row and row.value else {}
    except ValueError:
        last = {}
    now = time.time()
    gap = float(th["health_alert_gap_minutes"]) * 60
    sent = 0
    for a in report["alerts"]:
        if now - float(last.get(a["key"], 0)) < gap:
            continue
        try:
            await send_push_notification_to_admin(db, f"System alert: {a['title']}", a["message"])
            last[a["key"]] = now
            sent += 1
        except Exception as e:  # noqa: BLE001
            print(f"health alert push failed: {e}")
    if sent:
        if row:
            row.value = json.dumps(last)
        else:
            db.add(PlatformSetting(key=ALERT_LAST_KEY, value=json.dumps(last)))
        db.commit()
    return sent
