"""Owner rules 2026-10-02: (1) EVERY booking holds at least Rs 500 (commission Rs 301 still holds 500; a bigger commission with
extras is what is held); (2) paying for a subscription activates it, and a wallet with the fee renews it automatically."""
import uuid
from datetime import date, datetime, timedelta

from app.crud import billing
from app.crud.manual_allocation import hold_for_order
from app.utils.commission import expected_hold, min_hold_amount
from app.models.wallet_ledger import WalletLedger


def _owner(db, balance):
    from app.models.vehicle_owner import VehicleOwnerCredentials
    from app.models.vehicle_owner_details import VehicleOwnerDetails
    phone = "9" + str(uuid.uuid4().int)[:9]
    cred = VehicleOwnerCredentials(primary_number=phone, hashed_password="x")
    db.add(cred)
    db.flush()
    d = VehicleOwnerDetails(vehicle_owner_id=cred.id, full_name="Sub Test", primary_number=phone, aadhar_number="A" + str(uuid.uuid4().int)[:11],
                            address="x", city="Chennai", pincode="600001", wallet_balance=balance)
    db.add(d)
    db.flush()
    return d


def _order(db, source, estimated=2000, vendor=2300):
    from app.models.orders import Order, Trip_status
    from app.models.new_orders import OrderTypeEnum, CarTypeEnum
    o = Order(source=source, source_order_id=0, trip_type=OrderTypeEnum.ONEWAY, car_type=CarTypeEnum.HATCHBACK,
              pickup_drop_location={"0": "Chennai", "1": "Vellore"}, start_date_time=datetime.utcnow() + timedelta(hours=5),
              customer_name="T", customer_number="9000000000", trip_status=Trip_status.PENDING, estimated_price=estimated, vendor_price=vendor)
    db.add(o)
    db.flush()
    return o


def test_minimum_hold_applies_to_every_booking(pg_session):
    from app.models.orders import OrderSourceEnum
    assert min_hold_amount(pg_session) == 500
    assert expected_hold({"poster_share": 100, "platform_fee": 201, "min_hold": 500}) == 500          # commission 301 -> still 500
    assert expected_hold({"poster_share": 400, "platform_fee": 350, "min_hold": 500}) == 750          # bigger commission with extras -> that amount
    assert hold_for_order(pg_session, _order(pg_session, OrderSourceEnum.HOURLY_RENTAL)) == 500       # hourly rental: commission 300 -> 500
    assert hold_for_order(pg_session, _order(pg_session, OrderSourceEnum.HOURLY_RENTAL, 2000, 3000)) == 1000   # above the minimum: unchanged


def test_paying_for_the_monthly_plan_activates_it_without_a_wallet_floor(pg_session):
    d = _owner(pg_session, 199)            # exactly the fee, no Rs 500 floor on top
    assert billing.activate_plan_from_payment(pg_session, d.vehicle_owner_id, "monthly") == "MONTHLY"
    pg_session.refresh(d)
    assert (d.subscription_type, d.wallet_balance, d.auto_renew_from_wallet) == ("MONTHLY", 0, True)
    assert d.billing_next_date == date.today() + timedelta(days=30) and d.tier == "PREFERRED"
    assert billing.activate_plan_from_payment(pg_session, d.vehicle_owner_id, "monthly") is None       # a second call never charges twice
    assert pg_session.query(WalletLedger).filter(WalletLedger.vehicle_owner_id == d.vehicle_owner_id, WalletLedger.reference_type == "MONTHLY_SUBSCRIPTION_FEE").count() == 1


def test_monthly_plan_renews_from_wallet_or_lapses(pg_session):
    rich, poor = _owner(pg_session, 400), _owner(pg_session, 100)
    for d in (rich, poor):
        d.subscription_type, d.billing_next_date, d.auto_renew_from_wallet = "MONTHLY", date.today() - timedelta(days=1), True
    pg_session.flush()
    out = billing.run_monthly_auto_renewals(pg_session)
    assert out["renewed"] >= 1 and out["wallet_too_low"] >= 1
    pg_session.refresh(rich)
    pg_session.refresh(poor)
    assert (rich.wallet_balance, rich.billing_next_date) == (201, date.today() + timedelta(days=30))
    assert (poor.wallet_balance, poor.billing_next_date) == (100, date.today() - timedelta(days=1))      # nothing taken, plan lapses
    assert billing.run_monthly_auto_renewals(pg_session)["renewed"] == 0                                 # idempotent


