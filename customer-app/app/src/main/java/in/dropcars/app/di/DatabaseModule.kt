package in.dropcars.app.di

import android.content.Context
import androidx.room.Room
import dagger.Module
import dagger.Provides
import dagger.hilt.InstallIn
import dagger.hilt.android.qualifiers.ApplicationContext
import dagger.hilt.components.SingletonComponent
import in.dropcars.app.data.local.DropCarsDatabase
import in.dropcars.app.data.local.dao.DraftBookingDao
import in.dropcars.app.data.local.dao.FareRouteDao
import in.dropcars.app.data.local.dao.PendingOrderDao
import javax.inject.Singleton

@Module
@InstallIn(SingletonComponent::class)
object DatabaseModule {

    @Provides
    @Singleton
    fun provideDatabase(@ApplicationContext context: Context): DropCarsDatabase {
        return Room.databaseBuilder(
            context,
            DropCarsDatabase::class.java,
            "dropcars_db"
        ).fallbackToDestructiveMigration().build()
    }

    @Provides
    fun provideFareRouteDao(db: DropCarsDatabase): FareRouteDao = db.fareRouteDao()

    @Provides
    fun provideDraftBookingDao(db: DropCarsDatabase): DraftBookingDao = db.draftBookingDao()

    @Provides
    fun providePendingOrderDao(db: DropCarsDatabase): PendingOrderDao = db.pendingOrderDao()
}
