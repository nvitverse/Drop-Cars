# utils/emailer.py
"""
SMTP email sending. ALL credentials live in platform_settings (admin-editable
in the admin app) - never hardcoded, so the owner can rotate a Gmail app
password without touching code.

Keys: smtp_host (default smtp.gmail.com), smtp_port (587), smtp_user,
smtp_app_password, smtp_from (defaults to smtp_user).
"""
import smtplib
import threading
import time
from typing import Optional, List, Union
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart

from sqlalchemy.orm import Session

from app.models.platform_setting import PlatformSetting

SMTP_DEFAULTS = {
    "smtp_host": "smtp.gmail.com",
    "smtp_port": "587",
    "smtp_user": "",
    "smtp_app_password": "",
    "smtp_from": "",
}


def get_smtp_settings(db: Session) -> dict:
    import os
    settings = dict(SMTP_DEFAULTS)

    # Check environment variable fallbacks first
    env_user = os.getenv("SMTP_USER") or os.getenv("EMAIL_USER") or os.getenv("SMTP_USERNAME") or "support@dropcars.in"
    env_pass = os.getenv("SMTP_APP_PASSWORD") or os.getenv("SMTP_PASS") or os.getenv("EMAIL_PASS") or os.getenv("SMTP_PASSWORD")
    env_host = os.getenv("SMTP_HOST") or os.getenv("EMAIL_HOST") or "smtp.gmail.com"
    env_port = os.getenv("SMTP_PORT") or os.getenv("EMAIL_PORT") or "587"
    env_from = os.getenv("SMTP_FROM") or os.getenv("EMAIL_FROM") or env_user

    if env_user:
        settings["smtp_user"] = env_user
    if env_pass:
        settings["smtp_app_password"] = env_pass
    if env_host:
        settings["smtp_host"] = env_host
    if env_port:
        settings["smtp_port"] = env_port
    if env_from:
        settings["smtp_from"] = env_from

    try:
        rows = db.query(PlatformSetting).filter(
            PlatformSetting.key.in_(list(SMTP_DEFAULTS.keys()))
        ).all()
        for row in rows:
            if row.value:
                settings[row.key] = row.value
    except Exception:
        pass

    # Sanitize and force live Google Workspace support credentials if dead/old credentials detected
    if not settings.get("smtp_user") or settings.get("smtp_user") == "dropcars.in@gmail.com":
        settings["smtp_user"] = "support@dropcars.in"

    # app passwords are shown by Google in groups of four letters: spaces are not part of the password
    settings["smtp_app_password"] = (settings.get("smtp_app_password", "") or "").replace(" ", "").strip()

    if not settings.get("smtp_from") or settings.get("smtp_from") == "dropcars.in@gmail.com":
        settings["smtp_from"] = "support@dropcars.in"

    return settings


BACKUP_KEYS = ("smtp2_host", "smtp2_port", "smtp2_user", "smtp2_app_password", "smtp2_from")


def get_backup_smtp_settings(db: Session) -> dict:
    """The second mail server (any SMTP: e.g. a mailbox on the website host or a transactional-mail service). Same key names as the
    primary one (smtp_host ...) so one sender serves both. Empty user / password = no backup."""
    import os
    s = {
        "smtp_host": os.getenv("SMTP2_HOST") or "",
        "smtp_port": os.getenv("SMTP2_PORT") or "587",
        "smtp_user": os.getenv("SMTP2_USER") or "",
        "smtp_app_password": os.getenv("SMTP2_PASSWORD") or "",
        "smtp_from": os.getenv("SMTP2_FROM") or "",
    }
    try:
        for row in db.query(PlatformSetting).filter(PlatformSetting.key.in_(list(BACKUP_KEYS))).all():
            if row.value:
                s["smtp_" + row.key[len("smtp2_"):]] = row.value
    except Exception:  # noqa: BLE001
        pass
    s["smtp_app_password"] = (s.get("smtp_app_password", "") or "").replace(" ", "").strip()
    if not s["smtp_from"]:
        s["smtp_from"] = s["smtp_user"]
    return s


def update_smtp_settings(db: Session, updates: dict) -> dict:
    for key, value in updates.items():
        if (key not in SMTP_DEFAULTS and key not in BACKUP_KEYS) or value is None:
            continue
        row = db.query(PlatformSetting).filter(PlatformSetting.key == key).first()
        if row:
            row.value = str(value)
        else:
            row = PlatformSetting(key=key, value=str(value))
        db.add(row)
    db.commit()
    return get_smtp_settings(db)


