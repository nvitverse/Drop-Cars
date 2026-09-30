package in.dropcars.app.data.repository

import in.dropcars.app.data.api.DropCarsApi
import in.dropcars.app.data.model.*
import javax.inject.Inject
import javax.inject.Singleton

@Singleton
class WalletRepository @Inject constructor(
    private val api: DropCarsApi
) {
    suspend fun createRazorpayOrder(amountInRupees: Int): Result<RazorpayOrderResponse> {
        return runCatching {
            val amountInPaise = amountInRupees * 100
            api.createRazorpayOrder(CreateRazorpayOrderRequest(amount = amountInPaise))
        }
    }

    suspend fun verifyRazorpayPayment(
        rpOrderId: String,
        rpPaymentId: String,
        rpSignature: String
    ): Result<RazorpayTransactionOut> {
        return runCatching {
            api.verifyRazorpayPayment(
                VerifyRazorpayPaymentRequest(rpOrderId, rpPaymentId, rpSignature)
            )
        }
    }

    suspend fun getWalletBalance(): Result<WalletBalance> {
        return runCatching { api.getWalletBalance() }
    }

    suspend fun getWalletLedger(): Result<List<WalletLedgerEntry>> {
        return runCatching { api.getWalletLedger() }
    }

    suspend fun getVendorWalletHistory(): Result<List<WalletHistory>> {
        return runCatching { api.getVendorWalletHistory() }
    }

    suspend fun requestTransfer(amount: Int, notes: String?): Result<TransferTransaction> {
        return runCatching {
            api.requestTransfer(TransferRequest(requested_amount = amount, notes = notes))
        }
    }

    suspend fun getTransferBalance(): Result<VendorBalance> {
        return runCatching { api.getTransferBalance() }
    }

    suspend fun getTransferHistory(): Result<List<TransferTransaction>> {
        return runCatching { api.getTransferHistory() }
    }
}
