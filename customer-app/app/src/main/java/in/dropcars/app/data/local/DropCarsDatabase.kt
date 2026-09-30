package in.dropcars.app.data.local

import androidx.room.Database
import androidx.room.RoomDatabase
import in.dropcars.app.data.local.dao.DraftBookingDao
import in.dropcars.app.data.local.dao.FareRouteDao
import in.dropcars.app.data.local.dao.PendingOrderDao
import in.dropcars.app.data.local.entity.CachedFareRoute
import in.dropcars.app.data.local.entity.CachedPendingOrder
import in.dropcars.app.data.local.entity.DraftBooking

@Database(
    entities = [
        CachedFareRoute::class,
        DraftBooking::class,
        CachedPendingOrder::class
    ],
    version = 1,
    exportSchema = false
)
abstract class DropCarsDatabase : RoomDatabase() {
    abstract fun fareRouteDao(): FareRouteDao
    abstract fun draftBookingDao(): DraftBookingDao
    abstract fun pendingOrderDao(): PendingOrderDao
}
