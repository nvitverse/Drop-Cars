package in.dropcars.app.data.model

import com.google.gson.annotations.SerializedName

data class OnewayQuoteRequest(
    val vendor_id: String,
    val trip_type: String = "Oneway",
    val car_type: String,
    val pickup_drop_location: Map<String, String>, // {"0":"Chennai","1":"Bangalore"}
    val start_date_time: String,                  // ISO-8601
    val customer_name: String,
    val customer_number: String,
    val cost_per_km: Int,
    val extra_cost_per_km: Int,
    val driver_allowance: Int,
    val extra_driver_allowance: Int = 0,
    val permit_charges: Int,
    val extra_permit_charges: Int = 0,
    val hill_charges: Int = 0,
    val toll_charges: Int = 0,
    val night_charges: Int = 0,
    val pickup_notes: String? = null,
    val max_time_to_assign_order: Int = 15,
    val toll_charge_update: Boolean = false
)

data class OnewayConfirmRequest(
    val vendor_id: String,
    val trip_type: String = "Oneway",
    val car_type: String,
    val pickup_drop_location: Map<String, String>,
    val start_date_time: String,
    val customer_name: String,
    val customer_number: String,
    val cost_per_km: Int,
    val extra_cost_per_km: Int,
    val driver_allowance: Int,
    val extra_driver_allowance: Int = 0,
    val permit_charges: Int,
    val extra_permit_charges: Int = 0,
    val hill_charges: Int = 0,
    val toll_charges: Int = 0,
    val night_charges: Int = 0,
    val send_to: String = "ALL",                    // "ALL" | "NEAR_CITY"
    val near_city: List<String>? = null,
    val pickup_notes: String? = null,
    val max_time_to_assign_order: Int = 15,
    val toll_charge_update: Boolean = false
)

data class RoundTripQuoteRequest(
    val vendor_id: String,
    val trip_type: String = "Round Trip",
    val car_type: String,
    val pickup_drop_location: Map<String, String>,
    val start_date_time: String,
    val return_date_time: String? = null,
    val customer_name: String,
    val customer_number: String,
    val cost_per_km: Int,
    val extra_cost_per_km: Int,
    val driver_allowance: Int,
    val extra_driver_allowance: Int = 0,
    val permit_charges: Int = 0,
    val extra_permit_charges: Int = 0,
    val hill_charges: Int = 0,
    val toll_charges: Int = 0,
    val night_charges: Int = 0
)

data class RoundTripConfirmRequest(
    val vendor_id: String,
    val trip_type: String = "Round Trip",
    val car_type: String,
    val pickup_drop_location: Map<String, String>,
    val start_date_time: String,
    val return_date_time: String? = null,
    val customer_name: String,
    val customer_number: String,
    val cost_per_km: Int,
    val extra_cost_per_km: Int,
    val driver_allowance: Int,
    val extra_driver_allowance: Int = 0,
    val permit_charges: Int = 0,
    val extra_permit_charges: Int = 0,
    val hill_charges: Int = 0,
    val toll_charges: Int = 0,
    val night_charges: Int = 0,
    val send_to: String = "ALL",
    val near_city: List<String>? = null,
    val pickup_notes: String? = null,
    val max_time_to_assign_order: Int = 20
)

data class MulticityQuoteRequest(
    val vendor_id: String,
    val trip_type: String = "Multy City",
    val car_type: String,
    val pickup_drop_location: Map<String, String>, // {"0":"Chennai","1":"Vellore","2":"Tirupati"}
    val start_date_time: String,
    val customer_name: String,
    val customer_number: String,
    val cost_per_km: Int,
    val extra_cost_per_km: Int,
    val driver_allowance: Int,
    val extra_driver_allowance: Int = 0,
    val permit_charges: Int = 0,
    val extra_permit_charges: Int = 0,
    val hill_charges: Int = 0,
    val toll_charges: Int = 0,
    val night_charges: Int = 0
)

