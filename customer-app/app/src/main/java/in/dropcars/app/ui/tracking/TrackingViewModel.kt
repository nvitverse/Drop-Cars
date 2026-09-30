package in.dropcars.app.ui.tracking

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import dagger.hilt.android.lifecycle.HiltViewModel
import in.dropcars.app.data.model.LiveTrackingResponse
import in.dropcars.app.data.repository.TrackingRepository
import kotlinx.coroutines.Job
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.isActive
import kotlinx.coroutines.launch
import javax.inject.Inject

sealed interface TrackingUiState {
    object Idle : TrackingUiState
    object Loading : TrackingUiState
    data class Success(val tracking: LiveTrackingResponse) : TrackingUiState
    data class Error(val message: String) : TrackingUiState
}

@HiltViewModel
class TrackingViewModel @Inject constructor(
    private val trackingRepository: TrackingRepository
) : ViewModel() {

    private val _uiState = MutableStateFlow<TrackingUiState>(TrackingUiState.Idle)
    val uiState: StateFlow<TrackingUiState> = _uiState

    private var pollingJob: Job? = null
    private var isScreenActive = false

    fun onResumeTracking(bookingId: String) {
        isScreenActive = true
        startPolling(bookingId)
    }

    fun onPauseTracking() {
        isScreenActive = false
        stopPolling()
    }

    private fun startPolling(bookingId: String) {
        stopPolling()
        pollingJob = viewModelScope.launch {
            while (isActive && isScreenActive) {
                trackingRepository.getLiveLocation(bookingId)
                    .onSuccess { res ->
                        _uiState.value = TrackingUiState.Success(res)
                    }
                    .onFailure {
                        _uiState.value = TrackingUiState.Error(it.message ?: "Failed to fetch live location")
                    }
                delay(5000) // 5-second lightweight polling
            }
        }
    }

    private fun stopPolling() {
        pollingJob?.cancel()
        pollingJob = null
    }

    override fun onCleared() {
        super.onCleared()
        stopPolling()
    }
}
