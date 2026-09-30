package in.dropcars.app.data.model

import com.google.gson.annotations.SerializedName

data class VendorSigninRequest(
    val primary_number: String,
    val password: String
)

data class DriverSigninRequest(
    val primary_number: String,
    val password: String
)

data class VehicleOwnerSigninRequest(
    val primary_number: String,
    val password: String
)

data class TokenResponse(
    val access_token: String,
    val token_type: String = "bearer",
    val vendor: VendorOut? = null,
    val driver: DriverOut? = null,
    val vehicle_owner: VehicleOwnerOut? = null,
    val account_status: String? = null,
    val car_driver_count: Int? = null,
    val car_details_count: Int? = null
)

data class VendorOut(
    val id: String,
    val full_name: String,
    val primary_number: String,
    val secondary_number: String? = null,
    val gpay_number: String? = null,
    val wallet_balance: Int = 0,
    val bank_balance: Int? = 0,
    val aadhar_number: String? = null,
    val aadhar_front_img: String? = null,
    val address: String = "",
    val city: String = "",
    val pincode: String = "",
    val account_status: String = "Active",
    val created_at: String = ""
)

data class DriverOut(
    val id: String,
    val full_name: String,
    val primary_number: String,
    val secondary_number: String? = null,
    val address: String? = null,
    val city: String? = null,
    val pincode: String? = null,
    val licence_number: String? = null,
    val vehicle_owner_id: String? = null,
    val status: String = "OFFLINE",
    val licence_front_img: String? = null
)

data class VehicleOwnerOut(
    val id: String,
    val full_name: String,
    val primary_number: String,
    val secondary_number: String? = null,
    val gpay_number: String? = null,
    val aadhar_number: String? = null,
    val address: String = "",
    val city: String = "",
    val pincode: String = "",
    val account_status: String = "Active",
    val car_driver_count: Int = 0,
    val car_details_count: Int = 0
)

data class VendorDetailsResponse(
    val vendor: VendorOut
)

data class DriverSigninResponse(
    val access_token: String,
    val token_type: String = "bearer",
    val driver_id: String? = null,
    val driver_status: String? = null,
    val driver: DriverOut? = null
)

data class DriverStatusUpdateResponse(
    val message: String,
    val status: String
)

data class VehicleOwnerSignupResponse(
    val message: String,
    val user_id: String,
    val aadhar_img_url: String? = null,
    val status: String
)

data class DriverSignupResponse(
    val message: String,
    val driver_id: String,
    val license_img_url: String? = null,
    val status: String
)
