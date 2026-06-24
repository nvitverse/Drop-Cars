package `in`.dropcars.app.ui.ride

import android.os.Bundle
import android.view.LayoutInflater
import android.view.View
import android.view.ViewGroup
import android.widget.Toast
import androidx.fragment.app.Fragment
import androidx.fragment.app.viewModels
import androidx.lifecycle.lifecycleScope
import androidx.navigation.fragment.findNavController
import androidx.navigation.fragment.navArgs
import com.google.android.gms.maps.CameraUpdateFactory
import com.google.android.gms.maps.GoogleMap
import com.google.android.gms.maps.OnMapReadyCallback
import com.google.android.gms.maps.SupportMapFragment
import com.google.android.gms.maps.model.LatLng
import com.google.android.gms.maps.model.MarkerOptions
import dagger.hilt.android.AndroidEntryPoint
import `in`.dropcars.app.R
import `in`.dropcars.app.databinding.FragmentRideBinding
import `in`.dropcars.app.utils.Resource
import kotlinx.coroutines.launch

@AndroidEntryPoint
class RideFragment : Fragment(), OnMapReadyCallback {

    private var _binding: FragmentRideBinding? = null
    private val binding get() = _binding!!
    private val viewModel: RideViewModel by viewModels()
    private lateinit var map: GoogleMap

    override fun onCreateView(inflater: LayoutInflater, container: ViewGroup?, savedInstanceState: Bundle?): View {
        _binding = FragmentRideBinding.inflate(inflater, container, false)
        return binding.root
    }

    override fun onViewCreated(view: View, savedInstanceState: Bundle?) {
        super.onViewCreated(view, savedInstanceState)
        val bookingId = arguments?.getString("bookingId") ?: return

        val mapFragment = childFragmentManager.findFragmentById(R.id.rideMap) as SupportMapFragment
        mapFragment.getMapAsync(this)

        viewModel.loadBooking(bookingId)

        binding.btnCancelRide.setOnClickListener {
            viewModel.cancelRide(bookingId, "User cancelled")
        }

        binding.btnCallDriver.setOnClickListener {
            // open dialer
        }

        observeBooking()
        observeDriverLocation()
        observeCancel()
    }

    override fun onMapReady(googleMap: GoogleMap) {
        map = googleMap
        map.uiSettings.isZoomControlsEnabled = true
    }

    private fun observeBooking() {
        lifecycleScope.launch {
            viewModel.booking.collect { res ->
                if (res is Resource.Success) {
                    val b = res.data
                    binding.tvStatus.text = b.status.replace("-", " ").uppercase()
                    binding.tvPickup.text = b.pickup.address
                    binding.tvDrop.text = b.destination.address
                    binding.tvFare.text = "₹${b.fare.total.toInt()}"
                    binding.tvOtp.text = "OTP: ${b.otp ?: "—"}"
                    b.driverId?.let { d ->
                        binding.cardDriver.visibility = View.VISIBLE
                        binding.tvDriverName.text = d.userId?.name ?: "Driver"
                        binding.tvDriverVehicle.text = "${d.vehicleName} • ${d.plateNumber}"
                        binding.tvDriverRating.text = "⭐ ${d.rating}"
                    }
                    if (b.status == "completed") {
                        findNavController().navigate(R.id.action_ride_to_history)
                    }
                }
            }
        }
    }

    private fun observeDriverLocation() {
        lifecycleScope.launch {
            viewModel.driverLocation.collect { latLng ->
                latLng ?: return@collect
                if (::map.isInitialized) {
                    map.clear()
                    map.addMarker(MarkerOptions().position(latLng).title("Driver"))
                    map.animateCamera(CameraUpdateFactory.newLatLngZoom(latLng, 15f))
                }
            }
        }
    }

    private fun observeCancel() {
        lifecycleScope.launch {
            viewModel.cancelState.collect { res ->
                when (res) {
                    is Resource.Success -> {
                        Toast.makeText(requireContext(), "Ride cancelled", Toast.LENGTH_SHORT).show()
                        findNavController().navigate(R.id.action_ride_to_home)
                    }
                    is Resource.Error -> Toast.makeText(requireContext(), res.message, Toast.LENGTH_SHORT).show()
                    else -> {}
                }
            }
        }
    }

    override fun onDestroyView() {
        super.onDestroyView()
        viewModel.disconnectSocket()
        _binding = null
    }
}
