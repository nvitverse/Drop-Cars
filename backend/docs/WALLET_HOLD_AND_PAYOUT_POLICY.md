# Wallet Hold, Commission & Payout Policy

This is the actual, currently-implemented behavior for how a fleet owner's
wallet is debited/credited across a booking's lifecycle, and the rules for
cashing out. Source of truth is the code cited under each section - update
this doc if that code changes.

## 1. Accept a booking → commission + extras are held immediately

When a fleet owner accepts a booking, the commission + extras are debited
from their wallet right away as a `TRIP_HOLD` ledger entry.

- Code: `app/api/routes/order_assignments.py` (`debit_wallet(..., reference_type="TRIP_HOLD")`)
- Ledger label: **"Debited for Booking ID {id}"**

This amount is provisional - what happens to it depends on how the booking
ends:

| Outcome | What happens to the hold | Ledger label after |
|---|---|---|
| Trip completes | Hold is kept as commission. If the final fare differs from the estimate, only the *difference* is settled as a separate `TRIP_COMPLETION` entry. | **"Commission for Booking ID {id}"** (the original `TRIP_HOLD` entry is corrected in place - see `app/crud/end_records.py`) |
| Vendor cancels the booking | Full hold is refunded as a `TRIP_HOLD_REFUND` credit. | Refund entry reads "Refund: booking {id} cancelled by vendor" (`app/crud/order_assignments.py`) |
| Auto-cancelled (driver/car not assigned in time) | Hold is forfeited as a penalty (minimum ₹500, whichever is greater than the hold). | "Booking {id} auto-cancelled - held amount forfeited as penalty" |

No entry is ever left saying "Held ... (refunded if vendor cancels)" once
the outcome is known - the wording always reflects what actually happened,
not what might happen.

## 2. Payout requests: ₹500 minimum must stay in the wallet

A fleet owner can self-serve request a cash payout of their wallet balance,
but the request is capped so the wallet never drops below **₹500** after
the payout.

- Code: `app/crud/payout_requests.py` → `MIN_RETAINED_BALANCE = 500`
- `max_redeemable = balance - MIN_RETAINED_BALANCE`; requesting more than
  that is rejected with a clear error naming the actual redeemable amount.
- Only one payout request can be pending at a time per owner.
- Settlement is manual - admin pays outside the app and marks the request
  Paid (no automated bank transfer integration).

## 3. Why this design

- **Hold-at-accept, not hold-at-complete**: commission is reserved the
  moment a fleet owner takes a booking, so the platform's share is never at
  risk of the owner spending down their wallet mid-trip.
- **Correct the same ledger row instead of adding a new one**: the driver
  app's Transaction History is meant to read as a timeline of what
  happened to *this booking's* money, not a growing pile of hold/adjustment
  rows for the same event. In-place correction keeps one row per booking
  wherever possible.
- **₹500 floor on payouts**: keeps a small working balance in the wallet so
  the owner isn't immediately locked out of accepting new bookings (which
  requires a minimum balance) right after cashing out.
