package in.dropcars.app.ui.driver.auth

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import dagger.hilt.android.lifecycle.HiltViewModel
import in.dropcars.app.data.repository.AuthRepository
import in.dropcars.app.ui.vendor.auth.AuthUiState
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.launch
import javax.inject.Inject

@HiltViewModel
class DriverAuthViewModel @Inject constructor(
    private val authRepository: AuthRepository
) : ViewModel() {

    private val _uiState = MutableStateFlow<AuthUiState>(AuthUiState.Idle)
    val uiState: StateFlow<AuthUiState> = _uiState

    fun signin(phone: String, pass: String) {
        if (phone.length < 10 || pass.isEmpty()) {
            _uiState.value = AuthUiState.Error("Please enter valid phone and password")
            return
        }

        viewModelScope.launch {
            _uiState.value = AuthUiState.Loading
            authRepository.driverSignin(phone, pass)
                .onSuccess { _uiState.value = AuthUiState.Success("Driver login successful!") }
                .onFailure { _uiState.value = AuthUiState.Error(it.message ?: "Driver login failed") }
        }
    }
}
