package in.dropcars.app.data.repository

import in.dropcars.app.data.api.DropCarsApi
import in.dropcars.app.data.model.DriverLocationUpdateRequest
import in.dropcars.app.data.model.LiveTrackingResponse
import javax.inject.Inject
import javax.inject.Singleton

@Singleton
class TrackingRepository @Inject constructor(
    private val api: DropCarsApi
) {
    suspend fun pushDriverLocation(
        bookingId: String,
        latitude: Double,
        longitude: Double,
        bearing: Float,
        speedKmh: Float
    ): Result<Map<String, Any>> {
        return runCatching {
            api.updateDriverLocation(
                DriverLocationUpdateRequest(bookingId, latitude, longitude, bearing, speedKmh)
            )
        }
    }

    suspend fun getLiveLocation(bookingId: String): Result<LiveTrackingResponse> {
        return runCatching {
            api.getLiveLocation(bookingId)
        }
    }
}
