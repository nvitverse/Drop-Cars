package in.dropcars.app.ui.vendor.orders

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import dagger.hilt.android.lifecycle.HiltViewModel
import in.dropcars.app.data.model.BaseOrder
import in.dropcars.app.data.model.VendorOrderDetailResponse
import in.dropcars.app.data.repository.AssignmentRepository
import in.dropcars.app.data.repository.OrderRepository
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.launch
import javax.inject.Inject

sealed interface VendorOrdersUiState {
    object Loading : VendorOrdersUiState
    data class Success(val orders: List<BaseOrder>) : VendorOrdersUiState
    data class Error(val message: String) : VendorOrdersUiState
}

@HiltViewModel
class VendorOrdersViewModel @Inject constructor(
    private val orderRepository: OrderRepository,
    private val assignmentRepository: AssignmentRepository
) : ViewModel() {

    private val _uiState = MutableStateFlow<VendorOrdersUiState>(VendorOrdersUiState.Loading)
    val uiState: StateFlow<VendorOrdersUiState> = _uiState

    private val _orderDetailState = MutableStateFlow<VendorOrderDetailResponse?>(null)
    val orderDetailState: StateFlow<VendorOrderDetailResponse?> = _orderDetailState

    init {
        fetchOrders()
    }

    fun fetchOrders() {
        viewModelScope.launch {
            _uiState.value = VendorOrdersUiState.Loading
            orderRepository.getVendorOrders()
                .onSuccess { _uiState.value = VendorOrdersUiState.Success(it) }
                .onFailure { _uiState.value = VendorOrdersUiState.Error(it.message ?: "Failed to load orders") }
        }
    }

    fun fetchOrderDetail(orderId: Int) {
        viewModelScope.launch {
            orderRepository.getVendorOrderDetail(orderId)
                .onSuccess { _orderDetailState.value = it }
        }
    }

    fun cancelOrder(orderId: Int) {
        viewModelScope.launch {
            assignmentRepository.vendorCancelOrder(orderId)
                .onSuccess { fetchOrders() }
        }
    }

    fun recreateOrder(orderId: Int) {
        viewModelScope.launch {
            orderRepository.recreateOrder(orderId)
                .onSuccess { fetchOrders() }
        }
    }
}
