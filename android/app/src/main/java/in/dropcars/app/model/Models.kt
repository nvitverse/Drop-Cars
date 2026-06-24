package `in`.dropcars.app.model

import com.google.gson.annotations.SerializedName

// --- Auth ---
data class User(
    @SerializedName("_id") val id: String,
    val name: String,
    val phone: String,
    val email: String?,
    val role: String,
    val profilePhoto: String?,
    val totalRides: Int,
    val walletBalance: Double,
    val isBlocked: Boolean,
)

data class Driver(
    @SerializedName("_id") val id: String,
    val userId: User?,
    val vehicleType: String,
    val vehicleName: String,
    val plateNumber: String,
    val vehicleColor: String?,
    val rating: Double,
    val totalRides: Int,
    val isOnline: Boolean,
    val isApproved: Boolean,
)

data class Pricing(
    @SerializedName("_id") val id: String,
    val vehicleType: String,
    val vehicleLabel: String,
    val vehicleExamples: String?,
    val capacity: Int,
    val baseFare: Double,
    val perKm: Double,
    val perMin: Double,
    val minimumFare: Double,
    val surgeFactor: Double,
    val airportSurcharge: Double,
    val hourlyPackages: List<HourlyPackage>,
)

data class HourlyPackage(val hours: Int, val km: Int, val price: Double)

data class LocationPoint(val address: String, val lat: Double, val lng: Double)

data class Fare(
    val base: Double,
    val perKmCharge: Double,
    val perMinCharge: Double,
    val airportSurcharge: Double,
    val discount: Double,
    val total: Double,
)

data class Booking(
    @SerializedName("_id") val id: String,
    val userId: String,
    val driverId: Driver?,
    val pickup: LocationPoint,
    val destination: LocationPoint,
    val vehicleType: String,
    val tripType: String,
    val status: String,
    val pickupDate: String,
    val returnDate: String?,
    val distanceKm: Double?,
    val durationMin: Double?,
    val fare: Fare,
    val paymentMethod: String,
    val paymentStatus: String,
    val rating: Int?,
    val otp: String?,
    val createdAt: String,
)

// --- Requests ---
data class RegisterRequest(val name: String, val phone: String, val email: String?, val firebaseUid: String?)
data class LoginRequest(val phone: String, val firebaseUid: String?)
data class UpdateProfileRequest(val name: String, val email: String?)
data class FcmTokenRequest(val fcmToken: String)
data class CancelRequest(val reason: String?)
data class RateRequest(val rating: Int, val review: String?)
data class CreateOrderRequest(val bookingId: String)
data class VerifyPaymentRequest(
    val razorpay_order_id: String,
    val razorpay_payment_id: String,
    val razorpay_signature: String,
    val bookingId: String,
)

data class EstimateRequest(
    val pickupLat: Double,
    val pickupLng: Double,
    val destLat: Double,
    val destLng: Double,
    val vehicleType: String,
    val tripType: String,
    val hoursBooked: Int?,
    val promoCode: String?,
)

data class CreateBookingRequest(
    val pickup: LocationPoint,
    val destination: LocationPoint,
    val vehicleType: String,
    val tripType: String,
    val pickupDate: String,
    val returnDate: String?,
    val hoursBooked: Int?,
    val promoCode: String?,
    val paymentMethod: String,
)

// --- Responses ---
data class AuthResponse(val token: String, val user: User)
data class MessageResponse(val message: String)
data class BookingsResponse(val bookings: List<Booking>, val total: Int, val page: Int)
data class EstimateResponse(
    val distanceKm: Double,
    val durationMin: Double,
    val distanceText: String,
    val durationText: String,
    val polyline: String,
    val fare: Fare,
)
data class RazorpayOrderResponse(val orderId: String, val amount: Int, val currency: String, val key: String)
data class VerifyPaymentResponse(val success: Boolean, val booking: Booking)
