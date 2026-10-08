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
from fastapi import APIRouter, Depends, Header, Response
from sqlalchemy.orm import Session

from app.database.session import get_db

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


DEFAULT_DOWNLOAD_URL = {
    "driver": "https://dropcars.in/assets/apk/DropCars-Driver-App.apk",
}


@router.get("/app-updates/{app}/version-check")
def version_check(app: str, build: Optional[int] = None, db: Session = Depends(get_db)):
    """Tells an INSTALLED app whether it is too old to keep working. Driven by platform settings (Admin App > Settings), so nothing is
    hardcoded and no new build is needed to change it:
        min_app_build_<app>     installed build (Android versionCode) number below which the app must update; 0 / empty = never force
        app_download_url_<app>  optional override of where the new APK is
    Over-the-air JS updates still arrive silently; this is for apps whose native part is too old to receive them."""
    if app not in KNOWN_APPS:
        return {"force_update": False}
    from app.crud.customer_booking_request import get_platform_setting_value
    try:
        minimum = int(str(get_platform_setting_value(db, f"min_app_build_{app}", "0") or "0").strip() or 0)
    except ValueError:
        minimum = 0
    url = (get_platform_setting_value(db, f"app_download_url_{app}", "") or "").strip() or DEFAULT_DOWNLOAD_URL.get(app, "https://dropcars.in")
    force = bool(minimum and build is not None and build < minimum)
    return {
        "force_update": force,
        "min_build": minimum or None,
        "download_url": url,
        "message": "This version of Drop Cars is too old and no longer works properly. Please update the app to continue.",
    }


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
