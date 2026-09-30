import os
from google.cloud import storage
from google.oauth2.credentials import Credentials

ACCESS_TOKEN = os.environ["GCP_ACCESS_TOKEN"]
GCS_BUCKET_NAME = "drop-cars-production-bucket"
BLOB_NAME = "test-builds/DropCarsDriver-test.apk"

creds = Credentials(token=ACCESS_TOKEN)
client = storage.Client(credentials=creds, project="drop-cars2")
bucket = client.bucket(GCS_BUCKET_NAME)

# Uniform bucket-level access means per-object ACLs (blob.make_public()) are
# rejected - the only way to grant read is a bucket-level IAM binding, but a
# CEL condition scopes it to just this one object path instead of the whole
# bucket, matching what was actually approved ("just this one file").
policy = bucket.get_iam_policy(requested_policy_version=3)
policy.version = 3
resource_name = f"projects/_/buckets/{GCS_BUCKET_NAME}/objects/{BLOB_NAME}"
policy.bindings.append({
    "role": "roles/storage.objectViewer",
    "members": {"allUsers"},
    "condition": {
        "title": "apk-test-file-public",
        "description": "Public read for one test APK file only",
        "expression": f'resource.name.startsWith("{resource_name}")',
    },
})
bucket.set_iam_policy(policy)
print("Granted public read, scoped to:", resource_name)
print("Public URL:", f"https://storage.googleapis.com/{GCS_BUCKET_NAME}/{BLOB_NAME}")
