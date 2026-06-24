package `in`.dropcars.app.ui.home

import android.Manifest
import android.content.pm.PackageManager
import android.os.Bundle
import android.view.LayoutInflater
import android.view.View
import android.view.ViewGroup
import android.widget.Toast
import androidx.activity.result.contract.ActivityResultContracts
import androidx.core.content.ContextCompat
import androidx.fragment.app.Fragment
import androidx.fragment.app.viewModels
import androidx.lifecycle.lifecycleScope
import androidx.navigation.fragment.findNavController
import com.google.android.gms.location.FusedLocationProviderClient
import com.google.android.gms.location.LocationServices
import com.google.android.gms.maps.CameraUpdateFactory
import com.google.android.gms.maps.GoogleMap
import com.google.android.gms.maps.OnMapReadyCallback
import com.google.android.gms.maps.SupportMapFragment
import com.google.android.gms.maps.model.LatLng
import com.google.android.gms.maps.model.MarkerOptions
import dagger.hilt.android.AndroidEntryPoint
import `in`.dropcars.app.R
import `in`.dropcars.app.databinding.FragmentHomeBinding
import kotlinx.coroutines.launch

@AndroidEntryPoint
class HomeFragment : Fragment(), OnMapReadyCallback {

    private var _binding: FragmentHomeBinding? = null
    private val binding get() = _binding!!
    private val viewModel: HomeViewModel by viewModels()
    private lateinit var map: GoogleMap
    private lateinit var fusedLocationClient: FusedLocationProviderClient

    private val locationPermission = registerForActivityResult(ActivityResultContracts.RequestMultiplePermissions()) { perms ->
        if (perms[Manifest.permission.ACCESS_FINE_LOCATION] == true) enableMyLocation()
    }

    override fun onCreateView(inflater: LayoutInflater, container: ViewGroup?, savedInstanceState: Bundle?): View {
        _binding = FragmentHomeBinding.inflate(inflater, container, false)
        return binding.root
    }

    override fun onViewCreated(view: View, savedInstanceState: Bundle?) {
        super.onViewCreated(view, savedInstanceState)
        fusedLocationClient = LocationServices.getFusedLocationProviderClient(requireContext())

        val mapFragment = childFragmentManager.findFragmentById(R.id.map) as SupportMapFragment
        mapFragment.getMapAsync(this)

        binding.btnBookNow.setOnClickListener {
            findNavController().navigate(R.id.action_home_to_booking)
        }

        setupTripTypeChips()
        observePricing()
    }

    override fun onMapReady(googleMap: GoogleMap) {
        map = googleMap
        map.uiSettings.isZoomControlsEnabled = true
        checkAndRequestLocation()
    }

    private fun checkAndRequestLocation() {
        val hasFine = ContextCompat.checkSelfPermission(requireContext(), Manifest.permission.ACCESS_FINE_LOCATION)
        if (hasFine == PackageManager.PERMISSION_GRANTED) enableMyLocation()
        else locationPermission.launch(arrayOf(Manifest.permission.ACCESS_FINE_LOCATION, Manifest.permission.ACCESS_COARSE_LOCATION))
    }

    private fun enableMyLocation() {
        try {
            map.isMyLocationEnabled = true
            fusedLocationClient.lastLocation.addOnSuccessListener { loc ->
                loc ?: return@addOnSuccessListener
                val latLng = LatLng(loc.latitude, loc.longitude)
                map.animateCamera(CameraUpdateFactory.newLatLngZoom(latLng, 15f))
                viewModel.setCurrentLocation(loc.latitude, loc.longitude)
            }
        } catch (_: SecurityException) {}
    }

    private fun setupTripTypeChips() {
        binding.chipGroupTrip.setOnCheckedStateChangeListener { _, checkedIds ->
            val tripType = when (checkedIds.firstOrNull()) {
                R.id.chipOneWay -> "one-way"
                R.id.chipRoundTrip -> "round-trip"
                R.id.chipAirport -> "airport"
                R.id.chipOutstation -> "outstation"
                R.id.chipHourly -> "hourly"
                else -> "one-way"
            }
            viewModel.setTripType(tripType)
        }
    }

    private fun observePricing() {
        lifecycleScope.launch {
            viewModel.pricing.collect { list ->
                binding.rvVehicles.adapter = VehicleAdapter(list) { pricing ->
                    viewModel.setSelectedVehicle(pricing)
                }
            }
        }
    }

    override fun onDestroyView() { super.onDestroyView(); _binding = null }
}
