package in.dropcars.app.data.model

data class AdminSigninRequest(
    val username: String,
    val password: String
)

data class OperationalTogglesResponse(
    val live_tracking_enabled: Boolean = true,
    val auto_dispatch_enabled: Boolean = true,
    val escalation_timer_minutes: Int = 5,
    val driver_radius_km: Int = 25
)

data class AdminRateUpdateRequest(
    val car_type: String,
    val cost_per_km: Int,
    val extra_cost_per_km: Int,
    val driver_allowance: Int,
    val permit_charges: Int
)

data class AdminAssignOrderRequest(
    val order_id: Int,
    val vehicle_owner_id: String? = null,
    val driver_id: String? = null,
    val car_id: String? = null
)
