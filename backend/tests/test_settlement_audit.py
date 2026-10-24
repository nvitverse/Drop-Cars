"""Manual close: a Rs 500 hold came back as Rs 3800 (Virugambakkam - Kanchipuram round trip, 2026-10-24). The driver's wallet moves by
(driver_net - cash + hold), so the cash typed at close (or an advance the platform holds) goes straight into his wallet."""
from app.crud.settlement_audit import classify

# commission-free round trip: driver fare 3300, Rs 30 convenience fee on the bill, hold 500
BILL, NET, HOLD = 3330, 3300, 500


def test_normal_commission_free_close_returns_only_the_hold():
    # driver collected the whole bill: wallet = (3300 - 3330) + 500 = 470
    assert classify(customer_total=BILL, driver_net=NET, advance=0, cash=None, hold=HOLD, completion_net=470, manual=True) is None


def test_cash_typed_as_zero_credits_the_whole_fare():
    # office typed 0 as the cash: wallet = (3300 - 0) + 500 = 3800  <- the reported case
    r = classify(customer_total=BILL, driver_net=NET, advance=0, cash=0, hold=HOLD, completion_net=3800, manual=True)
    assert r["reason"] == "CASH_ENTERED_LOWER_THAN_BILL"
    assert r["actual_credit"] == 3800 and r["hold_only_credit"] == 470 and r["extra_credited"] == 3330


def test_advance_with_the_platform_is_paid_to_the_driver():
    # Rs 3330 advance sits with the platform, cash left to collect = 0: wallet = (3300 - 0) + 500 = 3800 as well
    r = classify(customer_total=BILL, driver_net=NET, advance=3330, cash=None, hold=HOLD, completion_net=3800, manual=True)
    assert r["reason"] == "ADVANCE_PAID_OUT_TO_DRIVER"
    assert r["advance"] == 3330 and r["extra_credited"] == 3330


def test_cash_higher_than_expected_is_flagged_the_other_way():
    # advance 1000 so the driver should have collected 2330, but 4330 was typed: wallet = (3300 - 4330) + 500 = -530
    r = classify(customer_total=BILL, driver_net=NET, advance=1000, cash=4330, hold=HOLD, completion_net=-530, manual=False)
    assert r is not None and r["reason"] == "CASH_ENTERED_HIGHER_THAN_BILL_MINUS_ADVANCE"


def test_small_differences_are_ignored():
    assert classify(customer_total=BILL, driver_net=NET, advance=0, cash=3300, hold=HOLD, completion_net=500, manual=False) is None
