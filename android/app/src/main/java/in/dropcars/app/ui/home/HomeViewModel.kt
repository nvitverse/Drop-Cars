package `in`.dropcars.app.ui.home

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import dagger.hilt.android.lifecycle.HiltViewModel
import `in`.dropcars.app.data.repository.BookingRepository
import `in`.dropcars.app.model.Pricing
import `in`.dropcars.app.utils.Resource
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.launch
import javax.inject.Inject

@HiltViewModel
class HomeViewModel @Inject constructor(private val bookingRepo: BookingRepository) : ViewModel() {

    private val _pricing = MutableStateFlow<List<Pricing>>(emptyList())
    val pricing: StateFlow<List<Pricing>> = _pricing

    val selectedVehicle = MutableStateFlow<Pricing?>(null)
    val tripType = MutableStateFlow("one-way")
    val currentLat = MutableStateFlow(0.0)
    val currentLng = MutableStateFlow(0.0)

    init { loadPricing() }

    private fun loadPricing() {
        viewModelScope.launch {
            val res = bookingRepo.getPricing()
            if (res is Resource.Success) _pricing.value = res.data
        }
    }

    fun setCurrentLocation(lat: Double, lng: Double) {
        currentLat.value = lat; currentLng.value = lng
    }

    fun setTripType(type: String) { tripType.value = type }
    fun setSelectedVehicle(p: Pricing) { selectedVehicle.value = p }
}
