package in.dropcars.app.data.repository

import com.google.gson.Gson
import in.dropcars.app.data.api.DropCarsApi
import in.dropcars.app.data.local.dao.FareRouteDao
import in.dropcars.app.data.local.entity.CachedFareRoute
import in.dropcars.app.data.model.*
import java.security.MessageDigest
import javax.inject.Inject
import javax.inject.Singleton

@Singleton
class OrderRepository @Inject constructor(
    private val api: DropCarsApi,
    private val fareRouteDao: FareRouteDao,
    private val gson: Gson
) {
    suspend fun getMaxAssignmentTimes(): Result<MaxAssignmentTimesResponse> {
        return runCatching { api.getMaxAssignmentTimes() }
    }

    suspend fun getOnewayQuote(request: OnewayQuoteRequest): Result<OnewayQuoteResponse> {
        return runCatching {
            val fromCity = request.pickup_drop_location["0"] ?: ""
            val toCity = request.pickup_drop_location["1"] ?: ""
            val routeKey = generateMd5("${fromCity}_${toCity}_${request.car_type}")

            val cached = fareRouteDao.getValidRoute(routeKey)
            if (cached != null) {
                val fare = gson.fromJson(cached.fareJson, FareBreakdown::class.java)
                return@runCatching OnewayQuoteResponse(fare = fare)
            }

            val response = api.onewayQuote(request)
            response.fare?.let { fare ->
                val cachedEntity = CachedFareRoute(
                    routeKey = routeKey,
                    fromCity = fromCity,
                    toCity = toCity,
                    carType = request.car_type,
                    distanceKm = fare.total_km,
                    tripTime = fare.trip_time,
                    customerAmount = fare.customer_amount,
                    driverAmount = fare.driver_amount,
                    fareJson = gson.toJson(fare),
                    expiresAt = System.currentTimeMillis() + (7 * 24 * 60 * 60 * 1000L) // 7 days TTL
                )
                fareRouteDao.insertRoute(cachedEntity)
            }
            response
        }
    }

    suspend fun confirmOneway(request: OnewayConfirmRequest): Result<OnewayConfirmResponse> {
        return runCatching { api.onewayConfirm(request) }
    }

    suspend fun getRoundTripQuote(request: RoundTripQuoteRequest): Result<OnewayQuoteResponse> {
        return runCatching { api.roundtripQuote(request) }
    }

    suspend fun confirmRoundTrip(request: RoundTripConfirmRequest): Result<OnewayConfirmResponse> {
        return runCatching { api.roundtripConfirm(request) }
    }

    suspend fun getMulticityQuote(request: MulticityQuoteRequest): Result<OnewayQuoteResponse> {
        return runCatching { api.multicityQuote(request) }
    }

    suspend fun confirmMulticity(request: MulticityConfirmRequest): Result<OnewayConfirmResponse> {
        return runCatching { api.multicityConfirm(request) }
    }

    suspend fun getHourlyQuote(request: HourlyRentalRequest): Result<HourlyQuoteResponse> {
        return runCatching { api.hourlyQuote(request) }
    }

    suspend fun confirmHourly(request: HourlyRentalRequest): Result<HourlyConfirmResponse> {
        return runCatching { api.hourlyConfirm(request) }
    }

    suspend fun getVendorOrders(): Result<List<BaseOrder>> {
        return runCatching { api.getVendorOrders() }
    }

    suspend fun getVendorOrdersWithAssignments(): Result<List<OrderAssignmentWithOrderDetails>> {
        return runCatching { api.getVendorOrdersWithAssignments() }
    }

    suspend fun getVendorOrderDetail(orderId: Int): Result<VendorOrderDetailResponse> {
        return runCatching { api.getVendorOrderDetail(orderId) }
    }

    suspend fun recreateOrder(orderId: Int): Result<RecreateOrderResponse> {
        return runCatching { api.recreateOrder(RecreateOrderRequest(orderId)) }
    }

    private fun generateMd5(input: String): String {
        val md = MessageDigest.getInstance("MD5")
        return md.digest(input.toByteArray()).joinToString("") { "%02x".format(it) }
    }
}