data class MulticityConfirmRequest(
    val vendor_id: String,
    val trip_type: String = "Multy City",
    val car_type: String,
    val pickup_drop_location: Map<String, String>,
    val start_date_time: String,
    val customer_name: String,
    val customer_number: String,
    val cost_per_km: Int,
    val extra_cost_per_km: Int,
    val driver_allowance: Int,
    val extra_driver_allowance: Int = 0,
    val permit_charges: Int = 0,
    val extra_permit_charges: Int = 0,
    val hill_charges: Int = 0,
    val toll_charges: Int = 0,
    val night_charges: Int = 0,
    val send_to: String = "ALL",
    val near_city: List<String>? = null,
    val pickup_notes: String? = null,
    val max_time_to_assign_order: Int = 25
)

data class PackageHours(
    val hours: Int,
    val km_range: Int
)

data class HourlyRentalRequest(
    val vendor_id: String,
    val trip_type: String = "Hourly Rental",
    val car_type: String,
    val package_hours: PackageHours,
    val cost_per_hour: Int,
    val extra_cost_per_hour: Int,
    val cost_for_addon_km: Int,
    val extra_cost_for_addon_km: Int,
    val pickup_drop_location: Map<String, String>, // {"0":"Chennai"}
    val start_date_time: String,
    val customer_name: String,
    val customer_number: String,
    val pickup_notes: String? = null,
    val max_time_to_assign_order: Int = 10
)

data class FareBreakdown(
    val total_km: Double = 0.0,
    val trip_time: String = "",
    val base_km_amount: Int = 0,
    val driver_allowance: Int = 0,
    val extra_driver_allowance: Int = 0,
    val permit_charges: Int = 0,
    val hill_charges: Int = 0,
    val toll_charges: Int = 0,
    val total_amount: Int = 0,
    @SerializedName("Commission_percent")
    val commission_percent: Int = 10,
    val vendor_commission_percent: Int = 5,
    val customer_amount: Int = 0,
    val driver_amount: Int = 0,
    val vendor_basic_commession_amount: Int = 0,
    val remark_trip_min_km: Int = 0
)

data class RentalFareBreakdown(
    val total_hours: Double = 0.0,
    val vendor_amount: Int = 0,
    val estimate_price: Int = 0
)

data class OnewayQuoteResponse(
    val fare: FareBreakdown? = null,
    val echo: Map<String, Any>? = null
)

data class OnewayConfirmResponse(
    val order_id: Int,
    val trip_status: String = "PENDING",
    val pick_near_city: List<String> = emptyList(),
    val trip_type: String = "Oneway",
    val fare: FareBreakdown? = null,
    val start_otp: String? = "1234",
    val end_otp: String? = "5678",
    val otp_source: String? = "VENDOR"
)

data class HourlyQuoteResponse(
    val fare: RentalFareBreakdown? = null
)

data class HourlyConfirmResponse(
    val order_id: Int,
    val trip_status: String = "PENDING",
    val fare: RentalFareBreakdown? = null,
    val start_otp: String? = "1234",
    val end_otp: String? = "5678",
    val otp_source: String? = "VENDOR"
)

data class BaseOrder(
    val id: Int,
    val vendor_id: String,
    val trip_type: String,
    val car_type: String,
    val pickup_drop_location: Map<String, String>,
    val start_date_time: String,
    val customer_name: String,
    val customer_number: String,
    val trip_status: String,
    val created_at: String? = null,
    val estimated_price: Int? = 0,
    val vendor_price: Int? = 0,
    val driver_price: Int? = 0,
    val start_otp: String? = "1234",
    val end_otp: String? = "5678",
    val otp_source: String? = "VENDOR" // "VENDOR" or "CUSTOMER"
)

data class NewOrderResponse(
    val id: Int,
    val vendor_id: String,
    val trip_type: String,
    val car_type: String,
    val pickup_drop_location: Map<String, String>,
    val start_date_time: String,
    val customer_name: String,
    val customer_number: String,
    val trip_status: String,
    val created_at: String,
    val start_otp: String? = "1234",
    val end_otp: String? = "5678",
    val otp_source: String? = "VENDOR"
)

data class RecreateOrderRequest(
    val order_id: Int
)

data class RecreateOrderResponse(
    val message: String,
    val new_order_id: Int
)

data class MaxAssignmentTimesResponse(
    val max_assignment_times: Map<String, Int>,
    val description: String? = null
)
