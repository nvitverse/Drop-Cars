package in.dropcars.app.data.model

data class AcceptOrderRequest(
    val order_id: Int
)

data class AssignCarDriverRequest(
    val driver_id: String,
    val car_id: String
)

data class OrderAssignment(
    val id: Int,
    val order_id: Int,
    val vehicle_owner_id: String,
    val driver_id: String? = null,
    val car_id: String? = null,
    val assignment_status: String,
    val created_at: String = "",
    val updated_at: String? = null
)

data class PendingOrderForOwner(
    val order_id: Int,
    val trip_type: String,
    val car_type: String,
    val pickup_drop_location: Map<String, String>,
    val start_date_time: String,
    val vendor_price: Int,
    val estimated_price: Int,
    val driver_price: Int,
    val pickup_notes: String? = null,
    val created_at: String = ""
)

data class OrderAssignmentWithOrderDetails(
    val assignment_id: Int,
    val order_id: Int,
    val vehicle_owner_id: String,
    val driver_id: String? = null,
    val car_id: String? = null,
    val assignment_status: String,
    val trip_type: String,
    val car_type: String,
    val pickup_drop_location: Map<String, String>,
    val start_date_time: String,
    val customer_name: String? = null,
    val customer_number: String? = null,
    val driver_name: String? = null,
    val driver_phone: String? = null,
    val car_name: String? = null,
    val car_number: String? = null
)

data class AvailableDriverResponse(
    val id: String,
    val full_name: String,
    val primary_number: String,
    val status: String
)

data class AvailableCarResponse(
    val id: String,
    val car_name: String,
    val car_type: String,
    val car_number: String,
    val car_status: String
)

data class DriverOrderListResponse(
    val order_id: Int,
    val trip_type: String,
    val car_type: String,
    val pickup_drop_location: Map<String, String>,
    val start_date_time: String,
    val customer_name: String,
    val customer_number: String,
    val trip_status: String,
    val assignment_status: String,
    val driver_id: String? = null,
    val car_id: String? = null,
    val pickup_notes: String? = null
)

data class StartTripResponse(
    val message: String,
    val order_id: Int,
    val start_km: Int,
    val speedometer_img_url: String? = null
)

data class EndTripResponse(
    val message: String,
    val order_id: Int,
    val end_km: Int,
    val close_speedometer_img_url: String? = null
)

data class OrderAssignmentResponse(
    val message: String,
    val assignment: OrderAssignment? = null,
    val status: String? = null
)

data class VendorOrderDetailResponse(
    val order_id: Int,
    val trip_type: String,
    val car_type: String,
    val pickup_drop_location: Map<String, String>,
    val start_date_time: String,
    val customer_name: String,
    val customer_number: String,
    val trip_status: String,
    val assignments: List<OrderAssignmentWithOrderDetails> = emptyList(),
    val start_km: Int? = null,
    val end_km: Int? = null,
    val speedometer_img_url: String? = null,
    val close_speedometer_img_url: String? = null,
    val driver_name: String? = null,
    val driver_phone: String? = null,
    val car_name: String? = null,
    val car_number: String? = null
)
