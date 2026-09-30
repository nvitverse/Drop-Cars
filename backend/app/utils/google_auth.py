import os
from google.cloud import storage

def download_credentials_from_gcs():
    # bucket_name = os.environ.get("CREDENTIALS_BUCKET")
    # blob_name = os.environ.get("CREDENTIALS_FILE")
    bucket_name = os.getenv("CREDENTIALS_BUCKET")
    blob_name = os.getenv("CREDENTIALS_FILE")
    if not bucket_name or not blob_name:
        raise RuntimeError("Missing CREDENTIALS_BUCKET or CREDENTIALS_FILE env vars")

    destination_path = "/tmp/drop-cars-468718-d08441443ada.json"

    print(f"Downloading credentials from gs://{bucket_name}/{blob_name} to {destination_path}")

    client = storage.Client()
    bucket = client.bucket(bucket_name)
    blob = bucket.blob(blob_name)
    blob.download_to_filename(destination_path)

    # Set for Google API clients
    os.environ["GOOGLE_APPLICATION_CREDENTIALS"] = destination_path

    print("GOOGLE_APPLICATION_CREDENTIALS set.")
