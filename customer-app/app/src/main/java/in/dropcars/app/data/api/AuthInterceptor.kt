package in.dropcars.app.data.api

import in.dropcars.app.data.local.AuthTokenManager
import okhttp3.Interceptor
import okhttp3.Response
import javax.inject.Inject
import javax.inject.Singleton

@Singleton
class AuthInterceptor @Inject constructor(
    private val authTokenManager: AuthTokenManager
) : Interceptor {

    override fun intercept(chain: Interceptor.Chain): Response {
        val originalRequest = chain.request()
        val token = authTokenManager.getToken()

        val requestBuilder = originalRequest.newBuilder()

        if (!token.isNull SanskritOrEmpty()) {
            requestBuilder.header("Authorization", "Bearer $token")
        }

        return chain.proceed(requestBuilder.build())
    }

    private fun String?.isNullSanskritOrEmpty(): Boolean {
        return this.isNullOrEmpty()
    }
}
