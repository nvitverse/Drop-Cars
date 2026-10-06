# utils/emailer.py
"""
SMTP email sending. ALL credentials live in platform_settings (admin-editable
in the admin app) - never hardcoded, so the owner can rotate a Gmail app
password without touching code.

Keys: smtp_host (default smtp.gmail.com), smtp_port (587), smtp_user,
smtp_app_password, smtp_from (defaults to smtp_user).
"""
import smtplib
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


def update_smtp_settings(db: Session, updates: dict) -> dict:
    for key, value in updates.items():
        if key not in SMTP_DEFAULTS or value is None:
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
    return bool(s["smtp_user"] and s["smtp_app_password"])


def send_email(db: Session, to_email: str, subject: str, body: str, html_body: Optional[str] = None) -> None:
    """Send an email with full UTF-8 / emoji support and automatic port 587 (TLS) -> 465 (SSL) fallback."""
    from email.header import Header
    from email.utils import formataddr

    s = get_smtp_settings(db)
    if not s["smtp_user"] or not s["smtp_app_password"]:
        raise RuntimeError("Email is not configured. Set the SMTP details in Admin Settings.")

    msg = MIMEMultipart("alternative")
    sender_name = "Drop Cars Support"
    msg["From"] = formataddr((str(Header(sender_name, "utf-8")), s["smtp_from"]))
    msg["To"] = to_email
    msg["Subject"] = Header(subject, "utf-8").encode()

    # Plain text part with explicit UTF-8 encoding
    msg.attach(MIMEText(body, "plain", "utf-8"))

    # Optional HTML part
    if html_body:
        msg.attach(MIMEText(html_body, "html", "utf-8"))

    clean_user = s["smtp_user"].strip()
    clean_pass = s["smtp_app_password"].replace(" ", "").strip()
    clean_from = s["smtp_from"].strip() or clean_user

    # Attempt 1: Port 587 (TLS)
    try:
        with smtplib.SMTP(s["smtp_host"], int(s["smtp_port"]), timeout=20) as server:
            server.starttls()
            server.login(clean_user, clean_pass)
            server.sendmail(clean_from, to_email, msg.as_string())
            return
    except Exception as e587:
        # Attempt 2: Port 465 (SSL)
        try:
            with smtplib.SMTP_SSL(s["smtp_host"], 465, timeout=20) as server_ssl:
                server_ssl.login(clean_user, clean_pass)
                server_ssl.sendmail(clean_from, to_email, msg.as_string())
                return
        except Exception as e465:
            raise RuntimeError(f"SMTP send failed on 587 ({e587}) and 465 ({e465})")


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


