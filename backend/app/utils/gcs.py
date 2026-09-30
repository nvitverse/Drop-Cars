# from google.cloud import storage
# import uuid
# import os
# from fastapi import UploadFile
# from datetime import timedelta



# GCS_CREDENTIALS = "app/core/drop-cars2-23860624c9e6.json"
# GCS_BUCKET_NAME = "drop-cars-production-bucket"

# client = storage.Client.from_service_account_json(GCS_CREDENTIALS)
# # client = storage.Client()
# bucket = client.bucket(GCS_BUCKET_NAME)

# def upload_image_to_gcs(file: UploadFile, folder: str = "vehicle_owner_details/aadhar") -> str:
#     ext = os.path.splitext(file.filename)[-1]
#     filename = f"{folder}/{uuid.uuid4()}{ext}"

#     blob = bucket.blob(filename)
#     blob.upload_from_file(file.file, content_type=file.content_type)

#     # No blob.make_public() call

#     # If your bucket is public, this will be accessible
#     return f"https://storage.googleapis.com/{GCS_BUCKET_NAME}/{filename}"


# def delete_gcs_file_by_url(public_url: str) -> None:
#     """Delete a GCS object given its public URL. No error is raised if delete fails."""
#     try:
#         prefix = f"https://storage.googleapis.com/{GCS_BUCKET_NAME}/"
#         if not public_url.startswith(prefix):
#             return
#         blob_name = public_url[len(prefix):]
#         if not blob_name:
#             return
#         blob = bucket.blob(blob_name)
#         blob.delete()
#     except Exception:
#         # Best-effort cleanup; ignore failures
#         return

# def generate_signed_url_from_gcs(public_url: str, expiry_minutes: int = 2) -> str:
#     """Generate a signed URL for a private GCS file given its public-style URL."""
#     prefix = f"https://storage.googleapis.com/{GCS_BUCKET_NAME}/"
#     if not public_url.startswith(prefix):
#         raise ValueError("Invalid GCS URL format")

#     blob_name = public_url[len(prefix):]
#     blob = bucket.blob(blob_name)

#     # Generate a temporary signed URL (GET access)
#     signed_url = blob.generate_signed_url(
#         version="v4",
#         expiration=timedelta(minutes=expiry_minutes),
#         method="GET",
#     )

#     return signed_url

from google.cloud import storage
from google.auth import default
from google.auth import impersonated_credentials
from datetime import timedelta
import os
from fastapi import UploadFile
import uuid

GCS_BUCKET_NAME = os.getenv("CREDENTIALS_BUCKET") 
GCS_SIGNER_SERVICE_ACCOUNT = os.getenv("GCS_SIGNER_SERVICE_ACCOUNT")  # should be gcs-access-sa@drop-cars-473714.iam.gserviceaccount.com

# Get default credentials (Cloud Run service account or local user)
source_credentials, project = default(scopes=["https://www.googleapis.com/auth/cloud-platform"])

# If signer SA is provided, impersonate it
if GCS_SIGNER_SERVICE_ACCOUNT:
    creds = impersonated_credentials.Credentials(
        source_credentials=source_credentials,
        target_principal=GCS_SIGNER_SERVICE_ACCOUNT,
        target_scopes=["https://www.googleapis.com/auth/cloud-platform"],
        lifetime=3600
    )
else:
    creds = source_credentials

# Initialize client with credentials (works locally and on Cloud Run)
client = storage.Client(credentials=creds)
bucket = client.bucket(GCS_BUCKET_NAME)


def upload_image_to_gcs(file: UploadFile, folder: str = "vehicle_owner_details/aadhar") -> str:
    ext = os.path.splitext(file.filename)[-1]
    filename = f"{folder}/{uuid.uuid4()}{ext}"

    blob = bucket.blob(filename)
    blob.upload_from_file(file.file, content_type=file.content_type)
    return f"https://storage.googleapis.com/{GCS_BUCKET_NAME}/{filename}"


def delete_gcs_file_by_url(public_url: str) -> None:
    try:
        prefix = f"https://storage.googleapis.com/{GCS_BUCKET_NAME}/"
        if not public_url.startswith(prefix):
            return
        blob_name = public_url[len(prefix):]
        if not blob_name:
            return
        blob = bucket.blob(blob_name)
        blob.delete()
    except Exception:
        return


def download_gcs_bytes(public_url: str) -> bytes:
    """Fetch a stored document's raw bytes directly from GCS (no HTTP round
    trip through a signed URL) - for feeding back into
    utils/document_verifier.py's auto-verify pipeline on an already-
    uploaded document (see admin_management.py's reverify_pending_documents)."""
    prefix = f"https://storage.googleapis.com/{GCS_BUCKET_NAME}/"
    if not public_url.startswith(prefix):
        raise ValueError("Invalid GCS URL format")
    blob_name = public_url[len(prefix):]
    blob = bucket.blob(blob_name)
    return blob.download_as_bytes()


def generate_signed_url_from_gcs(public_url: str, expiry_minutes: int = 2) -> str:
    prefix = f"https://storage.googleapis.com/{GCS_BUCKET_NAME}/"
    if not public_url.startswith(prefix):
        raise ValueError("Invalid GCS URL format")

    blob_name = public_url[len(prefix):]
    blob = bucket.blob(blob_name)

    signed_url = blob.generate_signed_url(
        version="v4",
        expiration=timedelta(minutes=expiry_minutes),
        method="GET"
    )

    return signed_url