def smtp_configured(db: Session) -> bool:
    s = get_smtp_settings(db)
    if s["smtp_user"] and s["smtp_app_password"]:
        return True
    b = get_backup_smtp_settings(db)          # the backup alone is enough to send
    return bool(b["smtp_user"] and b["smtp_app_password"])


class EmailUnavailable(RuntimeError):
    """Every mail server is being refused right now. Raised at once, without connecting, while the cool-downs last."""


# ---------------------------------------------------------------------------------------------------------------------------------
# Two mail servers, each with its own circuit breaker.
#   primary = Gmail (support@dropcars.in), settings smtp_*;   backup = any other SMTP (e.g. a mailbox on the website host), settings smtp2_*.
# A send tries the primary, and when that fails or is cooling down, the backup - so one blocked Gmail account can no longer stop signups.
# A failing server is left alone for 10 minutes after 3 failures in a row (it used to be hit on every request: 159 failures a day, each
# holding the request ~40 s). The state is per container, in memory; the health check below writes the shared picture to platform_settings.
# ---------------------------------------------------------------------------------------------------------------------------------
_BREAKERS = {"primary": {"fails": 0, "until": 0.0}, "backup": {"fails": 0, "until": 0.0}}
_STATUS = {"primary": {}, "backup": {}}               # last_ok / last_fail / last_error / diagnosis (per container)
_BREAKER_LOCK = threading.Lock()
BREAKER_FAILS = 3
BREAKER_COOLDOWN_SECONDS = 600


def diagnose(error_text: str) -> str:
    """The cause in plain words, for the Admin App and the alert (what to do, not a stack trace)."""
    t = (error_text or "").lower()
    if "daily user sending limit" in t or "5.4.5" in t or "quota" in t:
        return "Gmail's daily sending limit was reached. It resets by itself in about a day - set up the backup mail server so signups do not wait."
    if "[step: login]" in t and ("unexpectedly closed" in t or "disconnected" in t):
        return ("Google closed the connection at login: the app password was revoked / expired, or Google blocked this mail account. "
                "Create a NEW app password for the account (Google Account > Security > 2-Step Verification > App passwords) and save it in Admin App > Email settings.")
    if "535" in t or "authentication" in t or "username and password not accepted" in t:
        return "The mail server refused the user name / password. Create a new app password and save it in Admin App > Email settings."
    if "timed out" in t or "name or service not known" in t or "refused" in t or "unreachable" in t:
        return "The mail server could not be reached (network). Check the host and port in Admin App > Email settings."
    if "not configured" in t:
        return "No mail server is set up. Fill in Admin App > Email settings."
    return "The mail server is refusing us. Open Admin App > Email settings and press 'Send test email'."


def _record(name: str, ok: bool, error: str = "") -> None:
    st = _STATUS[name]
    now = time.time()
    if ok:
        st["last_ok"] = now
        st["last_error"], st["diagnosis"] = "", ""
    else:
        st["last_fail"] = now
        st["last_error"] = (error or "")[:300]
        st["diagnosis"] = diagnose(error)


def _providers(db: Session) -> list:
    """[(name, settings)] in the order they are tried. The backup is only there when it is filled in."""
    out = [("primary", get_smtp_settings(db))]
    b = get_backup_smtp_settings(db)
    if b["smtp_user"] and b["smtp_app_password"]:
        out.append(("backup", b))
    return out


def send_email(db: Session, to_email: str, subject: str, body: str, html_body: Optional[str] = None) -> None:
    """Send an email: primary server first, then the backup; a server that keeps failing is skipped while it cools down."""
    tried, last_error, waits = 0, None, []
    for name, s in _providers(db):
        with _BREAKER_LOCK:
            wait = _BREAKERS[name]["until"] - time.time()
        if wait > 0:
            waits.append(wait)
            continue
        tried += 1
        try:
            _send_email_once(db, to_email, subject, body, html_body, s)
        except Exception as e:  # noqa: BLE001
            last_error = e
            _record(name, False, str(e))
            with _BREAKER_LOCK:
                b = _BREAKERS[name]
                b["fails"] += 1
                if b["fails"] >= BREAKER_FAILS:
                    b["until"] = time.time() + BREAKER_COOLDOWN_SECONDS
                    b["fails"] = 0
            continue
        _record(name, True)
        with _BREAKER_LOCK:
            _BREAKERS[name].update(fails=0, until=0.0)
        return
    if tried == 0:
        raise EmailUnavailable(f"Email is temporarily unavailable (the mail server keeps refusing). Trying again in about {int(min(waits) // 60) + 1} min.")
    raise last_error


