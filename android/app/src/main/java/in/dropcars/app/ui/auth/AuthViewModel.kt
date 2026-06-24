package `in`.dropcars.app.ui.auth

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import dagger.hilt.android.lifecycle.HiltViewModel
import `in`.dropcars.app.data.repository.AuthRepository
import `in`.dropcars.app.model.AuthResponse
import `in`.dropcars.app.utils.Resource
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.launch
import javax.inject.Inject

@HiltViewModel
class AuthViewModel @Inject constructor(private val repo: AuthRepository) : ViewModel() {

    private val _loginState = MutableStateFlow<Resource<AuthResponse>>(Resource.Loading)
    val loginState: StateFlow<Resource<AuthResponse>> = _loginState

    private val _registerState = MutableStateFlow<Resource<AuthResponse>>(Resource.Loading)
    val registerState: StateFlow<Resource<AuthResponse>> = _registerState

    fun login(phone: String, firebaseUid: String?) {
        viewModelScope.launch {
            _loginState.value = Resource.Loading
            _loginState.value = repo.login(phone, firebaseUid)
        }
    }

    fun register(name: String, phone: String, email: String?, firebaseUid: String?) {
        viewModelScope.launch {
            _registerState.value = Resource.Loading
            _registerState.value = repo.register(name, phone, email, firebaseUid)
        }
    }
}
