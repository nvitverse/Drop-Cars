package in.dropcars.app.ui.vendor.auth

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import dagger.hilt.android.lifecycle.HiltViewModel
import in.dropcars.app.data.repository.AuthRepository
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.launch
import java.io.File
import javax.inject.Inject

sealed interface AuthUiState {
    object Idle : AuthUiState
    object Loading : AuthUiState
    data class Success(val message: String) : AuthUiState
    data class Error(val message: String) : AuthUiState
}

@HiltViewModel
class VendorAuthViewModel @Inject constructor(
    private val authRepository: AuthRepository
) : ViewModel() {

    private val _uiState = MutableStateFlow<AuthUiState>(AuthUiState.Idle)
    val uiState: StateFlow<AuthUiState> = _uiState

    fun signin(phone: String, pass: String) {
        if (phone.length < 10 || pass.isEmpty()) {
            _uiState.value = AuthUiState.Error("Please enter valid 10-digit phone and password")
            return
        }

        viewModelScope.launch {
            _uiState.value = AuthUiState.Loading
            authRepository.vendorSignin(phone, pass)
                .onSuccess {
                    _uiState.value = AuthUiState.Success("Vendor login successful!")
                }
                .onFailure {
                    _uiState.value = AuthUiState.Error(it.message ?: "Login failed. Check credentials.")
                }
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
        gpay: String,
        aadharImage: File?
    ) {
        if (fullName.isEmpty() || phone.length < 10 || pass.isEmpty()) {
            _uiState.value = AuthUiState.Error("Please fill all required fields correctly")
            return
        }

        viewModelScope.launch {
            _uiState.value = AuthUiState.Loading
            authRepository.vendorSignup(fullName, phone, pass, address, city, pincode, aadhar, gpay, aadharImage)
                .onSuccess {
                    _uiState.value = AuthUiState.Success("Vendor registration successful!")
                }
                .onFailure {
                    _uiState.value = AuthUiState.Error(it.message ?: "Registration failed")
                }
        }
    }
}
