from fastapi.testclient import TestClient

from app.main import app
from app.api.routes import app_updates


def test_customer_app_is_a_known_ota_app(monkeypatch):
    assert "customer" in app_updates.KNOWN_APPS
    monkeypatch.setattr(app_updates, "_latest", lambda a, r, p: {"id": "abc", "runtimeVersion": r, "launchAsset": {}, "assets": []})
    client = TestClient(app)
    res = client.get("/api/app-updates/customer/manifest", headers={"expo-platform": "android", "expo-runtime-version": "1.0.0", "expo-protocol-version": "1"})
    assert res.status_code == 200 and b'"manifest"' in res.content


def test_unknown_app_gets_no_update():
    client = TestClient(app)
    res = client.get("/api/app-updates/nonsense/manifest", headers={"expo-platform": "android", "expo-runtime-version": "1.0.0", "expo-protocol-version": "1"})
    assert res.status_code == 200 and b"noUpdateAvailable" in res.content
