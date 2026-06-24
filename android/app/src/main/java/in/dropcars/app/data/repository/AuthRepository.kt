package `in`.dropcars.app.data.repository

import `in`.dropcars.app.data.api.ApiService
import `in`.dropcars.app.model.*
import `in`.dropcars.app.utils.PrefsManager
import `in`.dropcars.app.utils.Resource
import `in`.dropcars.app.utils.safeApiCall
import javax.inject.Inject
import javax.inject.Singleton

@Singleton
class AuthRepository @Inject constructor(
    private val api: ApiService,
    private val prefs: PrefsManager,
) {
    suspend fun register(name: String, phone: String, email: String?, firebaseUid: String?): Resource<AuthResponse> {
        val result = safeApiCall { api.register(RegisterRequest(name, phone, email, firebaseUid)) }
        if (result is Resource.Success) prefs.saveToken(result.data.token)
        return result
    }

    suspend fun login(phone: String, firebaseUid: String?): Resource<AuthResponse> {
        val result = safeApiCall { api.login(LoginRequest(phone, firebaseUid)) }
        if (result is Resource.Success) prefs.saveToken(result.data.token)
        return result
    }

    suspend fun me(): Resource<User> = safeApiCall { api.me() }

    suspend fun updateProfile(name: String, email: String?): Resource<User> =
        safeApiCall { api.updateProfile(UpdateProfileRequest(name, email)) }

    suspend fun updateFcmToken(token: String): Resource<MessageResponse> =
        safeApiCall { api.updateFcmToken(FcmTokenRequest(token)) }

    fun logout() = prefs.clearToken()
    fun isLoggedIn() = prefs.isLoggedIn()
}
