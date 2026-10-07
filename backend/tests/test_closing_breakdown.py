from app.crud.end_records import build_closing_breakdown


def _bd(**kw):
    base = dict(trip_type="MULTY_CITY", km_driven=315, billed_km=315, min_km_floor=250, planned_km=227, days=2, cost_per_km=13,
                extra_cost_per_km=2, driver_allowance=300, extra_driver_allowance=100, permit_charges=400, extra_permit_charges=0,
                hill_charges=0, toll_charges=180, toll_is_actual=True, night_charges=0, waiting_minutes=None, waiting_charge=0)
    base.update(kw)
    return build_closing_breakdown(**base)


def test_lines_add_up_to_the_itemised_total():
    bd = _bd()
    km = 315 * 15
    assert bd["itemised_total"] == km + 400 + 400 + 180 and sum(l["amount"] for l in bd["lines"]) == bd["itemised_total"]
    assert any("Driven 315 km" in n for n in bd["notes"]) and any("quoted for 227 km" in n for n in bd["notes"])


def test_minimum_coverage_is_explained_when_it_is_billed():
    bd = _bd(km_driven=120, billed_km=500, min_km_floor=500)
    assert any("minimum coverage is 500 km" in n and "500 km is billed" in n for n in bd["notes"])


def test_waiting_charge_has_its_own_line_with_the_minutes():
    bd = _bd(waiting_minutes=450, waiting_charge=450)
    assert any(l["key"] == "waiting" and "450 min" in l["label"] and l["amount"] == 450 for l in bd["lines"])


def test_settlement_month_routes_exist_and_need_login():
    from fastapi.testclient import TestClient
    from app.main import app
    c = TestClient(app)
    assert c.get("/api/admin/tax/driver-settlements?year=2026&month=9").status_code in (401, 403)
    assert c.post("/api/admin/tax/driver-settlements/generate-month", json={"year": 2026, "month": 9}).status_code in (401, 403)
