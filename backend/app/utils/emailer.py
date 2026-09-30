# utils/emailer.py
"""
SMTP email sending. ALL credentials live in platform_settings (admin-editable
in the admin app) - never hardcoded, so the owner can rotate a Gmail app
password without touching code.

Keys: smtp_host (default smtp.gmail.com), smtp_port (587), smtp_user,
smtp_app_password, smtp_from (defaults to smtp_user).
"""
import smtplib
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
    env_user = os.getenv("SMTP_USER") or os.getenv("EMAIL_USER") or os.getenv("SMTP_USERNAME") or ""
    env_pass = os.getenv("SMTP_APP_PASSWORD") or os.getenv("SMTP_PASS") or os.getenv("EMAIL_PASS") or os.getenv("SMTP_PASSWORD") or ""
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

    rows = db.query(PlatformSetting).filter(
        PlatformSetting.key.in_(list(SMTP_DEFAULTS.keys()))
    ).all()
    for row in rows:
        if row.value:
            settings[row.key] = row.value
    if not settings["smtp_from"]:
        settings["smtp_from"] = settings["smtp_user"]
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


from email.mime.application import MIMEApplication


def send_email(db: Session, to_email: str, subject: str, body: str) -> None:
    """Send a plain-text email. Raises on failure so callers can report it."""
    s = get_smtp_settings(db)
    if not s["smtp_user"] or not s["smtp_app_password"]:
        raise RuntimeError("Email is not configured. Set the SMTP details in Admin Settings.")

    msg = MIMEMultipart()
    msg["From"] = s["smtp_from"]
    msg["To"] = to_email
    msg["Subject"] = subject
    msg.attach(MIMEText(body, "plain"))

    with smtplib.SMTP(s["smtp_host"], int(s["smtp_port"]), timeout=20) as server:
        server.starttls()
        server.login(s["smtp_user"], s["smtp_app_password"])
        server.sendmail(s["smtp_from"], to_email, msg.as_string())


def send_email_with_pdf(
    db: Session,
    to_emails: list[str] | str,
    subject: str,
    body_text: str,
    body_html: str | None,
    pdf_bytes: bytes,
    filename: str = "DropCars_GST_Invoice.pdf"
) -> bool:
    """Send an email with an attached PDF document to one or more recipients."""
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
        msg["From"] = s["smtp_from"]
        msg["To"] = ", ".join(recipients)
        msg["Subject"] = subject

        # Alternative body (plain + html)
        alt_part = MIMEMultipart("alternative")
        alt_part.attach(MIMEText(body_text, "plain"))
        if body_html:
            alt_part.attach(MIMEText(body_html, "html"))
        msg.attach(alt_part)

        # PDF attachment
        part = MIMEApplication(pdf_bytes, Name=filename)
        part["Content-Disposition"] = f'attachment; filename="{filename}"'
        msg.attach(part)

        with smtplib.SMTP(s["smtp_host"], int(s["smtp_port"]), timeout=25) as server:
            server.starttls()
            server.login(s["smtp_user"], s["smtp_app_password"])
            server.sendmail(s["smtp_from"], recipients, msg.as_string())
        return True
    except Exception as e:
        print(f"Failed to send email with PDF invoice: {e}")
        return False

