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
