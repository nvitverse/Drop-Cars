package in.dropcars.app.ui.owner.wallet

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import dagger.hilt.android.lifecycle.HiltViewModel
import in.dropcars.app.data.model.RazorpayOrderResponse
import in.dropcars.app.data.model.WalletBalance
import in.dropcars.app.data.model.WalletLedgerEntry
import in.dropcars.app.data.repository.WalletRepository
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.launch
import javax.inject.Inject

sealed interface OwnerWalletState {
    object Loading : OwnerWalletState
    data class Success(val balance: WalletBalance, val ledger: List<WalletLedgerEntry>) : OwnerWalletState
    data class Error(val message: String) : OwnerWalletState
}

@HiltViewModel
class OwnerWalletViewModel @Inject constructor(
    private val walletRepository: WalletRepository
) : ViewModel() {

    private val _uiState = MutableStateFlow<OwnerWalletState>(OwnerWalletState.Loading)
    val uiState: StateFlow<OwnerWalletState> = _uiState

    private val _razorpayOrder = MutableStateFlow<RazorpayOrderResponse?>(null)
    val razorpayOrder: StateFlow<RazorpayOrderResponse?> = _razorpayOrder

    private val _paymentVerificationStatus = MutableStateFlow<String?>(null)
    val paymentVerificationStatus: StateFlow<String?> = _paymentVerificationStatus

    init {
        loadWallet()
    }

    fun loadWallet() {
        viewModelScope.launch {
            _uiState.value = OwnerWalletState.Loading
            val balRes = walletRepository.getWalletBalance()
            val ledgerRes = walletRepository.getWalletLedger()

            if (balRes.isSuccess) {
                _uiState.value = OwnerWalletState.Success(
                    balance = balRes.getOrDefault(WalletBalance()),
                    ledger = ledgerRes.getOrDefault(emptyList())
                )
            } else {
                _uiState.value = OwnerWalletState.Error(balRes.exceptionOrNull()?.message ?: "Failed to load wallet")
            }
        }
    }

    fun initiateRazorpayTopup(amountInRupees: Int) {
        viewModelScope.launch {
            walletRepository.createRazorpayOrder(amountInRupees)
                .onSuccess { _razorpayOrder.value = it }
                .onFailure { _paymentVerificationStatus.value = it.message ?: "Razorpay order creation failed" }
        }
    }

    fun verifyRazorpayPayment(rpOrderId: String, rpPaymentId: String, rpSignature: String) {
        viewModelScope.launch {
            walletRepository.verifyRazorpayPayment(rpOrderId, rpPaymentId, rpSignature)
                .onSuccess {
                    _paymentVerificationStatus.value = "Wallet top-up successful!"
                    _razorpayOrder.value = null
                    loadWallet()
                }
                .onFailure {
                    _paymentVerificationStatus.value = it.message ?: "Payment verification failed"
                }
        }
    }
}
