"""Automatic debit of the plan fee (owner rule 2026-10-24: wallet covers the fee = taken without asking), top-up start, unblock restore,
and the Plans & Account Rules content (served in all 5 languages with live numbers)."""
from datetime import date, timedelta

from tests.test_block_and_lifecycle import _owner as _plain_owner, _driver


def _owner(db, **kw):
    from app.models.vehicle_owner import AccountStatusEnum
    cred, det = _plain_owner(db, **kw)
    cred.account_status = AccountStatusEnum.ACTIVE          # only active accounts are billed (Pending / Inactive are not using the app)
    return cred, det


def _rule_on(db, started_days_ago=60):
    from app.crud.subscription_lifecycle import update_settings
    from app.models.platform_setting import PlatformSetting
    update_settings(db, enabled=True)
    row = db.query(PlatformSetting).filter(PlatformSetting.key == "lifecycle_start_date").first()
    row.value = (date.today() - timedelta(days=started_days_ago)).isoformat()
    db.commit()


def _fee(db):
    from app.crud.subscription_lifecycle import _raw_fee
    return _raw_fee(db)


def test_free_window_over_and_wallet_covers_fee_plan_starts_by_itself(pg_session):
    from app.crud.subscription_lifecycle import auto_start_plans
    from app.models.wallet_ledger import WalletLedger
    _rule_on(pg_session)
    fee = _fee(pg_session)
    cred, det = _owner(pg_session, created_days_ago=90)
    det.wallet_balance = fee + 301
    pg_session.commit()
    res = auto_start_plans(pg_session, only_owner=cred.id)
    assert [x["vehicle_owner_id"] for x in res["started"]] == [str(cred.id)]
    pg_session.refresh(det)
    assert det.subscription_type == "MONTHLY" and det.billing_next_date >= date.today() + timedelta(days=29)
    assert det.wallet_balance == 301
    assert det.billing_suspended is False
    led = pg_session.query(WalletLedger).filter(WalletLedger.vehicle_owner_id == cred.id, WalletLedger.reference_type == "MONTHLY_SUBSCRIPTION_FEE").all()
    assert len(led) == 1 and led[0].amount == fee
    # a second run never charges again
    assert auto_start_plans(pg_session, only_owner=cred.id)["started"] == []
    pg_session.refresh(det)
    assert det.wallet_balance == 301


def test_wallet_short_nothing_is_taken(pg_session):
    from app.crud.subscription_lifecycle import auto_start_plans
    _rule_on(pg_session)
    fee = _fee(pg_session)
    cred, det = _owner(pg_session, created_days_ago=90)
    det.wallet_balance = fee - 1
    pg_session.commit()
    assert auto_start_plans(pg_session, only_owner=cred.id)["started"] == []
    pg_session.refresh(det)
    assert det.wallet_balance == fee - 1 and det.subscription_type is None


def test_nothing_is_taken_during_the_free_days_or_while_the_rule_is_off(pg_session):
    from app.crud.subscription_lifecycle import auto_start_plans, update_settings
    update_settings(pg_session, enabled=False)
    cred, det = _owner(pg_session, created_days_ago=90)
    det.wallet_balance = 5000
    pg_session.commit()
    assert auto_start_plans(pg_session, only_owner=cred.id)["started"] == []          # rule off
    _rule_on(pg_session, started_days_ago=1)                                          # rule on, but everybody has 30 fresh days
    assert auto_start_plans(pg_session, only_owner=cred.id)["started"] == []
    pg_session.refresh(det)
    assert det.wallet_balance == 5000


def test_sweep_starts_plans_for_funded_owners_and_suspends_the_rest(pg_session):
    from app.crud.billing import run_member_auto_renewals
    from app.crud.subscription_lifecycle import REASON
    _rule_on(pg_session)
    fee = _fee(pg_session)
    rich, rd = _owner(pg_session, created_days_ago=90)
    poor, pd = _owner(pg_session, created_days_ago=90)
    rd.wallet_balance = fee + 50
    pd.wallet_balance = fee - 10
    pg_session.commit()
    run_member_auto_renewals(pg_session)
    pg_session.refresh(rd)
    pg_session.refresh(pd)
    assert rd.subscription_type == "MONTHLY" and not rd.billing_suspended and rd.wallet_balance == 50
    assert pd.billing_suspended is True and pd.billing_suspended_reason == REASON and pd.wallet_balance == fee - 10


def test_topping_up_a_suspended_owner_starts_the_plan_and_opens_the_account(pg_session):
    from app.crud.subscription_lifecycle import auto_start_plans, REASON
    _rule_on(pg_session)
    fee = _fee(pg_session)
    cred, det = _owner(pg_session, created_days_ago=90)
    det.billing_suspended = True
    det.billing_suspended_reason = REASON
    det.wallet_balance = 0
    pg_session.commit()
    assert auto_start_plans(pg_session, only_owner=cred.id)["started"] == []          # still no money
    det.wallet_balance = fee
    pg_session.commit()
    assert len(auto_start_plans(pg_session, only_owner=cred.id)["started"]) == 1
    pg_session.refresh(det)
    assert det.billing_suspended is False and det.billing_suspended_reason is None and det.wallet_balance == 0


def test_staff_suspension_for_another_reason_is_not_touched(pg_session):
    from app.crud.subscription_lifecycle import auto_start_plans
    _rule_on(pg_session)
    cred, det = _owner(pg_session, created_days_ago=90)
    det.billing_suspended = True
    det.billing_suspended_reason = "Documents under review"
    det.wallet_balance = 5000
    pg_session.commit()
    assert auto_start_plans(pg_session, only_owner=cred.id)["started"] == []
    pg_session.refresh(det)
    assert det.wallet_balance == 5000 and det.billing_suspended is True


def test_unblock_makes_the_owners_drivers_and_cars_usable_again(pg_session):
    from app.crud.admin_management import set_permanent_block
    from app.models.car_details import CarDetails, CarStatusEnum
    from app.models.car_driver import AccountStatusEnum
    cred, _ = _owner(pg_session)
    drv = _driver(pg_session, cred.id)
    set_permanent_block(pg_session, str(cred.id), "vehicle_owner", "fraud", blocked=True, by="t")
    pg_session.refresh(drv)
    assert drv.permanently_blocked and drv.driver_status == AccountStatusEnum.BLOCKED
    set_permanent_block(pg_session, str(cred.id), "vehicle_owner", "", blocked=False, by="t")
    pg_session.refresh(drv)
    assert drv.permanently_blocked is False and drv.driver_status == AccountStatusEnum.OFFLINE


def test_plan_rules_and_terms_speak_in_every_language_with_live_numbers(pg_session):
    from app.api.routes.app_content import load_content, fill, _placeholders
    from app.utils.app_content_defaults import LANGS
    rules = load_content(pg_session, "driver_plan_rules")
    ph = _placeholders(pg_session)
    for lg in LANGS:
        text = fill(rules["body"][lg], ph)
        assert "{" not in text, (lg, text[text.index("{"):][:40])                      # every placeholder was filled
        assert ph["monthly_fee"] in text and ph["free_days"] in text
        assert fill(rules["summary"][lg], ph).count("\n") >= 5
    terms = load_content(pg_session, "driver_terms")
    for lg in ("en", "ta"):
        t = fill(terms["body"][lg], ph)
        assert "{" not in t.replace("{support", "")                                   # support placeholders are filled too
    assert "AUTOMATIC DEBIT" in terms["body"]["en"] and "14.3." in terms["body"]["en"] and "16. SUPPORT AND DISPUTES" in terms["body"]["en"]
    assert terms["version"] >= 3
