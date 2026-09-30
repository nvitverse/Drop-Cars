package in.dropcars.app.data.local.dao

import androidx.room.*
import in.dropcars.app.data.local.entity.CachedPendingOrder

@Dao
interface PendingOrderDao {
    @Query("SELECT * FROM pending_orders_cache ORDER BY fetchedAt DESC")
    suspend fun getAllPendingOrders(): List<CachedPendingOrder>

    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun insertOrders(orders: List<CachedPendingOrder>)

    @Query("DELETE FROM pending_orders_cache")
    suspend fun clearPendingOrders()
}
