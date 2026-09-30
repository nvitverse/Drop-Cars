package in.dropcars.app.data.local.dao

import androidx.room.*
import in.dropcars.app.data.local.entity.DraftBooking

@Dao
interface DraftBookingDao {
    @Query("SELECT * FROM draft_booking ORDER BY savedAt DESC")
    suspend fun getAllDrafts(): List<DraftBooking>

    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun saveDraft(draft: DraftBooking)

    @Delete
    suspend fun deleteDraft(draft: DraftBooking)

    @Query("DELETE FROM draft_booking WHERE id = :id")
    suspend fun deleteDraftById(id: Int)
}
