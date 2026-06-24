package `in`.dropcars.app.utils

sealed class Resource<out T> {
    data class Success<T>(val data: T) : Resource<T>()
    data class Error(val message: String) : Resource<Nothing>()
    object Loading : Resource<Nothing>()
}

suspend fun <T> safeApiCall(call: suspend () -> retrofit2.Response<T>): Resource<T> {
    return try {
        val response = call()
        if (response.isSuccessful) {
            Resource.Success(response.body()!!)
        } else {
            val msg = response.errorBody()?.string() ?: "Unknown error (${response.code()})"
            Resource.Error(msg)
        }
    } catch (e: Exception) {
        Resource.Error(e.localizedMessage ?: "Network error")
    }
}
