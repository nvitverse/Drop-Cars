package `in`.dropcars.app.ui.profile

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import dagger.hilt.android.lifecycle.HiltViewModel
import `in`.dropcars.app.data.repository.AuthRepository
import `in`.dropcars.app.model.User
import `in`.dropcars.app.utils.Resource
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.launch
import javax.inject.Inject

@HiltViewModel
class ProfileViewModel @Inject constructor(private val repo: AuthRepository) : ViewModel() {

    private val _user = MutableStateFlow<Resource<User>>(Resource.Loading)
    val user: StateFlow<Resource<User>> = _user

    private val _updateState = MutableStateFlow<Resource<User>>(Resource.Loading)
    val updateState: StateFlow<Resource<User>> = _updateState

    init { loadProfile() }

    private fun loadProfile() {
        viewModelScope.launch {
            _user.value = Resource.Loading
            _user.value = repo.me()
        }
    }

    fun updateProfile(name: String, email: String?) {
        viewModelScope.launch {
            _updateState.value = Resource.Loading
            _updateState.value = repo.updateProfile(name, email)
        }
    }

    fun logout() = repo.logout()
}
