package `in`.dropcars.app.data.repository

import `in`.dropcars.app.data.api.ApiService
import `in`.dropcars.app.model.*
import `in`.dropcars.app.utils.Resource
import `in`.dropcars.app.utils.safeApiCall
import javax.inject.Inject
import javax.inject.Singleton

@Singleton
class BookingRepository @Inject constructor(private val api: ApiService) {

    suspend fun estimate(req: EstimateRequest): Resource<EstimateResponse> =
        safeApiCall { api.estimateFare(req) }

    suspend fun create(req: CreateBookingRequest): Resource<Booking> =
        safeApiCall { api.createBooking(req) }

    suspend fun myBookings(page: Int = 1): Resource<BookingsResponse> =
        safeApiCall { api.myBookings(page) }

    suspend fun getBooking(id: String): Resource<Booking> =
        safeApiCall { api.getBooking(id) }

    suspend fun cancel(id: String, reason: String?): Resource<Booking> =
        safeApiCall { api.cancelBooking(id, CancelRequest(reason)) }

    suspend fun rate(id: String, rating: Int, review: String?): Resource<Booking> =
        safeApiCall { api.rateBooking(id, RateRequest(rating, review)) }

    suspend fun getPricing(): Resource<List<Pricing>> =
        safeApiCall { api.getPricing() }

    suspend fun nearbyDrivers(lat: Double, lng: Double, vehicleType: String?): Resource<List<Driver>> =
        safeApiCall { api.nearbyDrivers(lat, lng, vehicleType) }

    suspend fun createOrder(bookingId: String): Resource<RazorpayOrderResponse> =
        safeApiCall { api.createOrder(CreateOrderRequest(bookingId)) }

    suspend fun verifyPayment(req: VerifyPaymentRequest): Resource<VerifyPaymentResponse> =
        safeApiCall { api.verifyPayment(req) }
}
