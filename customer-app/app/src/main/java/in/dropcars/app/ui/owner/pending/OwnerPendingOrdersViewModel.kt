package in.dropcars.app.ui.owner.pending

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import dagger.hilt.android.lifecycle.HiltViewModel
import in.dropcars.app.data.model.AvailableCarResponse
import in.dropcars.app.data.model.AvailableDriverResponse
import in.dropcars.app.data.model.PendingOrderForOwner
import in.dropcars.app.data.repository.AssignmentRepository
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.launch
import javax.inject.Inject

sealed interface PendingOrdersUiState {
    object Loading : PendingOrdersUiState
    data class Success(val orders: List<PendingOrderForOwner>) : PendingOrdersUiState
    data class Error(val message: String) : PendingOrdersUiState
}

@HiltViewModel
class OwnerPendingOrdersViewModel @Inject constructor(
    private val assignmentRepository: AssignmentRepository
) : ViewModel() {

    private val _uiState = MutableStateFlow<PendingOrdersUiState>(PendingOrdersUiState.Loading)
    val uiState: StateFlow<PendingOrdersUiState> = _uiState

    private val _availableDrivers = MutableStateFlow<List<AvailableDriverResponse>>(emptyList())
    val availableDrivers: StateFlow<List<AvailableDriverResponse>> = _availableDrivers

    private val _availableCars = MutableStateFlow<List<AvailableCarResponse>>(emptyList())
    val availableCars: StateFlow<List<AvailableCarResponse>> = _availableCars

    private val _assignResult = MutableStateFlow<String?>(null)
    val assignResult: StateFlow<String?> = _assignResult

    init {
        fetchPendingOrders()
    }

    fun fetchPendingOrders() {
        viewModelScope.launch {
            _uiState.value = PendingOrdersUiState.Loading
            assignmentRepository.getPendingOrdersForOwner()
                .onSuccess { _uiState.value = PendingOrdersUiState.Success(it) }
                .onFailure { _uiState.value = PendingOrdersUiState.Error(it.message ?: "Failed to load pending orders") }
        }
    }

    fun loadFleetForAssignment() {
        viewModelScope.launch {
            assignmentRepository.getAvailableDrivers().onSuccess { _availableDrivers.value = it }
            assignmentRepository.getAvailableCars().onSuccess { _availableCars.value = it }
        }
    }

    fun acceptOrder(orderId: Int) {
        viewModelScope.launch {
            assignmentRepository.acceptOrder(orderId)
                .onSuccess { fetchPendingOrders() }
                .onFailure { _assignResult.value = it.message ?: "Accept order failed. Check wallet balance." }
        }
    }

    fun assignCarAndDriver(assignmentId: Int, driverId: String, carId: String) {
        viewModelScope.launch {
            assignmentRepository.assignCarDriver(assignmentId, driverId, carId)
                .onSuccess {
                    _assignResult.value = "Driver & Car assigned successfully!"
                    fetchPendingOrders()
                }
                .onFailure {
                    _assignResult.value = it.message ?: "Assignment failed"
                }
        }
    }
}
