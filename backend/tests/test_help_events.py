import pytest
from fastapi.testclient import TestClient
from fastapi import FastAPI
from app.api.routes.help_events import router, HelpEventCreate

app = FastAPI()
app.include_router(router)
client = TestClient(app)

def test_record_help_event_and_insights():
    # 1. Record sample events
    resp = client.post(
        "/api/help/events",
        json={
            "app": "driver",
            "code": "DC_INSUFFICIENT_WALLET",
            "screen": "BookingsScreen",
            "action": "shown",
            "lang": "ta",
        },
    )
    assert resp.status_code == 201
    assert resp.json()["status"] == "recorded"

    resp2 = client.post(
        "/api/help/events",
        json={
            "app": "driver",
            "code": "DC_INSUFFICIENT_WALLET",
            "screen": "BookingsScreen",
            "action": "tapped_call",
            "lang": "ta",
        },
    )
    assert resp2.status_code == 201

    # 2. Query insights
    insights_resp = client.get("/api/help/insights?days=7&app=driver")
    assert insights_resp.status_code == 200
    data = insights_resp.json()
    assert data["period_days"] == 7
    assert data["total_events"] >= 2
    assert len(data["top_codes"]) > 0
    assert data["top_codes"][0]["code"] == "DC_INSUFFICIENT_WALLET"
