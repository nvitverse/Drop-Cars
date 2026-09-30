package in.dropcars.app.ui.navigation

sealed class Screen(val route: String) {
    object Splash : Screen("splash")
    object RoleSelection : Screen("role_selection")

    // Customer & Referral
    object CustomerHome : Screen("customer_home")
    object Referral : Screen("referral")
    object LiveTracking : Screen("live_tracking/{bookingId}") {
        fun createRoute(bookingId: String) = "live_tracking/$bookingId"
    }

    // Vendor Graph
    object VendorLogin : Screen("vendor_login")
    object VendorSignup : Screen("vendor_signup")
    object VendorHome : Screen("vendor_home")
    object VendorOrderDetail : Screen("vendor_order_detail/{orderId}") {
        fun createRoute(orderId: Int) = "vendor_order_detail/$orderId"
    }

    // Vehicle Owner Graph
    object OwnerLogin : Screen("owner_login")
    object OwnerSignup : Screen("owner_signup")
    object OwnerHome : Screen("owner_home")
    object AssignDriverCar : Screen("assign_driver_car/{assignmentId}") {
        fun createRoute(assignmentId: Int) = "assign_driver_car/$assignmentId"
    }
    object AddCar : Screen("add_car")
    object AddDriver : Screen("add_driver")

    // Driver Graph
    object DriverLogin : Screen("driver_login")
    object DriverHome : Screen("driver_home")
    object ActiveTripDetail : Screen("active_trip_detail/{orderId}") {
        fun createRoute(orderId: Int) = "active_trip_detail/$orderId"
    }
    object StartTrip : Screen("start_trip/{orderId}") {
        fun createRoute(orderId: Int) = "start_trip/$orderId"
    }
    object EndTrip : Screen("end_trip/{orderId}") {
        fun createRoute(orderId: Int) = "end_trip/$orderId"
    }

    // Dual-Dimension Admin Graph
    object AdminLogin : Screen("admin_login")
    object AdminHome : Screen("admin_home")
}
