package in.dropcars.app.data.model

data class CarDetails(
    val id: String,
    val vehicle_owner_id: String,
    val car_name: String,
    val car_type: String,     // CarType enum value
    val car_number: String,
    val year_of_the_car: String? = null,
    val car_status: String = "ONLINE", // "ONLINE"|"DRIVING"|"BLOCKED"|"PROCESSING"
    // Document URLs:
    val rc_front_img_url: String? = null,
    val rc_back_img_url: String? = null,
    val insurance_img_url: String? = null,
    val fc_img_url: String? = null,
    val car_img_url: String? = null,
    val permit_img_url: String? = null,
    // Document statuses: "PENDING"|"VERIFIED"|"REJECTED"
    val rc_front_status: String? = null,
    val rc_back_status: String? = null,
    val insurance_status: String? = null,
    val fc_status: String? = null,
    val car_img_status: String? = null,
    val permit_status: String? = null,
    val created_at: String = ""
)

data class CarDetailsSignupResponse(
    val message: String,
    val car_id: String,
    val image_urls: Map<String, String>? = null,
    val status: String
)

data class CityResponse(
    val id: Int? = null,
    val name: String,
    val state: String? = null,
    val status: String? = null
)
