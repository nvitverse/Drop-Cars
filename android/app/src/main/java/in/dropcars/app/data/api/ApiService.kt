package `in`.dropcars.app.data.api

import `in`.dropcars.app.model.*
import retrofit2.Response
import retrofit2.http.*

interface ApiService {

    // Auth
    @POST("auth/register")
    suspend fun register(@Body body: RegisterRequest): Response<AuthResponse>

    @POST("auth/login")
    suspend fun login(@Body body: LoginRequest): Response<AuthResponse>

    @GET("auth/me")
    suspend fun me(): Response<User>

    @PATCH("auth/profile")
    suspend fun updateProfile(@Body body: UpdateProfileRequest): Response<User>

    @PATCH("auth/fcm-token")
    suspend fun updateFcmToken(@Body body: FcmTokenRequest): Response<MessageResponse>

    // Bookings
    @POST("bookings/estimate")
    suspend fun estimateFare(@Body body: EstimateRequest): Response<EstimateResponse>

    @POST("bookings")
    suspend fun createBooking(@Body body: CreateBookingRequest): Response<Booking>

    @GET("bookings")
    suspend fun myBookings(@Query("page") page: Int = 1, @Query("limit") limit: Int = 20): Response<BookingsResponse>

    @GET("bookings/{id}")
    suspend fun getBooking(@Path("id") id: String): Response<Booking>

    @PATCH("bookings/{id}/cancel")
    suspend fun cancelBooking(@Path("id") id: String, @Body body: CancelRequest): Response<Booking>

    @PATCH("bookings/{id}/rate")
    suspend fun rateBooking(@Path("id") id: String, @Body body: RateRequest): Response<Booking>

    // Pricing
    @GET("pricing")
    suspend fun getPricing(): Response<List<Pricing>>

    // Drivers (nearby)
    @GET("drivers/nearby")
    suspend fun nearbyDrivers(
        @Query("lat") lat: Double,
        @Query("lng") lng: Double,
        @Query("vehicleType") vehicleType: String? = null
    ): Response<List<Driver>>

    // Payments
    @POST("payments/create-order")
    suspend fun createOrder(@Body body: CreateOrderRequest): Response<RazorpayOrderResponse>

    @POST("payments/verify")
    suspend fun verifyPayment(@Body body: VerifyPaymentRequest): Response<VerifyPaymentResponse>
}
