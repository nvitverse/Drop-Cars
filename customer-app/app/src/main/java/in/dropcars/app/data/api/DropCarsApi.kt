package in.dropcars.app.data.api

import in.dropcars.app.data.model.*
import okhttp3.MultipartBody
import okhttp3.RequestBody
import retrofit2.http.*

interface DropCarsApi {

    // ─── Auth — Vendor ───────────────────────────────────────────────────────
    @POST("api/users/vendor/signin")
    suspend fun vendorSignin(@Body body: VendorSigninRequest): TokenResponse

    @Multipart
    @POST("api/users/vendor/signup")
    suspend fun vendorSignup(
        @Part("full_name") fullName: RequestBody,
        @Part("primary_number") primaryNumber: RequestBody,
        @Part("password") password: RequestBody,
        @Part("address") address: RequestBody,
        @Part("city") city: RequestBody,
        @Part("pincode") pincode: RequestBody,
        @Part("aadhar_number") aadharNumber: RequestBody,
        @Part("gpay_number") gpayNumber: RequestBody,
        @Part aadharImage: MultipartBody.Part?
    ): TokenResponse

    @GET("api/users/vendor-details/me")
    suspend fun getVendorProfile(): VendorDetailsResponse

    // ─── Auth — Customer & Google OAuth ───────────────────────────────────────
    @POST("api/auth/google")
    suspend fun googleSignIn(@Body body: Map<String, String>): TokenResponse

    @POST("api/auth/email-otp")
    suspend fun requestEmailOtp(@Body body: Map<String, String>): Map<String, Any>

    @POST("api/auth/verify-email-otp")
    suspend fun verifyEmailOtp(@Body body: Map<String, String>): TokenResponse

    @GET("api/customer/referral-stats")
    suspend fun getReferralStats(): ReferralStatsResponse

    @GET("api/offers/flash")
    suspend fun getFlashOffers(): List<FlashOfferResponse>

    // ─── Auth — Vehicle Owner ─────────────────────────────────────────────────
    @POST("api/users/vehicleowner/login")
    suspend fun ownerSignin(@Body body: VehicleOwnerSigninRequest): TokenResponse

    @Multipart
    @POST("api/users/vehicleowner/signup")
    suspend fun ownerSignup(
        @Part("full_name") fullName: RequestBody,
        @Part("primary_number") primaryNumber: RequestBody,
        @Part("password") password: RequestBody,
        @Part("address") address: RequestBody,
        @Part("city") city: RequestBody,
        @Part("pincode") pincode: RequestBody,
        @Part("aadhar_number") aadharNumber: RequestBody,
        @Part("gpay_number") gpayNumber: RequestBody?,
        @Part("secondary_number") secondaryNumber: RequestBody?,
        @Part aadharFrontImg: MultipartBody.Part?
    ): VehicleOwnerSignupResponse

    @GET("api/users/vehicle-owner/me")
    suspend fun getOwnerProfile(): VehicleOwnerOut

    // ─── Auth — Driver ───────────────────────────────────────────────────────
    @POST("api/users/cardriver/signin")
    suspend fun driverSignin(@Body body: DriverSigninRequest): DriverSigninResponse

    @Multipart
    @POST("api/users/cardriver/signup")
    suspend fun driverSignup(
        @Part("full_name") fullName: RequestBody,
        @Part("primary_number") primaryNumber: RequestBody,
        @Part("password") password: RequestBody,
        @Part("address") address: RequestBody,
        @Part("city") city: RequestBody,
        @Part("pincode") pincode: RequestBody,
        @Part("licence_number") licenceNumber: RequestBody,
        @Part("vehicle_owner_id") vehicleOwnerId: RequestBody,
        @Part("secondary_number") secondaryNumber: RequestBody?,
        @Part licenceFrontImg: MultipartBody.Part
    ): DriverSignupResponse

    @GET("api/users/cardriver/me")
    suspend fun getDriverProfile(): DriverOut

    @PATCH("api/users/cardriver/status")
    suspend fun updateDriverStatus(
        @Body body: Map<String, String>   // {"status": "ONLINE"}
    ): DriverStatusUpdateResponse

    // ─── Auth — Admin ────────────────────────────────────────────────────────
    @POST("api/admin/signin")
    suspend fun adminSignin(@Body body: AdminSigninRequest): TokenResponse

    @GET("api/admin/settings/operational-toggles")
    suspend fun getOperationalToggles(): OperationalTogglesResponse

