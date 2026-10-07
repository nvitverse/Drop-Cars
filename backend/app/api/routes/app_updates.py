"""Self-hosted over-the-air (OTA) updates for the Expo apps (expo-updates protocol v1) - no EAS Update subscription needed.

How it works
  * `scripts/publish-ota.js` (in each app) exports the JS bundle + assets, uploads them to
        gs://drop-cars-apk-downloads/ota/<app>/<runtimeVersion>/<updateId>/...   (public bucket, served by Google's CDN)
    and writes the ready-made manifest to
        gs://drop-cars-apk-downloads/ota/<app>/<runtimeVersion>/android/latest.json
  * the installed app asks GET /api/app-updates/<app>/manifest (headers: expo-runtime-version, expo-current-update-id ...)
    and this endpoint wraps latest.json in the multipart response the client expects, or answers "no update available".
This route stays tiny on purpose: it holds no state and downloads nothing big - the bundle itself never goes through Cloud Run.
A bad update can be undone by publishing the previous bundle again (`publish-ota.js --rollback`).
"""
import json
import time
import uuid
from typing import Any, Dict, Optional

import requests
from fastapi import APIRouter, Header, Response

router = APIRouter(tags=["AppUpdates"])

BUCKET_URL = "https://storage.googleapis.com/drop-cars-apk-downloads"
KNOWN_APPS = {"driver", "vendor", "admin", "customer"}
_cache: Dict[str, Any] = {}
CACHE_SECONDS = 45


def _latest(app: str, runtime: str, platform: str) -> Optional[Dict[str, Any]]:
    key = f"{app}/{runtime}/{platform}"
    hit = _cache.get(key)
    if hit and time.time() - hit[0] < CACHE_SECONDS:
        return hit[1]
    data = None
    try:
        r = requests.get(f"{BUCKET_URL}/ota/{app}/{runtime}/{platform}/latest.json", timeout=6)
        if r.status_code == 200:
            data = r.json()
    except Exception:  # noqa: BLE001
        data = None
    _cache[key] = (time.time(), data)
    return data


def _multipart(parts: Dict[str, Dict[str, Any]]) -> tuple:
    boundary = uuid.uuid4().hex
    out = b""
    for name, payload in parts.items():
        out += (
            f"--{boundary}\r\n"
            f'Content-Disposition: form-data; name="{name}"\r\n'
            "Content-Type: application/json; charset=utf-8\r\n\r\n"
        ).encode() + json.dumps(payload, separators=(",", ":")).encode() + b"\r\n"
    out += f"--{boundary}--\r\n".encode()
    return out, boundary


def _respond(parts: Dict[str, Dict[str, Any]]) -> Response:
    body, boundary = _multipart(parts)
    return Response(
        content=body,
        media_type=f"multipart/mixed; boundary={boundary}",
        headers={"expo-protocol-version": "1", "expo-sfv-version": "0", "cache-control": "private, max-age=0"},
    )


@router.get("/app-updates/{app}/manifest")
def manifest(
    app: str,
    expo_platform: Optional[str] = Header(None, alias="expo-platform"),
    expo_runtime_version: Optional[str] = Header(None, alias="expo-runtime-version"),
    expo_current_update_id: Optional[str] = Header(None, alias="expo-current-update-id"),
    expo_protocol_version: Optional[str] = Header(None, alias="expo-protocol-version"),
):
    platform = (expo_platform or "android").lower()
    if app not in KNOWN_APPS or not expo_runtime_version or platform != "android":
        return _respond({"directive": {"type": "noUpdateAvailable"}}) if expo_protocol_version != "0" else Response(status_code=204)

    latest = _latest(app, expo_runtime_version, platform)
    if not latest or (expo_current_update_id and str(latest.get("id", "")).lower() == expo_current_update_id.lower()):
        if expo_protocol_version == "0":
            return Response(status_code=204)
        return _respond({"directive": {"type": "noUpdateAvailable"}})

    return _respond({"manifest": latest, "extensions": {"assetRequestHeaders": {}}})
