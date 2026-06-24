package `in`.dropcars.app.ui.history

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import dagger.hilt.android.lifecycle.HiltViewModel
import `in`.dropcars.app.data.repository.BookingRepository
import `in`.dropcars.app.model.BookingsResponse
import `in`.dropcars.app.utils.Resource
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.launch
import javax.inject.Inject

@HiltViewModel
class HistoryViewModel @Inject constructor(private val repo: BookingRepository) : ViewModel() {

    private val _bookings = MutableStateFlow<Resource<BookingsResponse>>(Resource.Loading)
    val bookings: StateFlow<Resource<BookingsResponse>> = _bookings

    init { load() }

    fun load(page: Int = 1) {
        viewModelScope.launch {
            _bookings.value = Resource.Loading
            _bookings.value = repo.myBookings(page)
        }
    }
}
