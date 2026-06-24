package `in`.dropcars.app.data.api

import `in`.dropcars.app.utils.PrefsManager
import okhttp3.Interceptor
import okhttp3.Response
import javax.inject.Inject

class AuthInterceptor @Inject constructor(private val prefs: PrefsManager) : Interceptor {
    override fun intercept(chain: Interceptor.Chain): Response {
        val token = prefs.getToken()
        val request = if (token != null) {
            chain.request().newBuilder().addHeader("Authorization", "Bearer $token").build()
        } else chain.request()
        return chain.proceed(request)
    }
}
