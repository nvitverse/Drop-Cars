package in.dropcars.app.data.local.entity

import androidx.room.Entity
import androidx.room.PrimaryKey

@Entity(tableName = "draft_booking")
data class DraftBooking(
    @PrimaryKey(autoGenerate = true) val id: Int = 0,
    val tripType: String,
    val carType: String,
    val pickupLocationsJson: String,     // Map<String,String> as JSON
    val startDateTime: String,
    val customerName: String,
    val customerNumber: String,
    val savedAt: Long = System.currentTimeMillis()
)
