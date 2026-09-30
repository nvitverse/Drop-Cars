package in.dropcars.app.data.api

import retrofit2.http.*

interface PhpApi {
    @GET("api/route-distance.php")
    suspend fun getRouteDistance(
        @Query("from") fromCity: String,
        @Query("to") toCity: String
    ): Map<String, Any>

    @GET("api/geocode.php")
    suspend fun geocodeCity(
        @Query("city") city: String
    ): Map<String, Any>

    @GET("api/get-site-settings.php")
    suspend fun getSiteSettings(): Map<String, Any>

    @GET("api/reviews.php")
    suspend fun getReviews(): List<Map<String, Any>>

    @POST("api/validate-coupon.php")
    suspend fun validateCoupon(
        @Body body: Map<String, String>
    ): Map<String, Any>
}
