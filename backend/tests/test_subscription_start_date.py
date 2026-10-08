from datetime import date, timedelta
from types import SimpleNamespace
from unittest.mock import MagicMock, patch

from app.crud.fleet_payment_links import apply_subscription_payment


def _details():
    return SimpleNamespace(billing_next_date=None, full_name="X", subscription_type=None, registration_fee_paid_at=None,
                           subscription_paid_at=None, subscription_paid_amount=None, subscription_payment_channel=None,
                           subscription_payment_ref=None, billing_last_charged_at=None, billing_suspended=True,
                           billing_suspended_at=None, billing_suspended_by=None, billing_suspended_reason=None,
                           admin_trusted_override=False, trusted_override_by=None, trusted_override_reason=None, trusted_override_at=None)


def _apply(start_date, plan="YEARLY", duration=365):
    d, db = _details(), MagicMock()
    with patch("app.crud.admin_activity_log.log_admin_action"):
        end = apply_subscription_payment(db, d, "owner-1", plan, 1000, "Bank Transfer", None, None, duration, True, None, "tester", start_date=start_date)
    return d, end


def test_valid_until_is_worked_out_from_the_subscribed_on_day():
    start = date.today() - timedelta(days=100)
    d, end = _apply(start)
    assert end == start + timedelta(days=365)
    assert d.billing_next_date == end and d.subscription_type == "YEARLY"
    # recording an old subscription must not give a permanent staff "Trusted" override: Trusted follows the plan's dates
    assert d.admin_trusted_override is False


def test_no_start_date_keeps_the_old_behaviour():
    d, end = _apply(None, plan="MONTHLY", duration=30)
    assert end == date.today() + timedelta(days=30)
    assert d.admin_trusted_override is True
