"""Pricing rules: state / location / route / hill rules suggest charges and adjustments; nothing is applied automatically."""
import pytest
from fastapi import HTTPException

from app.crud import billing_docs as svc
from app.crud import billing_rules as R
from app.models.billing import BillingRule
from app.utils import billing_tariff as T


def _clear(db):
    db.query(BillingRule).delete()
    db.flush()


def _names(sug):
    return {s["rule"]["name"] for s in sug}


def test_starter_rules_are_seeded_once(pg_session):
    db = pg_session
    _clear(db)
    assert R.seed_starter_rules(db) == 2
    assert R.seed_starter_rules(db) == 0


def test_hill_charge_oneway_counts_each_hill_ooty_to_kodaikanal(pg_session):
    db = pg_session
    _clear(db)
    R.seed_starter_rules(db)
    s = R.suggest(db, {"pickup": "Ooty, Tamil Nadu", "drop": "Kodaikanal, Tamil Nadu", "trip_type": "Oneway"})
    hill = next(x for x in s if x["rule"]["name"] == "Hill charges")
    assert hill["line"]["amount"] == 600 and "2 hills" in hill["line"]["label"]       # the owner's own example: 2 x 300


def test_hill_charge_round_trip_is_per_day(pg_session):
    db = pg_session
    _clear(db)
    R.seed_starter_rules(db)
    s = R.suggest(db, {"pickup": "Coimbatore", "drop": "Ooty", "trip_type": "Round Trip", "days": 3})
    assert next(x for x in s if x["rule"]["name"] == "Hill charges")["line"]["amount"] == 1500       # 500 x 3 days
    s = R.suggest(db, {"pickup": "Madurai", "drop": "Chennai", "trip_type": "Oneway"})
    assert not any(x["rule"]["name"] == "Hill charges" for x in s)


def test_karnataka_round_trip_minimum_only_for_round_trips(pg_session):
    db = pg_session
    _clear(db)
    R.seed_starter_rules(db)
    s = R.suggest(db, {"pickup": "Chennai", "drop": "Bengaluru, Karnataka", "trip_type": "Round Trip", "days": 2})
    k = next(x for x in s if "Karnataka" in x["rule"]["name"])
    assert k["adjust"] == {"min_km_per_day": 300} and k["auto_apply"] is False
    assert not any("Karnataka" in x["rule"]["name"] for x in R.suggest(db, {"pickup": "Chennai", "drop": "Bengaluru", "trip_type": "Oneway"}))


def test_route_rate_delta_works_both_directions_and_brand_scope(pg_session):
    db = pg_session
    _clear(db)
    svc.seed_default_brands(db)
    r1 = R.save_rule(db, {"name": "Chennai-Madurai cheaper", "scope": "ROUTE", "route_from": "chennai", "route_to": "madurai", "effect": "RATE_DELTA", "value": -1}, "t")
    assert R.suggest(db, {"pickup": "Madurai", "drop": "Chennai"})[0]["adjust"] == {"rate_delta": -1}
    assert R.suggest(db, {"pickup": "Chennai", "drop": "Trichy"}) == []
    from app.models.billing import BillingBrand
    other = db.query(BillingBrand).filter(BillingBrand.code == "arunachala").first()
    R.save_rule(db, {"name": "Only Arunachala", "scope": "LOCATION", "keywords": "tiruvannamalai", "effect": "CHARGE", "value": 200, "label": "Girivalam pickup", "brand_id": str(other.id)}, "t")
    d = db.query(BillingBrand).filter(BillingBrand.code == "dropcars").first()
    assert "Only Arunachala" not in _names(R.suggest(db, {"pickup": "Tiruvannamalai", "drop": "Chennai", "brand_id": str(d.id)}))
    assert "Only Arunachala" in _names(R.suggest(db, {"pickup": "Tiruvannamalai", "drop": "Chennai", "brand_id": str(other.id)}))
    assert r1.id


def test_charge_basis_percent_dates_vehicle_and_validation(pg_session):
    db = pg_session
    _clear(db)
    R.save_rule(db, {"name": "Night halt", "scope": "ALL", "effect": "CHARGE", "value": 250, "label": "Night halt", "params": {"basis": "DAY"}, "trip_types": "round"}, "t")
    R.save_rule(db, {"name": "Festival", "scope": "ALL", "effect": "PERCENT", "value": 10, "label": "Festival surcharge", "valid_from": "2026-10-20", "valid_to": "2026-10-25"}, "t")
    R.save_rule(db, {"name": "SUV only", "scope": "ALL", "effect": "BATA_DELTA", "value": 100, "vehicles": "suv"}, "t")
    s = R.suggest(db, {"pickup": "a", "drop": "b", "trip_type": "Round Trip", "days": 3, "on_date": "2026-10-22", "fare_total": 5000, "vehicle": "Toyota Innova"})
    assert _names(s) == {"Night halt", "Festival"}
    assert next(x for x in s if x["rule"]["name"] == "Night halt")["line"]["amount"] == 750
    assert next(x for x in s if x["rule"]["name"] == "Festival")["line"]["amount"] == 500
    assert "Festival" not in _names(R.suggest(db, {"pickup": "a", "drop": "b", "trip_type": "Round Trip", "on_date": "2026-11-30", "vehicle": "SUV"}))
    assert "SUV only" in _names(R.suggest(db, {"pickup": "a", "drop": "b", "vehicle": "Ertiga SUV"}))
    for bad in ({"name": "x", "scope": "ROUTE", "route_from": "a", "effect": "RATE_DELTA", "value": 1}, {"name": "x", "scope": "STATE", "effect": "CHARGE", "value": 1},
                {"name": "x", "scope": "ALL", "effect": "RATE_DELTA"}, {"name": "", "scope": "ALL", "effect": "CHARGE", "value": 1}):
        with pytest.raises(HTTPException):
            R.save_rule(db, bad, "t")


def test_adjust_flows_into_the_tariff_engines():
    base = {"rate_per_km": 12, "bata_per_day": 300}
    plain = sum(l["amount"] for l in T.compute("KM_BATA", base, km=100, days=2, trip_type="Round Trip", rules={"round_trip_min_km_per_day": 250})["lines"])
    ruled = T.compute("KM_BATA", base, km=100, days=2, trip_type="Round Trip", rules={"round_trip_min_km_per_day": 250}, adjust={"min_km_per_day": 300, "rate_delta": 1})
    assert plain == 500 * 12 + 600 and sum(l["amount"] for l in ruled["lines"]) == 600 * 13 + 600
    assert any("Pricing rules applied" in n for n in ruled["notes"])
    rnd = {"round_rate": 12.5, "min_km_per_day": 250, "driver_allowance": 400}
    assert sum(l["amount"] for l in T.compute("SLAB_ROUND", rnd, km=50, days=2, adjust={"min_km_per_day": 300, "rate_delta": -1})["lines"]) == round(600 * 11.5 + 800)
    assert R.merge_adjust([{"adjust": {"min_km_per_day": 300, "rate_delta": 1}}, {"adjust": {"min_km_per_day": 280, "rate_delta": 1}}]) == {"min_km_per_day": 300, "rate_delta": 2}
