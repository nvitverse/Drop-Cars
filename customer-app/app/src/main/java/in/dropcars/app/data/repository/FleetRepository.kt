package in.dropcars.app.data.repository

import in.dropcars.app.data.api.DropCarsApi
import in.dropcars.app.data.model.*
import okhttp3.MediaType.Companion.toMediaTypeOrNull
import okhttp3.MultipartBody
import okhttp3.RequestBody.Companion.asRequestBody
import okhttp3.RequestBody.Companion.toRequestBody
import java.io.File
import javax.inject.Inject
import javax.inject.Singleton

@Singleton
class FleetRepository @Inject constructor(
    private val api: DropCarsApi
) {
    suspend fun addCarDetails(
        carName: String,
        carType: String,
        carNumber: String,
        yearOfTheCar: String?,
        vehicleOwnerId: String,
        rcFrontFile: File,
        rcBackFile: File,
        insuranceFile: File,
        fcFile: File,
        carFile: File,
        permitFile: File
    ): Result<CarDetailsSignupResponse> {
        return runCatching {
            val textType = "text/plain".toMediaTypeOrNull()

            fun createFilePart(partName: String, file: File): MultipartBody.Part {
                val requestFile = file.asRequestBody("image/*".toMediaTypeOrNull())
                return MultipartBody.Part.createFormData(partName, file.name, requestFile)
            }

            api.addCarDetails(
                carName.toRequestBody(textType),
                carType.toRequestBody(textType),
                carNumber.toRequestBody(textType),
                yearOfTheCar?.toRequestBody(textType),
                vehicleOwnerId.toRequestBody(textType),
                createFilePart("rc_front_img", rcFrontFile),
                createFilePart("rc_back_img", rcBackFile),
                createFilePart("insurance_img", insuranceFile),
                createFilePart("fc_img", fcFile),
                createFilePart("car_img", carFile),
                createFilePart("permit_img", permitFile)
            )
        }
    }

    suspend fun getCarDetailsAll(): Result<List<CarDetails>> {
        return runCatching { api.getCarDetailsAll() }
    }

    suspend fun getCarDetailsById(carId: String): Result<CarDetails> {
        return runCatching { api.getCarDetailsById(carId) }
    }

    suspend fun registerDriver(
        fullName: String,
        primaryNumber: String,
        password: String,
        address: String,
        city: String,
        pincode: String,
        licenceNumber: String,
        vehicleOwnerId: String,
        secondaryNumber: String?,
        licenceFrontImgFile: File
    ): Result<DriverSignupResponse> {
        return runCatching {
            val textType = "text/plain".toMediaTypeOrNull()
            val requestFile = licenceFrontImgFile.asRequestBody("image/*".toMediaTypeOrNull())
            val licencePart = MultipartBody.Part.createFormData("licence_front_img", licenceFrontImgFile.name, requestFile)

            api.driverSignup(
                fullName.toRequestBody(textType),
                primaryNumber.toRequestBody(textType),
                password.toRequestBody(textType),
                address.toRequestBody(textType),
                city.toRequestBody(textType),
                pincode.toRequestBody(textType),
                licenceNumber.toRequestBody(textType),
                vehicleOwnerId.toRequestBody(textType),
                secondaryNumber?.toRequestBody(textType),
                licencePart
            )
        }
    }
}
