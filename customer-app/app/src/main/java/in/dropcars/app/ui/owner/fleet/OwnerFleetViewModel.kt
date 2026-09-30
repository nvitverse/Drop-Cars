package in.dropcars.app.ui.owner.fleet

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import dagger.hilt.android.lifecycle.HiltViewModel
import in.dropcars.app.data.model.CarDetails
import in.dropcars.app.data.repository.AuthRepository
import in.dropcars.app.data.repository.FleetRepository
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.launch
import java.io.File
import javax.inject.Inject

sealed interface FleetUiState {
    object Loading : FleetUiState
    data class Success(val cars: List<CarDetails>) : FleetUiState
    data class Error(val message: String) : FleetUiState
}

@HiltViewModel
class OwnerFleetViewModel @Inject constructor(
    private val fleetRepository: FleetRepository,
    private val authRepository: AuthRepository
) : ViewModel() {

    private val _uiState = MutableStateFlow<FleetUiState>(FleetUiState.Loading)
    val uiState: StateFlow<FleetUiState> = _uiState

    private val _operationStatus = MutableStateFlow<String?>(null)
    val operationStatus: StateFlow<String?> = _operationStatus

    init {
        fetchFleet()
    }

    fun fetchFleet() {
        viewModelScope.launch {
            _uiState.value = FleetUiState.Loading
            fleetRepository.getCarDetailsAll()
                .onSuccess { _uiState.value = FleetUiState.Success(it) }
                .onFailure { _uiState.value = FleetUiState.Error(it.message ?: "Failed to load fleet") }
        }
    }

    fun addCar(
        carName: String, carType: String, carNumber: String, year: String?,
        rcFront: File, rcBack: File, insurance: File, fc: File, carImg: File, permit: File
    ) {
        val ownerId = authRepository.getUserId() ?: ""
        viewModelScope.launch {
            fleetRepository.addCarDetails(
                carName, carType, carNumber, year, ownerId, rcFront, rcBack, insurance, fc, carImg, permit
            ).onSuccess {
                _operationStatus.value = "Car added successfully!"
                fetchFleet()
            }.onFailure {
                _operationStatus.value = it.message ?: "Car addition failed"
            }
        }
    }

    fun addDriver(
        name: String, phone: String, pass: String, addr: String, city: String, pincode: String, licence: String, licenceImg: File
    ) {
        val ownerId = authRepository.getUserId() ?: ""
        viewModelScope.launch {
            fleetRepository.registerDriver(
                name, phone, pass, addr, city, pincode, licence, ownerId, null, licenceImg
            ).onSuccess {
                _operationStatus.value = "Driver registered successfully!"
            }.onFailure {
                _operationStatus.value = it.message ?: "Driver registration failed"
            }
        }
    }

    fun resetOperationStatus() {
        _operationStatus.value = null
    }
}
