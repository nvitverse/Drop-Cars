package in.dropcars.app.ui.admin.auth

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import dagger.hilt.android.lifecycle.HiltViewModel
import in.dropcars.app.data.api.DropCarsApi
import in.dropcars.app.data.local.AuthTokenManager
import in.dropcars.app.data.model.AdminSigninRequest
import in.dropcars.app.data.model.UserRole
import in.dropcars.app.ui.vendor.auth.AuthUiState
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.launch
import javax.inject.Inject

@HiltViewModel
class AdminAuthViewModel @Inject constructor(
    private val api: DropCarsApi,
    private val tokenManager: AuthTokenManager
) : ViewModel() {

    private val _uiState = MutableStateFlow<AuthUiState>(AuthUiState.Idle)
    val uiState: StateFlow<AuthUiState> = _uiState

    fun signin(username: String, pass: String) {
        if (username.isEmpty() || pass.isEmpty()) {
            _uiState.value = AuthUiState.Error("Please enter admin username and password")
            return
        }

        viewModelScope.launch {
            _uiState.value = AuthUiState.Loading
            runCatching {
                val response = api.adminSignin(AdminSigninRequest(username, pass))
                tokenManager.saveToken(response.access_token)
                tokenManager.saveRole(UserRole.ADMIN)
                response
            }.onSuccess {
                _uiState.value = AuthUiState.Success("Admin login successful!")
            }.onFailure {
                _uiState.value = AuthUiState.Error(it.message ?: "Admin signin failed")
            }
        }
    }
}
