package in.dropcars.app.data.local

import android.content.Context
import android.content.SharedPreferences
import androidx.security.crypto.EncryptedSharedPreferences
import androidx.security.crypto.MasterKey
import in.dropcars.app.data.model.UserRole
import javax.inject.Inject
import javax.inject.Singleton

@Singleton
class AuthTokenManager @Inject constructor(
    private val context: Context
) {
    private val prefs: SharedPreferences by lazy {
        try {
            val masterKey = MasterKey.Builder(context)
                .setKeyScheme(MasterKey.KeyScheme.AES256_GCM)
                .build()

            EncryptedSharedPreferences.create(
                context,
                "dropcars_encrypted_prefs",
                masterKey,
                EncryptedSharedPreferences.PrefKeyEncryptionScheme.AES256_SIV,
                EncryptedSharedPreferences.PrefValueEncryptionScheme.AES256_GCM
            )
        } catch (e: Exception) {
            // Fallback to standard SharedPreferences if master key error occurs
            context.getSharedPreferences("dropcars_fallback_prefs", Context.MODE_PRIVATE)
        }
    }

    fun saveToken(token: String) {
        prefs.edit().putString(KEY_JWT, token).apply()
    }

    fun getToken(): String? {
        return prefs.getString(KEY_JWT, null)
    }

    fun saveRole(role: UserRole) {
        prefs.edit().putString(KEY_ROLE, role.value).apply()
    }

    fun getRole(): UserRole {
        val roleStr = prefs.getString(KEY_ROLE, UserRole.NONE.value) ?: UserRole.NONE.value
        return UserRole.entries.find { it.value == roleStr } ?: UserRole.NONE
    }

    fun saveUserInfo(userId: String, name: String, phone: String) {
        prefs.edit()
            .putString(KEY_USER_ID, userId)
            .putString(KEY_USER_NAME, name)
            .putString(KEY_USER_PHONE, phone)
            .apply()
    }

    fun getUserId(): String? = prefs.getString(KEY_USER_ID, null)
    fun getUserName(): String? = prefs.getString(KEY_USER_NAME, null)
    fun getUserPhone(): String? = prefs.getString(KEY_USER_PHONE, null)

    fun clearAuth() {
        prefs.edit().clear().apply()
    }

    companion object {
        private const val KEY_JWT = "dropcars_jwt"
        private const val KEY_ROLE = "dropcars_role"
        private const val KEY_USER_ID = "dropcars_user_id"
        private const val KEY_USER_NAME = "dropcars_user_name"
        private const val KEY_USER_PHONE = "dropcars_user_phone"
    }
}