def test_a_long_lapsed_monthly_plan_is_not_charged_behind_the_owners_back(pg_session):
    d = _owner(pg_session, 1000)
    d.subscription_type, d.billing_next_date, d.auto_renew_from_wallet = "MONTHLY", date.today() - timedelta(days=40), True
    pg_session.flush()
    billing.run_monthly_auto_renewals(pg_session)
    pg_session.refresh(d)
    assert d.wallet_balance == 1000


# ---- the owner's driver tariff (2026-10-02) ----
def _split(car, trip, km, bata, permit, stops=("Chennai", "Madurai")):
    from app.crud import driver_tariff as DT
    loc = {str(i): s for i, s in enumerate(stops)}
    return DT.split_fare(DT.default_config(), car_type=car, pickup_drop_location=loc, customer_km_rate=km, customer_bata=bata, customer_permit=permit, trip_type=trip)


def test_owner_driver_rates_per_vehicle_and_trip_type():
    r = _split("SEDAN_4_PLUS_1", "Oneway", 15, 400, 500)
    assert (r["cost_per_km"], r["extra_cost_per_km"], r["driver_allowance"], r["extra_driver_allowance"], r["permit_charges"], r["extra_permit_charges"]) == (15, 0, 300, 100, 400, 100)
    r = _split("SEDAN_4_PLUS_1", "Round Trip", 16, 300, 0)
    assert (r["cost_per_km"], r["extra_cost_per_km"]) == (13, 3)
    assert _split("SUV", "Oneway", 20, 500, 0)["extra_driver_allowance"] == 200                      # SUV bata 300, the rest is extra
    assert [_split("SUV_6_PLUS_1", t, 25, 300, 0)["cost_per_km"] for t in ("Oneway", "Round Trip")] == [20, 18]
    assert [_split("INNOVA", t, 25, 400, 0)["cost_per_km"] for t in ("Oneway", "Round Trip")] == [20, 19]
    assert [_split("INNOVA_CRYSTA", t, 30, 400, 0)["cost_per_km"] for t in ("Oneway", "Round Trip")] == [24, 22]
    assert _split("INNOVA", "Oneway", 25, 450, 0)["driver_allowance"] == 400                          # innova / crysta bata 400
    assert _split("HATCHBACK", "Oneway", 11, 300, 0)["cost_per_km"] == 11                              # not in the tariff: customer's rate
    assert _split("SEDAN_4_PLUS_1", "Oneway", 12, 300, 0)["cost_per_km"] == 12                         # never above what the customer pays


def test_owner_permit_rules():
    p = lambda car, *stops: _split(car, "Oneway", 20, 300, 3000, ("Chennai",) + stops)["permit_charges"]
    assert p("SEDAN_4_PLUS_1", "Bangalore") == 400 and p("NEW_SEDAN_2022_MODEL", "Pondicherry") == 400
    assert p("SUV_6_PLUS_1", "Bangalore") == 1000 and p("INNOVA_CRYSTA_6_PLUS_1", "Kochi") == 1000
    assert p("SUV_6_PLUS_1", "Pondicherry") == 800 and p("INNOVA_7_PLUS_1", "Puducherry") == 800     # Pondicherry only 800, 7+1 too
    assert p("SUV_6_PLUS_1", "Tirupati") == 1000                                                      # AP is 1000 for 6+1 ...
    assert p("SUV_7_PLUS_1", "Tirupati") == 2000 and p("INNOVA_CRYSTA_7_PLUS_1", "Vijayawada") == 2000   # ... and 2000 only for 7+1
    assert p("SUV_7_PLUS_1", "Bangalore") == 1000                                                     # 7+1 otherwise same as 6+1
    assert _split("SUV_6_PLUS_1", "Oneway", 20, 300, 1500, ("Chennai", "Kochi"))["extra_permit_charges"] == 500   # the rest of what the customer paid is extra
