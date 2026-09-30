package in.dropcars.app.data.local.entity

import androidx.room.Entity
import androidx.room.PrimaryKey

@Entity(tableName = "cached_fare_routes")
data class CachedFareRoute(
    @PrimaryKey val routeKey: String,    // e.g. MD5("Chennai_Bangalore_SEDAN_4_PLUS_1")
    val fromCity: String,
    val toCity: String,
    val carType: String,
    val distanceKm: Double,
    val tripTime: String,
    val customerAmount: Int,
    val driverAmount: Int,
    val fareJson: String,                // Full FareBreakdown serialized as JSON
    val expiresAt: Long                  // System.currentTimeMillis() + 7 days
)