    @PUT("api/admin/settings/operational-toggles")
    suspend fun updateOperationalToggles(@Body body: Map<String, Any>): Map<String, Any>

    @GET("api/admin/orders")
    suspend fun getAdminOrders(): List<BaseOrder>

    @PATCH("api/admin/orders/{id}/assign")
    suspend fun adminAssignOrder(
        @Path("id") orderId: Int,
        @Body body: AdminAssignOrderRequest
    ): Map<String, Any>

    @PATCH("api/admin/rates/update")
    suspend fun adminUpdateRates(@Body body: AdminRateUpdateRequest): Map<String, Any>

    // ─── Orders — One-Way ────────────────────────────────────────────────────
    @POST("api/orders/oneway/quote")
    suspend fun onewayQuote(@Body body: OnewayQuoteRequest): OnewayQuoteResponse

    @POST("api/orders/oneway/confirm")
    suspend fun onewayConfirm(@Body body: OnewayConfirmRequest): OnewayConfirmResponse

    // ─── Orders — Round Trip ─────────────────────────────────────────────────
    @POST("api/orders/roundtrip/quote")
    suspend fun roundtripQuote(@Body body: RoundTripQuoteRequest): OnewayQuoteResponse

    @POST("api/orders/roundtrip/confirm")
    suspend fun roundtripConfirm(@Body body: RoundTripConfirmRequest): OnewayConfirmResponse

    // ─── Orders — Multi City ─────────────────────────────────────────────────
    @POST("api/orders/multicity/quote")
    suspend fun multicityQuote(@Body body: MulticityQuoteRequest): OnewayQuoteResponse

    @POST("api/orders/multicity/confirm")
    suspend fun multicityConfirm(@Body body: MulticityConfirmRequest): OnewayConfirmResponse

    // ─── Orders — Hourly ─────────────────────────────────────────────────────
    @GET("api/orders/rental_hrs_data")
    suspend fun getHourlyPackages(): Map<String, Any>

    @POST("api/orders/hourly/quote")
    suspend fun hourlyQuote(@Body body: HourlyRentalRequest): HourlyQuoteResponse

    @POST("api/orders/hourly/confirm")
    suspend fun hourlyConfirm(@Body body: HourlyRentalRequest): HourlyConfirmResponse

    // ─── Orders — Meta & Listing ─────────────────────────────────────────────
    @GET("api/orders/max-assignment-times")
    suspend fun getMaxAssignmentTimes(): MaxAssignmentTimesResponse

    @GET("api/orders/vendor")
    suspend fun getVendorOrders(): List<BaseOrder>

    @GET("api/orders/vendor/with-assignments")
    suspend fun getVendorOrdersWithAssignments(): List<OrderAssignmentWithOrderDetails>

    @GET("api/orders/vendor/{id}")
    suspend fun getVendorOrderDetail(@Path("id") orderId: Int): VendorOrderDetailResponse

    @GET("api/orders/pending-all")
    suspend fun getAllPendingOrders(): List<NewOrderResponse>

    @POST("api/orders/recreate")
    suspend fun recreateOrder(@Body body: RecreateOrderRequest): RecreateOrderResponse

    // ─── Zero-Cost Live Tracking API ──────────────────────────────────────────
    @POST("api/tracking/driver-location")
    suspend fun updateDriverLocation(@Body body: DriverLocationUpdateRequest): Map<String, Any>

    @GET("api/tracking/live-location/{bookingId}")
    suspend fun getLiveLocation(@Path("bookingId") bookingId: String): LiveTrackingResponse

    // ─── Assignments — Vehicle Owner ─────────────────────────────────────────
    @GET("api/assignments/vehicle_owner/pending")
    suspend fun getPendingOrdersForOwner(): List<PendingOrderForOwner>

    @GET("api/orders/vehicle-owner/pending")
    suspend fun getPendingOrdersForOwnerAlt(): List<PendingOrderForOwner>

    @GET("api/orders/vehicle-owner/non-pending")
    suspend fun getNonPendingOrdersForOwner(): List<OrderAssignmentWithOrderDetails>

    @POST("api/assignments/acceptorder")
    suspend fun acceptOrder(@Body body: AcceptOrderRequest): OrderAssignmentResponse

    @GET("api/assignments/available-drivers")
    suspend fun getAvailableDrivers(): List<AvailableDriverResponse>

