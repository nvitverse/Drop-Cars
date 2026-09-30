package in.dropcars.app.data.local.entity

import androidx.room.Entity
import androidx.room.PrimaryKey

@Entity(tableName = "pending_orders_cache")
data class CachedPendingOrder(
    @PrimaryKey val orderId: Int,
    val orderJson: String,               // Full order as JSON
    val fetchedAt: Long = System.currentTimeMillis()
)
