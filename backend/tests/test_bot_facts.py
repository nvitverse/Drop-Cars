"""The help bot quotes the owner's real driver tariff (Admin App > Tariffs > Driver) - no rate card is typed into the bot."""
import asyncio

from app.api.routes import ai_whatsapp_assistant as bot
from app.crud import driver_tariff
from app.utils import bot_facts


def _ask(db, text, audience="driver"):
    return asyncio.run(bot._rule_based_assistant({"message": text, "language": "en", "audience": audience}, db))


def test_the_default_sedan_tariff_is_15_one_way_and_14_round_trip():
    v = driver_tariff.default_config()["vehicles"]["SEDAN_4_PLUS_1"]
    assert (v["km_rate"], v["km_rate_round"]) == (15, 14)


def test_the_tariff_answer_follows_what_admin_saved(pg_session):
    cfg = driver_tariff.default_config()
    cfg["vehicles"]["SEDAN_4_PLUS_1"] = {"km_rate": 16, "km_rate_round": 12, "bata": 350}
    driver_tariff.save(pg_session, cfg)
    text = _ask(pg_session, "tariff rates")["reply"]
    sedan = next(line for line in text.splitlines() if "Sedan" in line)
    assert "₹16/km" in sedan and "₹12/km" in sedan and "₹350" in sedan
    assert "Outstation min 250" not in text and "Prime SUV" not in text            # the old typed-in rate card is gone


def test_a_named_route_uses_the_live_rate_for_the_trip_type(pg_session):
    driver_tariff.save(pg_session, driver_tariff.default_config())
    one = _ask(pg_session, "chennai to madurai fare")["reply"]
    rnd = _ask(pg_session, "chennai to madurai round trip fare")["reply"]
    assert "One-way" in one and "₹15/km" in one and "₹14/km" not in one
    assert "Round trip" in rnd and "₹14/km" in rnd and "₹15/km" not in rnd
    assert "Distance: ~920 km" in rnd                                       # there and back


def test_an_unknown_route_is_not_guessed(pg_session):
    r = _ask(pg_session, "salem to kochi fare")["reply"]
    assert "do not have the distance" in r and "320" not in r


def test_money_answers_read_the_settings(pg_session):
    assert "minimum ₹500" in _ask(pg_session, "wallet hold")["reply"]
    adv = _ask(pg_session, "advance gst commission")["reply"]
    assert "10%" in adv and "2%" not in adv and "₹30" in adv                 # the retired extra 2% is not quoted
    assert "₹300 per day" in _ask(pg_session, "round trip bata")["reply"]
    w = _ask(pg_session, "waiting charges")["reply"]
    assert "₹2/min" not in w and "₹60 per hour" in w


def test_the_llm_rule_sheet_carries_the_tariff(pg_session):
    from app.utils import ai_llm
    driver_tariff.save(pg_session, driver_tariff.default_config())
    sheet = ai_llm._rules_text(pg_session)
    assert "DRIVER TARIFF" in sheet and "Sedan: one-way Rs 15/km, round trip Rs 14/km" in sheet
    assert bot_facts.tariff_plain(pg_session) in sheet
