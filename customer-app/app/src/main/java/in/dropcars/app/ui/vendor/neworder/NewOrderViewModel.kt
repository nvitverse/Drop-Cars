package in.dropcars.app.ui.vendor.neworder

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import dagger.hilt.android.lifecycle.HiltViewModel
import in.dropcars.app.data.model.*
import in.dropcars.app.data.repository.AuthRepository
import in.dropcars.app.data.repository.CityRepository
import in.dropcars.app.data.repository.OrderRepository
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.launch
import javax.inject.Inject

sealed interface QuoteState {
    object Idle : QuoteState
    object Loading : QuoteState
    data class OnewayQuoteSuccess(val fare: FareBreakdown) : QuoteState
    data class HourlyQuoteSuccess(val fare: RentalFareBreakdown) : QuoteState
    data class ConfirmSuccess(val orderId: Int) : QuoteState
    data class Error(val message: String) : QuoteState
}

@HiltViewModel
class NewOrderViewModel @Inject constructor(
    private val orderRepository: OrderRepository,
    private val cityRepository: CityRepository,
    private val authRepository: AuthRepository
) : ViewModel() {

    private val _quoteState = MutableStateFlow<QuoteState>(QuoteState.Idle)
    val quoteState: StateFlow<QuoteState> = _quoteState

    private val _cities = MutableStateFlow<List<CityResponse>>(emptyList())
    val cities: StateFlow<List<CityResponse>> = _cities

    private val _maxAssignTimes = MutableStateFlow<Map<String, Int>>(emptyMap())
    val maxAssignTimes: StateFlow<Map<String, Int>> = _maxAssignTimes

    init {
        loadCities()
        loadMaxAssignTimes()
    }

    private fun loadCities() {
        viewModelScope.launch {
            cityRepository.getCities().onSuccess { _cities.value = it }
        }
    }

    private fun loadMaxAssignTimes() {
        viewModelScope.launch {
            orderRepository.getMaxAssignmentTimes().onSuccess {
                _maxAssignTimes.value = it.max_assignment_times
            }
        }
    }

    fun requestOnewayQuote(
        pickupCity: String,
        dropCity: String,
        carType: String,
        startDateTime: String,
        customerName: String,
        customerNumber: String,
        costPerKm: Int,
        extraCostPerKm: Int,
        driverAllowance: Int,
        permitCharges: Int,
        tollCharges: Int,
        pickupNotes: String?
    ) {
        val vendorId = authRepository.getUserId() ?: ""
        val req = OnewayQuoteRequest(
            vendor_id = vendorId,
            car_type = carType,
            pickup_drop_location = mapOf("0" to pickupCity, "1" to dropCity),
            start_date_time = startDateTime,
            customer_name = customerName,
            customer_number = customerNumber,
            cost_per_km = costPerKm,
            extra_cost_per_km = extraCostPerKm,
            driver_allowance = driverAllowance,
            permit_charges = permitCharges,
            toll_charges = tollCharges,
            pickup_notes = pickupNotes
        )

        viewModelScope.launch {
            _quoteState.value = QuoteState.Loading
            orderRepository.getOnewayQuote(req)
                .onSuccess { res ->
                    if (res.fare != null) {
                        _quoteState.value = QuoteState.OnewayQuoteSuccess(res.fare)
                    } else {
                        _quoteState.value = QuoteState.Error("Failed to calculate fare estimate.")
                    }
                }
                .onFailure {
                    _quoteState.value = QuoteState.Error(it.message ?: "Quote request failed")
                }
        }
    }

    fun confirmOnewayOrder(
        pickupCity: String,
        dropCity: String,
        carType: String,
        startDateTime: String,
        customerName: String,
        customerNumber: String,
        costPerKm: Int,
        extraCostPerKm: Int,
        driverAllowance: Int,
        permitCharges: Int,
        tollCharges: Int,
        pickupNotes: String?
    ) {
        val vendorId = authRepository.getUserId() ?: ""
        val maxTime = _maxAssignTimes.value["Oneway"] ?: 15

        val req = OnewayConfirmRequest(
            vendor_id = vendorId,
            car_type = carType,
            pickup_drop_location = mapOf("0" to pickupCity, "1" to dropCity),
            start_date_time = startDateTime,
            customer_name = customerName,
            customer_number = customerNumber,
            cost_per_km = costPerKm,
            extra_cost_per_km = extraCostPerKm,
            driver_allowance = driverAllowance,
            permit_charges = permitCharges,
            toll_charges = tollCharges,
            pickup_notes = pickupNotes,
            max_time_to_assign_order = maxTime
        )

        viewModelScope.launch {
            _quoteState.value = QuoteState.Loading
            orderRepository.confirmOneway(req)
                .onSuccess {
                    _quoteState.value = QuoteState.ConfirmSuccess(it.order_id)
                }
                .onFailure {
                    _quoteState.value = QuoteState.Error(it.message ?: "Order confirmation failed")
                }
        }
    }

    fun resetQuoteState() {
        _quoteState.value = QuoteState.Idle
    }
}
