package in.dropcars.app.data.local.dao

import androidx.room.*
import in.dropcars.app.data.local.entity.CachedFareRoute

@Dao
interface FareRouteDao {
    @Query("SELECT * FROM cached_fare_routes WHERE routeKey = :routeKey AND expiresAt > :now LIMIT 1")
    suspend fun getValidRoute(routeKey: String, now: Long = System.currentTimeMillis()): CachedFareRoute?

    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun insertRoute(route: CachedFareRoute)

    @Query("DELETE FROM cached_fare_routes WHERE expiresAt <= :now")
    suspend fun deleteExpiredRoutes(now: Long = System.currentTimeMillis())
}
