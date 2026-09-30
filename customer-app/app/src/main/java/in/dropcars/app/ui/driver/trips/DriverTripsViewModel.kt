package in.dropcars.app.ui.driver.trips

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import dagger.hilt.android.lifecycle.HiltViewModel
import in.dropcars.app.data.model.DriverOrderListResponse
import in.dropcars.app.data.repository.AssignmentRepository
import in.dropcars.app.data.repository.AuthRepository
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.launch
import java.io.File
import javax.inject.Inject

sealed interface DriverTripsState {
    object Loading : DriverTripsState
    data class Success(val assignedTrips: List<DriverOrderListResponse>, val completedTrips: List<DriverOrderListResponse>) : DriverTripsState
    data class Error(val message: String) : DriverTripsState
}

@HiltViewModel
class DriverTripsViewModel @Inject constructor(
    private val assignmentRepository: AssignmentRepository,
    private val authRepository: AuthRepository
) : ViewModel() {

    private val _uiState = MutableStateFlow<DriverTripsState>(DriverTripsState.Loading)
    val uiState: StateFlow<DriverTripsState> = _uiState

    private val _driverOnlineStatus = MutableStateFlow(true)
    val driverOnlineStatus: StateFlow<Boolean> = _driverOnlineStatus

    private val _operationStatus = MutableStateFlow<String?>(null)
    val operationStatus: StateFlow<String?> = _operationStatus

    init {
        fetchTrips()
    }

    fun fetchTrips() {
        viewModelScope.launch {
            _uiState.value = DriverTripsState.Loading
            val assignedRes = assignmentRepository.getDriverAssignedOrders()
            val completedRes = assignmentRepository.getDriverCompletedTrips()

            if (assignedRes.isSuccess) {
                _uiState.value = DriverTripsState.Success(
                    assignedTrips = assignedRes.getOrDefault(emptyList()),
                    completedTrips = completedRes.getOrDefault(emptyList())
                )
            } else {
                _uiState.value = DriverTripsState.Error(assignedRes.exceptionOrNull()?.message ?: "Failed to fetch trips")
            }
        }
    }

    fun toggleOnlineStatus(isOnline: Boolean) {
        _driverOnlineStatus.value = isOnline
        val statusStr = if (isOnline) "ONLINE" else "OFFLINE"
        viewModelScope.launch {
            authRepository.updateDriverStatus(statusStr)
        }
    }

    fun startTrip(orderId: Int, startKm: Int, speedometerImg: File) {
        viewModelScope.launch {
            assignmentRepository.startTrip(orderId, startKm, speedometerImg)
                .onSuccess {
                    _operationStatus.value = "Trip started successfully!"
                    fetchTrips()
                }
                .onFailure {
                    _operationStatus.value = it.message ?: "Failed to start trip"
                }
        }
    }

    fun endTrip(
        orderId: Int, endKm: Int, tollUpdate: Boolean, updatedToll: Int?, waitingTime: Int?, closeSpeedometerImg: File
    ) {
        viewModelScope.launch {
            assignmentRepository.endTrip(orderId, endKm, tollUpdate, updatedToll, waitingTime, closeSpeedometerImg)
                .onSuccess {
                    _operationStatus.value = "Trip completed successfully!"
                    fetchTrips()
                }
                .onFailure {
                    _operationStatus.value = it.message ?: "Failed to complete trip"
                }
        }
    }

    fun resetOperationStatus() {
        _operationStatus.value = null
    }
}
