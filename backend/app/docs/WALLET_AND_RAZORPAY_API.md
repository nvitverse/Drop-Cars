Wallet and Razorpay APIs (Vehicle Owner)

Base URL prefix: `/api`

Authentication: Vehicle Owner bearer token.

1) Create Razorpay Order
- Method: POST
- Path: `/api/wallet/razorpay/order`
- Body:
```
{
  "amount": 10000,
  "currency": "INR",
  "notes": {"purpose": "wallet_topup"}
}
```
- Response:
```
{
  "rp_order_id": "order_Example123",
  "amount": 10000,
  "currency": "INR"
}
```

2) Verify Razorpay Payment (Callback from client after payment success)
- Method: POST
- Path: `/api/wallet/razorpay/verify`
- Body:
```
{
  "rp_order_id": "order_Example123",
  "rp_payment_id": "pay_Example456",
  "rp_signature": "signature_from_razorpay"
}
```
- Behavior: Verifies signature, marks transaction captured, credits wallet ledger and updates `vehicle_owner_details.wallet_balance`.
- Response: Razorpay transaction record.

3) Get Wallet Ledger
- Method: GET
- Path: `/api/wallet/ledger`
- Response: Array of ledger entries (newest first)

4) Get Current Wallet Balance
- Method: GET
- Path: `/api/wallet/balance`
- Response:
```
{
  "vehicle_owner_id": "<uuid>",
  "current_balance": 12345
}
```

5) Debit on Order Accept
- Hooked at: `POST /api/assignments/acceptorder`
- Behavior: Debits a hold amount from wallet before creating assignment. Adjust hold business rule as needed.

Notes:
- Amounts are handled in paise to avoid rounding issues.
- Configure environment variables `RAZORPAY_KEY_ID` and `RAZORPAY_KEY_SECRET`.


