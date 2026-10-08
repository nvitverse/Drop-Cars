from datetime import date, timedelta

from app.models.vehicle_owner_details import VehicleOwnerDetails


def _owner(**kw):
    o = VehicleOwnerDetails()
    o.admin_trusted_override = False
    o.driver_pro_trusted_until = None
    o.registration_fee_paid_at = None
    o.billing_next_date = None
    o.billing_suspended = False
    for k, v in kw.items():
        setattr(o, k, v)
    return o


def test_an_ordinary_yearly_subscriber_is_trusted_even_without_a_driver_pro_date():
    # the Admin App list used to count only staff override + driver Pro, so people who had paid the yearly fee were missing
    assert _owner(billing_next_date=date.today() + timedelta(days=200), subscription_type="YEARLY").tier == "PREFERRED"
    assert _owner(billing_next_date=date.today() + timedelta(days=10), subscription_type="MONTHLY").tier == "PREFERRED"


def test_lapsed_or_never_paid_is_standard():
    assert _owner(billing_next_date=date.today() - timedelta(days=1), registration_fee_paid_at=None).tier == "STANDARD"
    assert _owner().tier == "STANDARD"