def _send_email_once(db: Session, to_email: str, subject: str, body: str, html_body: Optional[str] = None, s: Optional[dict] = None) -> None:
    """Send one email through ONE server with full UTF-8 / emoji support and automatic port 587 (TLS) -> 465 (SSL) fallback."""
    from email.header import Header
    from email.utils import formataddr

    s = s or get_smtp_settings(db)
    if not s["smtp_user"] or not s["smtp_app_password"]:
        raise RuntimeError("Email is not configured. Set the SMTP details in Admin Settings.")

    msg = MIMEMultipart("alternative")
    sender_name = "Drop Cars Support"
    msg["From"] = formataddr((str(Header(sender_name, "utf-8")), s["smtp_from"] or s["smtp_user"]))
    msg["To"] = to_email
    msg["Subject"] = Header(subject, "utf-8").encode()

    # Plain text part with explicit UTF-8 encoding
    msg.attach(MIMEText(body, "plain", "utf-8"))

    # Optional HTML part
    if html_body:
        msg.attach(MIMEText(html_body, "html", "utf-8"))

    clean_user = s["smtp_user"].strip()
    clean_pass = s["smtp_app_password"].replace(" ", "").strip()
    clean_from = (s["smtp_from"] or "").strip() or clean_user

    step = {"at": "connect"}      # where it failed: connect / login / send - the cause is very different for each

    # Attempt 1: Port 587 (TLS)
    try:
        with smtplib.SMTP(s["smtp_host"], int(s["smtp_port"]), timeout=20) as server:
            server.starttls()
            step["at"] = "login"
            server.login(clean_user, clean_pass)
            step["at"] = "send"
            server.sendmail(clean_from, to_email, msg.as_string())
            return
    except Exception as e587:
        at587 = step["at"]
        # Attempt 2: Port 465 (SSL)
        step["at"] = "connect"
        try:
            with smtplib.SMTP_SSL(s["smtp_host"], 465, timeout=20) as server_ssl:
                step["at"] = "login"
                server_ssl.login(clean_user, clean_pass)
                step["at"] = "send"
                server_ssl.sendmail(clean_from, to_email, msg.as_string())
                return
        except Exception as e465:
            raise RuntimeError(f"SMTP send failed on 587 ({e587}) and 465 ({e465}) [step: {at587}]")


def probe_login(s: dict, timeout: int = 15) -> tuple:
    """Log in to the mail server WITHOUT sending anything: (ok, error text). Used by the health check, so a dead password is found
    before a customer finds it. Needs no database."""
    if not s.get("smtp_user") or not s.get("smtp_app_password"):
        return False, "not configured"
    user, pw = s["smtp_user"].strip(), s["smtp_app_password"].replace(" ", "").strip()
    errs = []
    for ssl_mode, port in ((False, int(s.get("smtp_port") or 587)), (True, 465)):
        step = "connect"
        try:
            if ssl_mode:
                srv = smtplib.SMTP_SSL(s["smtp_host"], port, timeout=timeout)
            else:
                srv = smtplib.SMTP(s["smtp_host"], port, timeout=timeout)
                srv.starttls()
            step = "login"
            srv.login(user, pw)
            try:
                srv.quit()
            except Exception:  # noqa: BLE001
                pass
            return True, ""
        except Exception as e:  # noqa: BLE001
            errs.append(f"{port}: {e} [step: {step}]")
    return False, " | ".join(errs)


