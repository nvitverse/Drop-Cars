package in.dropcars.app.ui.vendor.wallet

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import dagger.hilt.android.lifecycle.HiltViewModel
import in.dropcars.app.data.model.TransferTransaction
import in.dropcars.app.data.model.VendorBalance
import in.dropcars.app.data.model.WalletHistory
import in.dropcars.app.data.repository.WalletRepository
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.launch
import javax.inject.Inject

sealed interface VendorWalletState {
    object Loading : VendorWalletState
    data class Success(
        val balance: VendorBalance,
        val history: List<WalletHistory>,
        val transfers: List<TransferTransaction>
    ) : VendorWalletState
    data class Error(val message: String) : VendorWalletState
}

@HiltViewModel
class VendorWalletViewModel @Inject constructor(
    private val walletRepository: WalletRepository
) : ViewModel() {

    private val _uiState = MutableStateFlow<VendorWalletState>(VendorWalletState.Loading)
    val uiState: StateFlow<VendorWalletState> = _uiState

    init {
        loadWalletData()
    }

    fun loadWalletData() {
        viewModelScope.launch {
            _uiState.value = VendorWalletState.Loading
            val balanceRes = walletRepository.getTransferBalance()
            val historyRes = walletRepository.getVendorWalletHistory()
            val transfersRes = walletRepository.getTransferHistory()

            if (balanceRes.isSuccess) {
                _uiState.value = VendorWalletState.Success(
                    balance = balanceRes.getOrNull() ?: VendorBalance("", 0, 0, 0),
                    history = historyRes.getOrDefault(emptyList()),
                    transfers = transfersRes.getOrDefault(emptyList())
                )
            } else {
                _uiState.value = VendorWalletState.Error(balanceRes.exceptionOrNull()?.message ?: "Failed to load wallet")
            }
        }
    }

    fun requestWithdrawal(amount: Int, notes: String?) {
        viewModelScope.launch {
            walletRepository.requestTransfer(amount, notes)
                .onSuccess { loadWalletData() }
        }
    }
}
