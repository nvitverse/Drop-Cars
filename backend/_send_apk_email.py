import os
os.environ["DB_HOST"] = "34.126.214.99"
os.environ["DB_PORT"] = "5432"
os.environ["DB_NAME"] = "drop-cars"
os.environ["DB_USER"] = "drop-cars"
os.environ["DB_PASSWORD"] = "Dropcars3456!2026backenduser"

from google.cloud import storage
from google.oauth2.credentials import Credentials

ACCESS_TOKEN = os.environ["GCP_ACCESS_TOKEN"]
GCS_BUCKET_NAME = "drop-cars-production-bucket"

creds = Credentials(token=ACCESS_TOKEN)
client = storage.Client(credentials=creds, project="drop-cars2")
bucket = client.bucket(GCS_BUCKET_NAME)

APK_PATH = r"C:\Users\Administrator\Desktop\DropCarsDriver-test.apk"
BLOB_NAME = "test-builds/DropCarsDriver-test.apk"

print("Uploading APK to GCS (direct account, no impersonation)...")
blob = bucket.blob(BLOB_NAME)
blob.chunk_size = 8 * 1024 * 1024
blob.upload_from_filename(APK_PATH, content_type="application/vnd.android.package-archive", timeout=600)
public_url = f"https://storage.googleapis.com/{GCS_BUCKET_NAME}/{BLOB_NAME}"
print("Uploaded:", public_url)

link = public_url
try:
    blob.make_public()
    print("Object made public - user approved this scoped-to-one-file action.")
except Exception as e:
    print("make_public failed (bucket likely enforces uniform/private access):", e)

from app.database.session import SessionLocal
from app.utils.emailer import send_email

db = SessionLocal()
try:
    body = (
        "Drop Cars Driver App - test debug build\n\n"
        "Download link:\n" + link + "\n\n"
        "Open on the phone and allow install from unknown sources when prompted."
    )
    send_email(db, "dropcarsbookings@gmail.com", "Drop Cars Driver App - Test APK", body)
    print("Email sent to dropcarsbookings@gmail.com")
finally:
    db.close()
