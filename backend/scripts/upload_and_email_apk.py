"""One-off helper: upload a built APK to the production GCS bucket and
email a download link via the same SMTP account the app already uses.

Gmail SMTP hard-caps attachments at 25MB - these release APKs run 50-90MB,
so this uploads to GCS (same bucket/credentials the backend already uses
for user documents) and emails the resulting signed-in-perpetuity public
URL instead of attaching the raw file.

Usage: python upload_and_email_apk.py <path-to-apk> <app-name> <to-email>
"""
import sys
import os
import smtplib
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText
from datetime import datetime

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from google.cloud import storage
from google.auth import default as google_auth_default


def upload_apk(local_path: str, app_name: str) -> str:
    bucket_name = "drop-cars-apk-downloads"  # dedicated public-read bucket, APKs only
    creds, _ = google_auth_default(scopes=["https://www.googleapis.com/auth/cloud-platform"])
    client = storage.Client(credentials=creds)
    bucket = client.bucket(bucket_name)

    ts = datetime.now().strftime("%Y%m%d_%H%M%S")
    filename = os.path.basename(local_path)
    safe_app = app_name.lower().replace(" ", "-")
    blob_path = f"{safe_app}/{safe_app}_{ts}.apk"
    blob = bucket.blob(blob_path)
    blob.upload_from_filename(local_path, content_type="application/vnd.android.package-archive")
    return f"https://storage.googleapis.com/{bucket_name}/{blob_path}"


def send_email(to_email: str, app_name: str, apk_url: str, size_mb: float):
    smtp_host = "smtp.gmail.com"
    smtp_port = 587
    smtp_user = "dropcars.in@gmail.com"
    smtp_password = os.environ.get("SMTP_APP_PASSWORD")
    if not smtp_password:
        raise RuntimeError("SMTP_APP_PASSWORD env var not set")

    msg = MIMEMultipart()
    msg["From"] = smtp_user
    msg["To"] = to_email
    msg["Subject"] = f"Drop Cars {app_name} - New APK Build Ready ({size_mb:.1f} MB)"

    body = f"""Hi,

A fresh local release build of the {app_name} is ready.

Download link (direct APK, tap to install on Android):
{apk_url}

Size: {size_mb:.1f} MB
Built: {datetime.now().strftime('%Y-%m-%d %H:%M')}

This is a standalone release build (not a dev-client build) - it will open
and run as a normal app, no Expo Go / dev-client screen.

- Drop Cars Build System
"""
    msg.attach(MIMEText(body, "plain"))

    with smtplib.SMTP(smtp_host, smtp_port) as server:
        server.starttls()
        server.login(smtp_user, smtp_password)
        server.send_message(msg)


if __name__ == "__main__":
    apk_path, app_name, to_email = sys.argv[1], sys.argv[2], sys.argv[3]
    size_mb = os.path.getsize(apk_path) / (1024 * 1024)
    print(f"Uploading {apk_path} ({size_mb:.1f} MB) to GCS...")
    url = upload_apk(apk_path, app_name)
    print(f"Uploaded: {url}")
    print(f"Emailing {to_email}...")
    send_email(to_email, app_name, url, size_mb)
    print("Email sent.")
