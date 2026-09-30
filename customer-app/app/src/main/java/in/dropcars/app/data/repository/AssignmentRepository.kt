package in.dropcars.app.data.repository

import com.google.gson.Gson
import in.dropcars.app.data.api.DropCarsApi
import in.dropcars.app.data.local.dao.PendingOrderDao
import in.dropcars.app.data.local.entity.CachedPendingOrder
import in.dropcars.app.data.model.*
import okhttp3.MediaType.Companion.toMediaTypeOrNull
import okhttp3.MultipartBody
import okhttp3.RequestBody.Companion.asRequestBody
import okhttp3.RequestBody.Companion.toRequestBody
import java.io.File
import javax.inject.Inject
import javax.inject.Singleton

@Singleton
class AssignmentRepository @Inject constructor(
    private val api: DropCarsApi,
    private val pendingOrderDao: PendingOrderDao,
    private val gson: Gson
) {
    suspend fun getPendingOrdersForOwner(): Result<List<PendingOrderForOwner>> {
        return runCatching {
            try {
                val orders = api.getPendingOrdersForOwner()
                // Cache in Room
                val entities = orders.map {
                    CachedPendingOrder(orderId = it.order_id, orderJson = gson.toJson(it))
                }
                pendingOrderDao.clearPendingOrders()
                pendingOrderDao.insertOrders(entities)
                orders
            } catch (e: Exception) {
                // Fallback to local Room cache
                val cached = pendingOrderDao.getAllPendingOrders()
                if (cached.isNotEmpty()) {
                    cached.map { gson.fromJson(it.orderJson, PendingOrderForOwner::class.java) }
                } else {
                    throw e
                }
            }
        }
    }

    suspend fun getNonPendingOrdersForOwner(): Result<List<OrderAssignmentWithOrderDetails>> {
        return runCatching { api.getNonPendingOrdersForOwner() }
    }

    suspend fun acceptOrder(orderId: Int): Result<OrderAssignmentResponse> {
        return runCatching { api.acceptOrder(AcceptOrderRequest(orderId)) }
    }

    suspend fun getAvailableDrivers(): Result<List<AvailableDriverResponse>> {
        return runCatching { api.getAvailableDrivers() }
    }

    suspend fun getAvailableCars(): Result<List<AvailableCarResponse>> {
        return runCatching { api.getAvailableCars() }
    }

    suspend fun assignCarDriver(assignmentId: Int, driverId: String, carId: String): Result<OrderAssignmentResponse> {
        return runCatching {
            api.assignCarDriver(assignmentId, AssignCarDriverRequest(driverId, carId))
        }
    }

    suspend fun cancelAssignment(assignmentId: Int): Result<OrderAssignmentResponse> {
        return runCatching { api.cancelAssignment(assignmentId) }
    }

    suspend fun vendorCancelOrder(orderId: Int): Result<Map<String, Any>> {
        return runCatching { api.vendorCancelOrder(orderId) }
    }

    // Driver Endpoints
    suspend fun getDriverAssignedOrders(): Result<List<DriverOrderListResponse>> {
        return runCatching { api.getDriverAssignedOrders() }
    }

    suspend fun getDriverCompletedTrips(): Result<List<DriverOrderListResponse>> {
        return runCatching { api.getDriverCompletedTrips() }
    }

    suspend fun startTrip(orderId: Int, startKm: Int, speedometerImageFile: File): Result<StartTripResponse> {
        return runCatching {
            val textType = "text/plain".toMediaTypeOrNull()
            val startKmBody = startKm.toString().toRequestBody(textType)

            val requestFile = speedometerImageFile.asRequestBody("image/*".toMediaTypeOrNull())
            val imgPart = MultipartBody.Part.createFormData("speedometer_img", speedometerImageFile.name, requestFile)

            api.startTrip(orderId, startKmBody, imgPart)
        }
    }

    suspend fun endTrip(
        orderId: Int,
        endKm: Int,
        tollChargeUpdate: Boolean,
        updatedTollCharges: Int?,
        waitingTime: Int?,
        closeSpeedometerImageFile: File
    ): Result<EndTripResponse> {
        return runCatching {
            val textType = "text/plain".toMediaTypeOrNull()
            val endKmBody = endKm.toString().toRequestBody(textType)
            val tollUpdateBody = tollChargeUpdate.toString().toRequestBody(textType)
            val updatedTollBody = updatedTollCharges?.toString()?.toRequestBody(textType)
            val waitingTimeBody = waitingTime?.toString()?.toRequestBody(textType)

            val requestFile = closeSpeedometerImageFile.asRequestBody("image/*".toMediaTypeOrNull())
            val imgPart = MultipartBody.Part.createFormData("close_speedometer_img", closeSpeedometerImageFile.name, requestFile)

            api.endTrip(orderId, endKmBody, tollUpdateBody, updatedTollBody, waitingTimeBody, imgPart)
        }
    }

    suspend fun getDriverTripHistory(): Result<List<Map<String, Any>>> {
        return runCatching { api.getDriverTripHistory() }
    }
}
