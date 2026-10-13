"""What an auto-posted website booking carries to drivers, for the owner's tariff (Sedan one-way 15 / round trip 14 ...).
Run with -s to print the table the owner asked to see."""
import pytest

from app.crud import driver_tariff as DT
from tests.test_website_booking_keeps_rates import _post, _request, quiet  # noqa: F401  (fixtures / helpers)

ROWS = []


def _run(db, label, **over):
    r = _request(db, **over)
    _, o = _post(db, r)
    ROWS.append((label, over.get("trip_type", "Oneway"), over.get("car_type", "SEDAN_4_PLUS_1"), over.get("quoted_cost_per_km"), over.get("quoted_driver_allowance", 300),
                 f"{o.cost_per_km}|{o.extra_cost_per_km}", f"{o.driver_allowance}|{o.extra_driver_allowance}", f"{o.permit_charges}|{o.extra_permit_charges}",
                 o.estimated_price, o.vendor_price, str(getattr(o.fare_type, "value", o.fare_type))))
    return o


@pytest.fixture(autouse=True)
def _owner_tariff(pg_session):
    DT.save(pg_session, DT.default_config())


def test_matrix(pg_session, quiet):
    db = pg_session
    km = 300
    base = dict(quoted_trip_distance=km, quoted_total_amount=km * 15 + 300, quoted_driver_amount=km * 15 + 300)
    o = _run(db, "S1 oneway sedan 15, bata 300", quoted_cost_per_km=15, **base)
    assert (o.cost_per_km, o.extra_cost_per_km, o.driver_allowance, o.extra_driver_allowance) == (15, 0, 300, 0)
    o = _run(db, "S2 oneway sedan 16, bata 400", quoted_cost_per_km=16, quoted_driver_allowance=400, **{**base, "quoted_total_amount": km * 16 + 400})
    assert (o.cost_per_km, o.extra_cost_per_km, o.driver_allowance, o.extra_driver_allowance) == (15, 1, 300, 100)
    o = _run(db, "S3 round trip sedan 16, bata 300", trip_type="Round Trip", quoted_cost_per_km=16, **{**base, "quoted_total_amount": km * 16 + 300})
    assert (o.cost_per_km, o.extra_cost_per_km) == (14, 2)
    o = _run(db, "S4 round trip sedan 14", trip_type="Round Trip", quoted_cost_per_km=14, **base)
    assert (o.cost_per_km, o.extra_cost_per_km) == (14, 0)
    o = _run(db, "S5 multi city sedan 16", trip_type="Multy City", quoted_cost_per_km=16, **{**base, "quoted_total_amount": km * 16 + 300})
    assert (o.cost_per_km, o.extra_cost_per_km) == (14, 2)
    o = _run(db, "S6 oneway SUV 22, bata 400", car_type="SUV", quoted_cost_per_km=22, quoted_driver_allowance=400, **{**base, "quoted_total_amount": km * 22 + 400})
    assert (o.cost_per_km, o.extra_cost_per_km, o.driver_allowance, o.extra_driver_allowance) == (20, 2, 300, 100)
    o = _run(db, "S7 oneway Innova 22, bata 400", car_type="INNOVA", quoted_cost_per_km=22, quoted_driver_allowance=400, **{**base, "quoted_total_amount": km * 22 + 400})
    assert (o.cost_per_km, o.extra_cost_per_km, o.driver_allowance, o.extra_driver_allowance) == (20, 2, 400, 0)
    o = _run(db, "S8 sedan to Pondicherry permit 600", pickup_drop_location={"0": "Chennai", "1": "Pondicherry"}, quoted_cost_per_km=15, quoted_permit_charges=600,
             **{**base, "quoted_total_amount": km * 15 + 300 + 600})
    assert (o.permit_charges, o.extra_permit_charges) == (400, 200)
    o = _run(db, "S9 hatchback 13 (not in tariff)", car_type="HATCHBACK", quoted_cost_per_km=13, **{**base, "quoted_total_amount": km * 13 + 300})
    assert (o.cost_per_km, o.extra_cost_per_km) == (13, 0)
    o = _run(db, "S10 oneway sedan 15, only 90 km", quoted_cost_per_km=15, quoted_trip_distance=90, quoted_total_amount=130 * 15 + 300, quoted_driver_amount=130 * 15 + 300)
    ROWS.append(("   -> S10 note: the driver's estimate uses the distance on the request (90 km), not the 130 km minimum that is billed at trip close", "", "", "", "", "", "", "", "", "", ""))
    print()
    print(f"{'case':44} {'type':11} {'car':14} {'cust/km':>7} {'cust bata':>9} {'km drv|extra':>12} {'bata drv|extra':>14} {'permit':>9} {'driver est':>10} {'cust total':>10}")
    for r in ROWS:
        print(f"{r[0][:44]:44} {r[1][:11]:11} {r[2][:14]:14} {str(r[3]):>7} {str(r[4]):>9} {r[5]:>12} {r[6]:>14} {r[7]:>9} {str(r[8]):>10} {str(r[9]):>10}")


def test_all_inclusive_posting_follows_the_settings_not_typed_in_numbers(pg_session, quiet):
    from app.models.platform_setting import PlatformSetting
    db = pg_session
    base = dict(quoted_cost_per_km=0, quoted_driver_allowance=0, quoted_total_amount=5000, quoted_driver_amount=4250)
    o = _run(db, "S11 all-inclusive 5000 (default 15%)", **base)
    assert (o.estimated_price, o.platform_fees_percent, o.driver_allowance) == (4250, 15, 300)
    db.add(PlatformSetting(key="platform_all_inclusive_pct", value="20"))
    DT.save(db, {"vehicles": {"SEDAN_4_PLUS_1": {"km_rate": 15, "km_rate_round": 14, "bata": 350}}, "permits": []})
    db.flush()
    o = _run(db, "S12 all-inclusive 5000 (settings: 20%, bata 350)", **base)
    assert (o.estimated_price, o.platform_fees_percent, o.driver_allowance) == (4000, 20, 350)


def test_a_quoted_night_charge_reaches_the_driver_card_and_the_order(pg_session, quiet):
    """The driver's estimate already counted the quoted night charge, but the order dropped it and the card did not list it."""
    from app.models.orders import Order
    db = pg_session
    r = _request(db, quoted_cost_per_km=15, quoted_trip_distance=200, quoted_total_amount=200 * 15 + 300 + 300, quoted_driver_amount=200 * 15 + 300 + 300, quoted_night_charges=300)
    master, o = _post(db, r)
    assert db.query(Order).filter(Order.id == master.id).one().night_charges == 300
    assert any("Night" in str(i.get("label")) and i.get("included") for i in (o.charge_items or []))
    assert o.estimated_price == 200 * 15 + 300 + 300
