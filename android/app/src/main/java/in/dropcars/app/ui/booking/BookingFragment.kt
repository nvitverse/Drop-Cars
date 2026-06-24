package `in`.dropcars.app.ui.booking

import android.os.Bundle
import android.view.LayoutInflater
import android.view.View
import android.view.ViewGroup
import android.widget.Toast
import androidx.fragment.app.Fragment
import androidx.fragment.app.viewModels
import androidx.lifecycle.lifecycleScope
import androidx.navigation.fragment.findNavController
import com.google.android.libraries.places.api.model.Place
import com.google.android.libraries.places.widget.AutocompleteSupportFragment
import com.google.android.libraries.places.widget.listener.PlaceSelectionListener
import com.google.android.gms.common.api.Status
import dagger.hilt.android.AndroidEntryPoint
import `in`.dropcars.app.R
import `in`.dropcars.app.databinding.FragmentBookingBinding
import `in`.dropcars.app.model.LocationPoint
import `in`.dropcars.app.utils.Resource
import kotlinx.coroutines.launch
import java.text.SimpleDateFormat
import java.util.*

@AndroidEntryPoint
class BookingFragment : Fragment() {

    private var _binding: FragmentBookingBinding? = null
    private val binding get() = _binding!!
    private val viewModel: BookingViewModel by viewModels()

    private var pickupPoint: LocationPoint? = null
    private var destinationPoint: LocationPoint? = null

    override fun onCreateView(inflater: LayoutInflater, container: ViewGroup?, savedInstanceState: Bundle?): View {
        _binding = FragmentBookingBinding.inflate(inflater, container, false)
        return binding.root
    }

    override fun onViewCreated(view: View, savedInstanceState: Bundle?) {
        super.onViewCreated(view, savedInstanceState)
        setupPlacesAutocomplete()

        binding.btnEstimate.setOnClickListener { estimateFare() }
        binding.btnConfirm.setOnClickListener { confirmBooking() }
        binding.rgPayment.setOnCheckedChangeListener { _, checkedId ->
            viewModel.paymentMethod = if (checkedId == R.id.rbRazorpay) "razorpay" else "cash"
        }

        observeEstimate()
        observeBooking()
    }

    private fun setupPlacesAutocomplete() {
        val pickupFrag = childFragmentManager.findFragmentById(R.id.pickupAutocomplete) as AutocompleteSupportFragment
        pickupFrag.setPlaceFields(listOf(Place.Field.ID, Place.Field.NAME, Place.Field.LAT_LNG, Place.Field.ADDRESS))
        pickupFrag.setHint("Pickup location")
        pickupFrag.setOnPlaceSelectedListener(object : PlaceSelectionListener {
            override fun onPlaceSelected(place: Place) {
                pickupPoint = LocationPoint(
                    address = place.address ?: place.name ?: "",
                    lat = place.latLng?.latitude ?: 0.0,
                    lng = place.latLng?.longitude ?: 0.0,
                )
            }
            override fun onError(status: Status) = toast("Error: $status")
        })

        val destFrag = childFragmentManager.findFragmentById(R.id.destAutocomplete) as AutocompleteSupportFragment
        destFrag.setPlaceFields(listOf(Place.Field.ID, Place.Field.NAME, Place.Field.LAT_LNG, Place.Field.ADDRESS))
        destFrag.setHint("Drop location")
        destFrag.setOnPlaceSelectedListener(object : PlaceSelectionListener {
            override fun onPlaceSelected(place: Place) {
                destinationPoint = LocationPoint(
                    address = place.address ?: place.name ?: "",
                    lat = place.latLng?.latitude ?: 0.0,
                    lng = place.latLng?.longitude ?: 0.0,
                )
            }
            override fun onError(status: Status) = toast("Error: $status")
        })
    }

    private fun estimateFare() {
        val pickup = pickupPoint ?: return toast("Select pickup location")
        val dest = destinationPoint ?: return toast("Select drop location")
        val vehicleType = binding.spinnerVehicle.selectedItem?.toString()?.lowercase() ?: "sedan"
        val tripType = binding.spinnerTripType.selectedItem?.toString()?.lowercase()?.replace(" ", "-") ?: "one-way"
        viewModel.estimate(pickup, dest, vehicleType, tripType)
    }

    private fun observeEstimate() {
        lifecycleScope.launch {
            viewModel.estimateState.collect { res ->
                when (res) {
                    is Resource.Loading -> binding.progressEstimate.visibility = View.VISIBLE
                    is Resource.Success -> {
                        binding.progressEstimate.visibility = View.GONE
                        binding.cardFare.visibility = View.VISIBLE
                        binding.tvDistance.text = res.data.distanceText
                        binding.tvDuration.text = res.data.durationText
                        binding.tvFareTotal.text = "₹${res.data.fare.total}"
                        binding.tvFareBreakdown.text = buildString {
                            append("Base: ₹${res.data.fare.base.toInt()}\n")
                            append("Distance: ₹${res.data.fare.perKmCharge.toInt()}\n")
                            if (res.data.fare.discount > 0) append("Discount: -₹${res.data.fare.discount.toInt()}\n")
                        }
                        binding.btnConfirm.visibility = View.VISIBLE
                    }
                    is Resource.Error -> {
                        binding.progressEstimate.visibility = View.GONE
                        toast(res.message)
                    }
                }
            }
        }
    }

    private fun confirmBooking() {
        val pickup = pickupPoint ?: return toast("Select pickup location")
        val dest = destinationPoint ?: return toast("Select drop location")
        val vehicleType = binding.spinnerVehicle.selectedItem?.toString()?.lowercase() ?: "sedan"
        val tripType = binding.spinnerTripType.selectedItem?.toString()?.lowercase()?.replace(" ", "-") ?: "one-way"
        val pickupDate = SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ss'Z'", Locale.getDefault()).format(Date())
        val promo = binding.etPromo.text.toString().trim().ifBlank { null }

        viewModel.createBooking(pickup, dest, vehicleType, tripType, pickupDate, promo)
    }

    private fun observeBooking() {
        lifecycleScope.launch {
            viewModel.bookingState.collect { res ->
                when (res) {
                    is Resource.Loading -> binding.btnConfirm.isEnabled = false
                    is Resource.Success -> {
                        binding.btnConfirm.isEnabled = true
                        toast("Booking confirmed! OTP: ${res.data.otp}")
                        findNavController().navigate(R.id.action_booking_to_ride,
                            Bundle().apply { putString("bookingId", res.data.id) })
                    }
                    is Resource.Error -> {
                        binding.btnConfirm.isEnabled = true
                        toast(res.message)
                    }
                }
            }
        }
    }

    private fun toast(msg: String) = Toast.makeText(requireContext(), msg, Toast.LENGTH_SHORT).show()

    override fun onDestroyView() { super.onDestroyView(); _binding = null }
}
