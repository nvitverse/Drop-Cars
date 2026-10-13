"""Local Drop pickup check: neighbourhoods and landmarks inside a serviceable city must pass (owner 2026-10-13: Vadapalani, Kasi Theatre,
West Jafferkhanpet were all refused with 'only Chennai, Bangalore')."""
import pytest

from app.utils import serviceable_cities as sc


@pytest.fixture(autouse=True)
def _no_google(monkeypatch):
    monkeypatch.setattr(sc, "_geocoded_localities", lambda place: {"vadapalani": ["Chennai"], "kasi theatre": ["Chennai", "Tamil Nadu"], "west jafferkhanpet": ["Chennai"],
                                                                   "jayanagar": ["Bengaluru"], "nowhereville": []}.get(place.strip().lower(), []))


def test_city_names_inside_the_text_pass(pg_session):
    for p in ("Chennai", "chennai", "Vadapalani, Chennai, Tamil Nadu", "West Jafferkhanpet, Chennai", "Chennai International Airport (MAA)", "Madras Airport"):
        assert sc.is_city_serviceable(pg_session, p), p


def test_neighbourhoods_and_landmarks_are_resolved_to_their_city(pg_session):
    for p in ("Vadapalani", "Kasi Theatre", "West Jafferkhanpet"):
        assert sc.is_city_serviceable(pg_session, p), p
    assert sc.city_entry_for_place(pg_session, "Vadapalani")["city"] == "Chennai"


def test_cities_that_are_switched_off_or_unknown_are_still_refused(pg_session):
    assert not sc.is_city_serviceable(pg_session, "Bangalore")           # in the list but off by default
    assert not sc.is_city_serviceable(pg_session, "Jayanagar")           # resolves to Bengaluru (off)
    assert not sc.is_city_serviceable(pg_session, "Nowhereville")
    assert not sc.is_city_serviceable(pg_session, "")


def test_the_check_endpoint_answers_with_the_city(pg_session):
    from app.api.routes.cities import check_local_serviceable
    out = check_local_serviceable(place="Kasi Theatre", db=pg_session)
    assert out["serviceable"] is True and out["city"] == "Chennai" and "Chennai" in out["cities"]
    assert check_local_serviceable(place="Jayanagar", db=pg_session)["serviceable"] is False
