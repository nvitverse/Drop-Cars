package `in`.dropcars.app.ui.ride

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.google.android.gms.maps.model.LatLng
import dagger.hilt.android.lifecycle.HiltViewModel
import `in`.dropcars.app.BuildConfig
import `in`.dropcars.app.data.repository.BookingRepository
import `in`.dropcars.app.model.Booking
import `in`.dropcars.app.utils.PrefsManager
import `in`.dropcars.app.utils.Resource
import io.socket.client.IO
import io.socket.client.Socket
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.launch
import org.json.JSONObject
import javax.inject.Inject

@HiltViewModel
class RideViewModel @Inject constructor(
    private val repo: BookingRepository,
    private val prefs: PrefsManager,
) : ViewModel() {

    private val _booking = MutableStateFlow<Resource<Booking>>(Resource.Loading)
    val booking: StateFlow<Resource<Booking>> = _booking

    private val _driverLocation = MutableStateFlow<LatLng?>(null)
    val driverLocation: StateFlow<LatLng?> = _driverLocation

    private val _cancelState = MutableStateFlow<Resource<Booking>>(Resource.Loading)
    val cancelState: StateFlow<Resource<Booking>> = _cancelState

    private var socket: Socket? = null

    fun loadBooking(bookingId: String) {
        viewModelScope.launch {
            _booking.value = Resource.Loading
            _booking.value = repo.getBooking(bookingId)
            connectSocket(bookingId)
        }
    }

    private fun connectSocket(bookingId: String) {
        try {
            val token = prefs.getToken() ?: return
            val opts = IO.Options().apply { auth = mapOf("token" to token) }
            socket = IO.socket(BuildConfig.API_BASE_URL, opts)
            socket?.on(Socket.EVENT_CONNECT) {
                socket?.emit("subscribe:booking", JSONObject().put("bookingId", bookingId))
            }
            socket?.on("driver:location") { args ->
                val data = args[0] as? JSONObject ?: return@on
                val lat = data.getDouble("lat")
                val lng = data.getDouble("lng")
                _driverLocation.value = LatLng(lat, lng)
            }
            socket?.on("booking:accepted") { _ -> loadBooking(bookingId) }
            socket?.on("booking:started") { _ -> loadBooking(bookingId) }
            socket?.on("booking:completed") { _ -> loadBooking(bookingId) }
            socket?.on("booking:cancelled") { _ -> loadBooking(bookingId) }
            socket?.connect()
        } catch (_: Exception) {}
    }

    fun cancelRide(bookingId: String, reason: String) {
        viewModelScope.launch {
            _cancelState.value = Resource.Loading
            _cancelState.value = repo.cancel(bookingId, reason)
        }
    }

    fun disconnectSocket() { socket?.disconnect(); socket = null }

    override fun onCleared() { disconnectSocket(); super.onCleared() }
}
