package in.dropcars.app.data.model

data class CreateRazorpayOrderRequest(
    val amount: Int,                 // in paise (₹1 = 100 paise)
    val currency: String = "INR",
    val notes: Map<String, String> = mapOf("purpose" to "wallet_topup")
)

data class RazorpayOrderResponse(
    val rp_order_id: String,
    val amount: Int,
    val currency: String = "INR"
)

data class VerifyRazorpayPaymentRequest(
    val rp_order_id: String,
    val rp_payment_id: String,
    val rp_signature: String
)

data class RazorpayTransactionOut(
    val message: String,
    val status: String,
    val new_balance: Double? = null
)

data class WalletBalance(
    val vehicle_owner_id: String? = null,
    val current_balance: Double = 0.0
)

data class WalletLedgerEntry(
    val id: Int,
    val vehicle_owner_id: String,
    val entry_type: String,         // "CREDIT" | "DEBIT"
    val amount: Double,
    val balance_before: Double,
    val balance_after: Double,
    val notes: String? = null,
    val created_at: String = ""
)

data class WalletHistory(
    val id: Int,
    val vendor_id: String? = null,
    val vehicle_owner_id: String? = null,
    val type: String = "CREDIT",
    val amount: Double,
    val description: String? = null,
    val created_at: String = ""
)

data class TransferRequest(
    val requested_amount: Int,
    val notes: String? = null
)

data class TransferTransaction(
    val id: Int,
    val vendor_id: String,
    val requested_amount: Int,
    val wallet_balance_before: Int? = null,
    val wallet_balance_after: Int? = null,
    val status: String = "PENDING", // "PENDING"|"APPROVED"|"REJECTED"
    val admin_notes: String? = null,
    val created_at: String = "",
    val updated_at: String? = null
)

data class VendorBalance(
    val vendor_id: String,
    val wallet_balance: Int,
    val bank_balance: Int,
    val total_balance: Int
)
