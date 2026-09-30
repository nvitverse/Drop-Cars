package in.dropcars.app.ui.admin.dispatch

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import dagger.hilt.android.lifecycle.HiltViewModel
import in.dropcars.app.data.api.DropCarsApi
import in.dropcars.app.data.model.AdminAssignOrderRequest
import in.dropcars.app.data.model.BaseOrder
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.launch
import javax.inject.Inject

sealed interface AdminOrdersState {
    object Loading : AdminOrdersState
    data class Success(val orders: List<BaseOrder>) : AdminOrdersState
    data class Error(val message: String) : AdminOrdersState
}

@HiltViewModel
class AdminDispatchViewModel @Inject constructor(
    private val api: DropCarsApi
) : ViewModel() {

    private val _uiState = MutableStateFlow<AdminOrdersState>(AdminOrdersState.Loading)
    val uiState: StateFlow<AdminOrdersState> = _uiState

    // 5-minute escalation countdown timer (in seconds)
    private val _escalationTimerSeconds = MutableStateFlow(300)
    val escalationTimerSeconds: StateFlow<Int> = _escalationTimerSeconds

    private val _autoEscalated = MutableStateFlow(false)
    val autoEscalated: StateFlow<Boolean> = _autoEscalated

    init {
        loadAdminOrders()
        startEscalationTimer()
    }

    fun loadAdminOrders() {
        viewModelScope.launch {
            _uiState.value = AdminOrdersState.Loading
            runCatching { api.getAdminOrders() }
                .onSuccess { _uiState.value = AdminOrdersState.Success(it) }
                .onFailure { _uiState.value = AdminOrdersState.Error(it.message ?: "Failed to fetch admin orders") }
        }
    }

    private fun startEscalationTimer() {
        viewModelScope.launch {
            while (_escalationTimerSeconds.value > 0) {
                delay(1000)
                _escalationTimerSeconds.value -= 1
            }
            // Timer hit 00:00 -> Auto-escalate state to BROADCAST_TO_DRIVERS
            _autoEscalated.value = true
        }
    }

    fun assignOrder(orderId: Int, ownerId: String?, driverId: String?, carId: String?) {
        viewModelScope.launch {
            runCatching {
                api.adminAssignOrder(orderId, AdminAssignOrderRequest(orderId, ownerId, driverId, carId))
            }.onSuccess {
                loadAdminOrders()
            }
        }
    }
}
