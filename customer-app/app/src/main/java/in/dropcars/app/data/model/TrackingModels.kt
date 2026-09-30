package in.dropcars.app.data.model

data class DriverLocationUpdateRequest(
    val booking_id: String,
    val latitude: Double,
    val longitude: Double,
    val bearing: Float = 0f,
    val speed_kmh: Float = 0f
)

data class LiveTrackingResponse(
    val tracking_enabled: Boolean = true,
    val status_message: String = "Live Driver Location Active",
    val driver_latitude: Double? = null,
    val driver_longitude: Double? = null,
    val bearing: Float? = 0f,
    val eta_minutes: Int? = null,
    val distance_remaining_km: Double? = null
)
