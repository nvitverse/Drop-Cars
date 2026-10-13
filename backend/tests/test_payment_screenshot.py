"""Reading the UTR / amount from a UPI payment screenshot (text as the OCR returns it)."""
from app.utils.payment_screenshot import compare_with_claim, parse_payment_text

OURS = "7200217986-1@okbizaxis"

GPAY = """To NAVEEN R
₹210
Completed
12 Oct 2026, 3:48pm
Indian Bank 4590
Payment of ₹210 completed
Receiver's bank has confirmed deposit of money to NAVEEN R's bank account
UPI transaction ID
628553733041
To: NAVEEN R
••••86-1@okbizaxis
From: Mrs JOTHIKA SARAVANAN (Indian Bank)
••••09-1@oksbi on Google Pay
Google transaction ID
CICAgPjm7d6Aew"""

PHONEPE = """Payment Successful
Paid to Naveen R
₹ 1,023.60
Transaction ID T2610121548123456789012
UTR: 628553733041
Debited from XXXX4590
naveen@ybl"""

PAYTM = """Money Sent Successfully
Rs. 210
UPI Ref No: 6285 5373 3041
To: 7200217986-1@okbizaxis"""


def test_google_pay_screenshot():
    r = parse_payment_text(GPAY, OURS)
    assert r["utr"] == "628553733041" and r["amount"] == 210 and r["success"] is True and r["payee_matches_ours"] is True


def test_phonepe_style_prefers_the_utr_over_the_long_transaction_id():
    r = parse_payment_text(PHONEPE, OURS)
    assert r["utr"] == "628553733041" and r["success"] is True and r["payee_matches_ours"] is False


def test_paytm_style_with_spaces_in_the_number():
    r = parse_payment_text(PAYTM, OURS)
    assert r["utr"] == "628553733041" and r["payee_matches_ours"] is True


def test_nothing_readable_gives_empty_fields_not_a_guess():
    r = parse_payment_text("Hello there 123 456 two numbers 111122223333 and 999988887777", OURS)
    assert r["utr"] is None                                   # two different 12-digit numbers and no label: do not guess
    assert parse_payment_text("", OURS)["utr"] is None


def test_a_failed_payment_screenshot_is_flagged():
    assert parse_payment_text("Payment failed\n₹210\nUPI transaction ID 628553733041", OURS)["success"] is False


def test_comparison_with_what_the_person_typed():
    scan = parse_payment_text(GPAY, OURS)
    ok = compare_with_claim(scan, "628553733041", 210)
    assert ok == {"utr_matches": True, "amount_matches": True, "paid_to_our_upi": True, "shows_completed": True}
    bad = compare_with_claim(scan, "628553733042", 500)
    assert bad["utr_matches"] is False and bad["amount_matches"] is False
    assert compare_with_claim(None, "628553733041", 210)["utr_matches"] is None
