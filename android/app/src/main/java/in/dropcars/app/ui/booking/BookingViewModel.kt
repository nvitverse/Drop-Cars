package `in`.dropcars.app.ui.booking

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import dagger.hilt.android.lifecycle.HiltViewModel
import `in`.dropcars.app.data.repository.BookingRepository
import `in`.dropcars.app.model.*
import `in`.dropcars.app.utils.Resource
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.launch
import javax.inject.Inject

@HiltViewModel
class BookingViewModel @Inject constructor(private val repo: BookingRepository) : ViewModel() {

    private val _estimateState = MutableStateFlow<Resource<EstimateResponse>>(Resource.Loading)
    val estimateState: StateFlow<Resource<EstimateResponse>> = _estimateState

    private val _bookingState = MutableStateFlow<Resource<Booking>>(Resource.Loading)
    val bookingState: StateFlow<Resource<Booking>> = _bookingState

    var paymentMethod = "cash"

    fun estimate(pickup: LocationPoint, dest: LocationPoint, vehicleType: String, tripType: String, hours: Int? = null, promo: String? = null) {
        viewModelScope.launch {
            _estimateState.value = Resource.Loading
            _estimateState.value = repo.estimate(
                EstimateRequest(pickup.lat, pickup.lng, dest.lat, dest.lng, vehicleType, tripType, hours, promo)
            )
        }
    }

    fun createBooking(
        pickup: LocationPoint, dest: LocationPoint,
        vehicleType: String, tripType: String,
        pickupDate: String, promoCode: String?,
        returnDate: String? = null, hoursBooked: Int? = null,
    ) {
        viewModelScope.launch {
            _bookingState.value = Resource.Loading
            _bookingState.value = repo.create(
                CreateBookingRequest(pickup, dest, vehicleType, tripType, pickupDate, returnDate, hoursBooked, promoCode, paymentMethod)
            )
        }
    }
}
