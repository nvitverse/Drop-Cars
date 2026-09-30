package in.dropcars.app.data.repository

import in.dropcars.app.data.api.DropCarsApi
import in.dropcars.app.data.local.AuthTokenManager
import in.dropcars.app.data.model.*
import okhttp3.MediaType.Companion.toMediaTypeOrNull
import okhttp3.MultipartBody
import okhttp3.RequestBody.Companion.asRequestBody
import okhttp3.RequestBody.Companion.toRequestBody
import java.io.File
import javax.inject.Inject
import javax.inject.Singleton

@Singleton
class AuthRepository @Inject constructor(
    private val api: DropCarsApi,
    private val tokenManager: AuthTokenManager
) {
    fun getCurrentRole(): UserRole = tokenManager.getRole()
    fun getToken(): String? = tokenManager.getToken()
    fun getUserId(): String? = tokenManager.getUserId()
    fun getUserName(): String? = tokenManager.getUserName()
    fun getUserPhone(): String? = tokenManager.getUserPhone()

    suspend fun vendorSignin(primaryNumber: String, password: String): Result<TokenResponse> {
        return runCatching {
            val response = api.vendorSignin(VendorSigninRequest(primaryNumber, password))
            tokenManager.saveToken(response.access_token)
            tokenManager.saveRole(UserRole.VENDOR)
            response.vendor?.let {
                tokenManager.saveUserInfo(it.id, it.full_name, it.primary_number)
            }
            response
        }
    }

    suspend fun vendorSignup(
        fullName: String,
        primaryNumber: String,
        password: String,
        address: String,
        city: String,
        pincode: String,
        aadharNumber: String,
        gpayNumber: String,
        aadharImageFile: File?
    ): Result<TokenResponse> {
        return runCatching {
            val textType = "text/plain".toMediaTypeOrNull()
            val aadharPart = aadharImageFile?.let { file ->
                val requestFile = file.asRequestBody("image/*".toMediaTypeOrNull())
                MultipartBody.Part.createFormData("aadhar_image", file.name, requestFile)
            }

            val response = api.vendorSignup(
                fullName.toRequestBody(textType),
                primaryNumber.toRequestBody(textType),
                password.toRequestBody(textType),
                address.toRequestBody(textType),
                city.toRequestBody(textType),
                pincode.toRequestBody(textType),
                aadharNumber.toRequestBody(textType),
                gpayNumber.toRequestBody(textType),
                aadharPart
            )

            tokenManager.saveToken(response.access_token)
            tokenManager.saveRole(UserRole.VENDOR)
            response.vendor?.let {
                tokenManager.saveUserInfo(it.id, it.full_name, it.primary_number)
            }
            response
        }
    }

    suspend fun ownerSignin(primaryNumber: String, password: String): Result<TokenResponse> {
        return runCatching {
            val response = api.ownerSignin(VehicleOwnerSigninRequest(primaryNumber, password))
            tokenManager.saveToken(response.access_token)
            tokenManager.saveRole(UserRole.VEHICLE_OWNER)
            response.vehicle_owner?.let {
                tokenManager.saveUserInfo(it.id, it.full_name, it.primary_number)
            }
            response
        }
    }

    suspend fun ownerSignup(
        fullName: String,
        primaryNumber: String,
        password: String,
        address: String,
        city: String,
        pincode: String,
        aadharNumber: String,
        gpayNumber: String?,
        secondaryNumber: String?,
        aadharFrontImgFile: File?
    ): Result<VehicleOwnerSignupResponse> {
        return runCatching {
            val textType = "text/plain".toMediaTypeOrNull()
            val aadharPart = aadharFrontImgFile?.let { file ->
                val requestFile = file.asRequestBody("image/*".toMediaTypeOrNull())
                MultipartBody.Part.createFormData("aadhar_front_img", file.name, requestFile)
            }

            api.ownerSignup(
                fullName.toRequestBody(textType),
                primaryNumber.toRequestBody(textType),
                password.toRequestBody(textType),
                address.toRequestBody(textType),
                city.toRequestBody(textType),
                pincode.toRequestBody(textType),
                aadharNumber.toRequestBody(textType),
                gpayNumber?.toRequestBody(textType),
                secondaryNumber?.toRequestBody(textType),
                aadharPart
            )
        }
    }

    suspend fun driverSignin(primaryNumber: String, password: String): Result<DriverSigninResponse> {
        return runCatching {
            val response = api.driverSignin(DriverSigninRequest(primaryNumber, password))
            tokenManager.saveToken(response.access_token)
            tokenManager.saveRole(UserRole.DRIVER)
            response.driver?.let {
                tokenManager.saveUserInfo(it.id, it.full_name, it.primary_number)
            }
            response
        }
    }

    suspend fun updateDriverStatus(status: String): Result<DriverStatusUpdateResponse> {
        return runCatching {
            api.updateDriverStatus(mapOf("status" to status))
        }
    }

    fun logout() {
        tokenManager.clearAuth()
    }
}
