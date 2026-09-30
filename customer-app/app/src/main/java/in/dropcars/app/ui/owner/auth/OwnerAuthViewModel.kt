package in.dropcars.app.ui.owner.auth

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import dagger.hilt.android.lifecycle.HiltViewModel
import in.dropcars.app.data.repository.AuthRepository
import in.dropcars.app.ui.vendor.auth.AuthUiState
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.launch
import java.io.File
import javax.inject.Inject

@HiltViewModel
class OwnerAuthViewModel @Inject constructor(
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
            authRepository.ownerSignin(phone, pass)
                .onSuccess { _uiState.value = AuthUiState.Success("Vehicle Owner login successful!") }
                .onFailure { _uiState.value = AuthUiState.Error(it.message ?: "Login failed") }
        }
    }

    fun signup(
        fullName: String,
        phone: String,
        pass: String,
        address: String,
        city: String,
        pincode: String,
        aadhar: String,
        gpay: String?,
        secondary: String?,
        aadharFrontImg: File?
    ) {
        if (fullName.isEmpty() || phone.length < 10 || pass.isEmpty()) {
            _uiState.value = AuthUiState.Error("Please fill all required fields")
            return
        }

        viewModelScope.launch {
            _uiState.value = AuthUiState.Loading
            authRepository.ownerSignup(
                fullName, phone, pass, address, city, pincode, aadhar, gpay, secondary, aadharFrontImg
            ).onSuccess { _uiState.value = AuthUiState.Success("Registration successful!") }
                .onFailure { _uiState.value = AuthUiState.Error(it.message ?: "Registration failed") }
        }
    }
}