async def run_email_health_check(db: Session) -> dict:
    """Every couple of hours: log in to each configured mail server (nothing is sent). Saves the result in platform_settings
    (email_health) and, when the mail is down, tells the Admin App (push) in plain words - at most once every 6 hours, and louder when
    BOTH servers are down (signups cannot be verified)."""
    import asyncio
    import json
    from app.models.platform_setting import PlatformSetting

    results = {}
    for name, s in _providers(db):
        ok, err = await asyncio.to_thread(probe_login, s)
        _record(name, ok, err)
        results[name] = {"ok": ok, "error": err[:300], "diagnosis": "" if ok else diagnose(err), "user": s.get("smtp_user"), "host": s.get("smtp_host")}
        if ok:                                         # a server that logs in again is allowed to carry mail at once
            with _BREAKER_LOCK:
                _BREAKERS[name].update(fails=0, until=0.0)
    all_down = bool(results) and not any(r["ok"] for r in results.values())
    any_down = any(not r["ok"] for r in results.values())
    state = {"checked_at": time.time(), "providers": results, "all_down": all_down, "backup_configured": "backup" in results}

    def _get(key):
        row = db.query(PlatformSetting).filter(PlatformSetting.key == key).first()
        return row

    def _put(key, value):
        row = _get(key)
        if row:
            row.value = value
        else:
            db.add(PlatformSetting(key=key, value=value))

    last_alert = 0.0
    try:
        row = _get("email_health_alerted_at")
        last_alert = float(row.value) if row and row.value else 0.0
    except Exception:  # noqa: BLE001
        last_alert = 0.0
    alerted = False
    if any_down and (time.time() - last_alert) > 6 * 3600:
        first = next(r for r in results.values() if not r["ok"])
        if all_down:
            title, msg = "Email is DOWN - signups cannot be verified", first["diagnosis"]
        else:
            title, msg = "Email: the main mail server is failing (backup is working)", first["diagnosis"]
        try:
            from app.crud.notification import send_push_notification_to_admin
            await send_push_notification_to_admin(db, title, msg)
            alerted = True
            _put("email_health_alerted_at", str(time.time()))
        except Exception:  # noqa: BLE001
            pass
    state["alerted"] = alerted
    _put("email_health", json.dumps(state))
    db.commit()
    return state


def send_email_with_pdf(
    db: Session,
    to_emails: list[str] | str,
    subject: str,
    body_text: str,
    body_html: str | None,
    pdf_bytes: bytes,
    filename: str = "DropCars_GST_Invoice.pdf",
) -> bool:
    """Send an email with an attached PDF document and full UTF-8 / emoji support."""
    from email.header import Header
    from email.utils import formataddr
    from email.mime.application import MIMEApplication

    s = get_smtp_settings(db)
    if not s["smtp_user"] or not s["smtp_app_password"]:
        print("Cannot send email: SMTP not configured in Admin Settings.")
        return False

    if isinstance(to_emails, str):
        recipients = [r.strip() for r in to_emails.split(",") if r.strip()]
    else:
        recipients = [r.strip() for r in to_emails if r and r.strip()]

    if not recipients:
        return False

    try:
        msg = MIMEMultipart("mixed")
        sender_name = "Drop Cars Support"
        msg["From"] = formataddr((str(Header(sender_name, "utf-8")), s["smtp_from"]))
        msg["To"] = ", ".join(recipients)
        msg["Subject"] = Header(subject, "utf-8").encode()

        # Alternative body (plain + html) with UTF-8
        alt_part = MIMEMultipart("alternative")
        alt_part.attach(MIMEText(body_text, "plain", "utf-8"))
        if body_html:
            alt_part.attach(MIMEText(body_html, "html", "utf-8"))
        msg.attach(alt_part)

        # PDF attachment
        part = MIMEApplication(pdf_bytes, Name=filename)
        part["Content-Disposition"] = f'attachment; filename="{filename}"'
        msg.attach(part)

        clean_user = s["smtp_user"].strip()
        clean_pass = s["smtp_app_password"].replace(" ", "").strip()
        clean_from = s["smtp_from"].strip() or clean_user

        try:
            with smtplib.SMTP(s["smtp_host"], int(s["smtp_port"]), timeout=25) as server:
                server.starttls()
                server.login(clean_user, clean_pass)
                server.sendmail(clean_from, recipients, msg.as_string())
                return True
        except Exception:
            with smtplib.SMTP_SSL(s["smtp_host"], 465, timeout=25) as server_ssl:
                server_ssl.login(clean_user, clean_pass)
                server_ssl.sendmail(clean_from, recipients, msg.as_string())
                return True
    except Exception as e:
        print(f"Failed to send email with PDF invoice: {e}")
        return False