    @GET("api/assignments/available-cars")
    suspend fun getAvailableCars(): List<AvailableCarResponse>

    @PATCH("api/assignments/{id}/assign-car-driver")
    suspend fun assignCarDriver(
        @Path("id") assignmentId: Int,
        @Body body: AssignCarDriverRequest
    ): OrderAssignmentResponse

    @PATCH("api/assignments/{id}/cancel")
    suspend fun cancelAssignment(@Path("id") assignmentId: Int): OrderAssignmentResponse

    @PATCH("api/assignments/vendor/cancel-order/{id}")
    suspend fun vendorCancelOrder(@Path("id") orderId: Int): Map<String, Any>

    // ─── Assignments — Driver ────────────────────────────────────────────────
    @GET("api/assignments/driver/assigned-orders")
    suspend fun getDriverAssignedOrders(): List<DriverOrderListResponse>

    @GET("api/assignments/driver/assigned/completed-trips")
    suspend fun getDriverCompletedTrips(): List<DriverOrderListResponse>

    @Multipart
    @POST("api/assignments/driver/start-trip/{orderId}")
    suspend fun startTrip(
        @Path("orderId") orderId: Int,
        @Part("start_km") startKm: RequestBody,
        @Part speedometerImg: MultipartBody.Part
    ): StartTripResponse

    @Multipart
    @POST("api/assignments/driver/end-trip/{orderId}")
    suspend fun endTrip(
        @Path("orderId") orderId: Int,
        @Path("end_km") endKm: RequestBody,
        @Part("toll_charge_update") tollChargeUpdate: RequestBody,
        @Part("updated_toll_charges") updatedTollCharges: RequestBody?,
        @Part("waiting_time") waitingTime: RequestBody?,
        @Part closeSpeedometerImg: MultipartBody.Part
    ): EndTripResponse

    @GET("api/assignments/driver/trip-history")
    suspend fun getDriverTripHistory(): List<Map<String, Any>>

    // ─── Car Details Management ──────────────────────────────────────────────
    @Multipart
    @POST("api/users/cardetails/signup")
    suspend fun addCarDetails(
        @Part("car_name") carName: RequestBody,
        @Part("car_type") carType: RequestBody,
        @Part("car_number") carNumber: RequestBody,
        @Part("year_of_the_car") yearOfTheCar: RequestBody?,
        @Part("vehicle_owner_id") vehicleOwnerId: RequestBody,
        @Part rcFrontImg: MultipartBody.Part,
        @Part rcBackImg: MultipartBody.Part,
        @Part insuranceImg: MultipartBody.Part,
        @Part fcImg: MultipartBody.Part,
        @Part carImg: MultipartBody.Part,
        @Part permitImg: MultipartBody.Part
    ): CarDetailsSignupResponse

    @GET("api/users/cardetails/all")
    suspend fun getCarDetailsAll(): List<CarDetails>

    @GET("api/users/cardetails/{id}")
    suspend fun getCarDetailsById(@Path("id") carId: String): CarDetails

    // ─── Wallet & Payments ───────────────────────────────────────────────────
    @POST("api/wallet/razorpay/order")
    suspend fun createRazorpayOrder(@Body body: CreateRazorpayOrderRequest): RazorpayOrderResponse

    @POST("api/wallet/razorpay/verify")
    suspend fun verifyRazorpayPayment(@Body body: VerifyRazorpayPaymentRequest): RazorpayTransactionOut

    @GET("api/wallet/balance")
    suspend fun getWalletBalance(): WalletBalance

    @GET("api/wallet/ledger")
    suspend fun getWalletLedger(): List<WalletLedgerEntry>

    @GET("api/vendor/wallet/history")
    suspend fun getVendorWalletHistory(): List<WalletHistory>

    // ─── Payout Transfers (Vendor) ────────────────────────────────────────────
    @POST("api/transfer/request")
    suspend fun requestTransfer(@Body body: TransferRequest): TransferTransaction

    @GET("api/transfer/balance")
    suspend fun getTransferBalance(): VendorBalance

    @GET("api/transfer/history")
    suspend fun getTransferHistory(): List<TransferTransaction>

    // ─── Cities ──────────────────────────────────────────────────────────────
    @GET("api/cities")
    suspend fun getCities(): List<CityResponse>

    // ─── Notifications ───────────────────────────────────────────────────────
    @POST("api/notifications/register-token")
    suspend fun registerFcmToken(@Body body: Map<String, String>): Map<String, Any>
}
