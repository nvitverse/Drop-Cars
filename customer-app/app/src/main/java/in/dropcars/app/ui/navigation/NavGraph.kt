package in.dropcars.app.ui.navigation

import androidx.compose.runtime.Composable
import androidx.navigation.NavHostController
import androidx.navigation.NavType
import androidx.navigation.compose.NavHost
import androidx.navigation.compose.composable
import androidx.navigation.navArgument
import in.dropcars.app.data.local.AuthTokenManager
import in.dropcars.app.data.model.UserRole
import in.dropcars.app.ui.admin.AdminHomeScreen
import in.dropcars.app.ui.admin.auth.AdminLoginScreen
import in.dropcars.app.ui.customer.referral.ReferralScreen
import in.dropcars.app.ui.driver.DriverHomeScreen
import in.dropcars.app.ui.driver.auth.DriverLoginScreen
import in.dropcars.app.ui.driver.trips.ActiveTripDetailScreen
import in.dropcars.app.ui.driver.trips.EndTripScreen
import in.dropcars.app.ui.driver.trips.StartTripScreen
import in.dropcars.app.ui.owner.OwnerHomeScreen
import in.dropcars.app.ui.owner.auth.OwnerLoginScreen
import in.dropcars.app.ui.owner.auth.OwnerSignupScreen
import in.dropcars.app.ui.owner.fleet.AddCarScreen
import in.dropcars.app.ui.owner.fleet.AddDriverScreen
import in.dropcars.app.ui.owner.pending.AssignDriverCarScreen
import in.dropcars.app.ui.screens.RoleSelectionScreen
import in.dropcars.app.ui.screens.SplashScreen
import in.dropcars.app.ui.vendor.VendorHomeScreen
import in.dropcars.app.ui.vendor.auth.VendorLoginScreen
import in.dropcars.app.ui.vendor.auth.VendorSignupScreen
import in.dropcars.app.ui.vendor.orders.VendorOrderDetailScreen

@Composable
fun DropCarsNavGraph(
    navController: NavHostController,
    tokenManager: AuthTokenManager
) {
    NavHost(
        navController = navController,
        startDestination = Screen.Splash.route
    ) {
        composable(Screen.Splash.route) {
            SplashScreen(
                tokenManager = tokenManager,
                onRoleSelected = { role ->
                    when (role) {
                        UserRole.VENDOR -> navController.navigate(Screen.VendorHome.route) { popUpTo(0) }
                        UserRole.VEHICLE_OWNER -> navController.navigate(Screen.OwnerHome.route) { popUpTo(0) }
                        UserRole.DRIVER -> navController.navigate(Screen.DriverHome.route) { popUpTo(0) }
                        UserRole.ADMIN -> navController.navigate(Screen.AdminHome.route) { popUpTo(0) }
                        else -> navController.navigate(Screen.RoleSelection.route) { popUpTo(0) }
                    }
                }
            )
        }

        composable(Screen.RoleSelection.route) {
            RoleSelectionScreen(
                onVendorSelected = { navController.navigate(Screen.VendorLogin.route) },
                onOwnerSelected = { navController.navigate(Screen.OwnerLogin.route) },
                onDriverSelected = { navController.navigate(Screen.DriverLogin.route) }
            )
        }

        composable(Screen.Referral.route) {
            ReferralScreen(onBackClick = { navController.popBackStack() })
        }

        // ─── Vendor Flow ───────────────────────────────────────────────────────
        composable(Screen.VendorLogin.route) {
            VendorLoginScreen(
                onLoginSuccess = { navController.navigate(Screen.VendorHome.route) { popUpTo(0) } },
                onNavigateSignup = { navController.navigate(Screen.VendorSignup.route) },
                onBackClick = { navController.popBackStack() }
            )
        }

        composable(Screen.VendorSignup.route) {
            VendorSignupScreen(
                onSignupSuccess = { navController.navigate(Screen.VendorHome.route) { popUpTo(0) } },
                onBackClick = { navController.popBackStack() }
            )
        }

        composable(Screen.VendorHome.route) {
            VendorHomeScreen(
                onNavigateOrderDetail = { orderId -> navController.navigate(Screen.VendorOrderDetail.createRoute(orderId)) },
                onLogout = {
                    tokenManager.clearAuth()
                    navController.navigate(Screen.RoleSelection.route) { popUpTo(0) }
                }
            )
        }

        composable(
            route = Screen.VendorOrderDetail.route,
            arguments = listOf(navArgument("orderId") { type = NavType.IntType })
        ) { backStackEntry ->
            val orderId = backStackEntry.arguments?.getInt("orderId") ?: 0
            VendorOrderDetailScreen(
                orderId = orderId,
                onBackClick = { navController.popBackStack() }
            )
        }

        // ─── Vehicle Owner Flow ────────────────────────────────────────────────
        composable(Screen.OwnerLogin.route) {
            OwnerLoginScreen(
                onLoginSuccess = { navController.navigate(Screen.OwnerHome.route) { popUpTo(0) } },
                onNavigateSignup = { navController.navigate(Screen.OwnerSignup.route) },
                onBackClick = { navController.popBackStack() }
            )
        }

        composable(Screen.OwnerSignup.route) {
            OwnerSignupScreen(
                onSignupSuccess = { navController.navigate(Screen.OwnerHome.route) { popUpTo(0) } },
                onBackClick = { navController.popBackStack() }
            )
        }

        composable(Screen.OwnerHome.route) {
            OwnerHomeScreen(
                onAssignDriverClick = { assignmentId -> navController.navigate(Screen.AssignDriverCar.createRoute(assignmentId)) },
                onAddCarClick = { navController.navigate(Screen.AddCar.route) },
                onAddDriverClick = { navController.navigate(Screen.AddDriver.route) },
                onLogout = {
                    tokenManager.clearAuth()
                    navController.navigate(Screen.RoleSelection.route) { popUpTo(0) }
                }
            )
        }

        composable(
            route = Screen.AssignDriverCar.route,
            arguments = listOf(navArgument("assignmentId") { type = NavType.IntType })
        ) { backStackEntry ->
            val assignmentId = backStackEntry.arguments?.getInt("assignmentId") ?: 0
            AssignDriverCarScreen(
                assignmentId = assignmentId,
                onBackClick = { navController.popBackStack() }
            )
        }

        composable(Screen.AddCar.route) {
            AddCarScreen(onBackClick = { navController.popBackStack() })
        }

        composable(Screen.AddDriver.route) {
            AddDriverScreen(onBackClick = { navController.popBackStack() })
        }

        // ─── Driver Flow ───────────────────────────────────────────────────────
        composable(Screen.DriverLogin.route) {
            DriverLoginScreen(
                onLoginSuccess = { navController.navigate(Screen.DriverHome.route) { popUpTo(0) } },
                onBackClick = { navController.popBackStack() }
            )
        }

        composable(Screen.DriverHome.route) {
            DriverHomeScreen(
                onTripClick = { orderId -> navController.navigate(Screen.ActiveTripDetail.createRoute(orderId)) },
                onLogout = {
                    tokenManager.clearAuth()
                    navController.navigate(Screen.RoleSelection.route) { popUpTo(0) }
                }
            )
        }

        composable(
            route = Screen.ActiveTripDetail.route,
            arguments = listOf(navArgument("orderId") { type = NavType.IntType })
        ) { backStackEntry ->
            val orderId = backStackEntry.arguments?.getInt("orderId") ?: 0
            ActiveTripDetailScreen(
                orderId = orderId,
                onStartTripClick = { id -> navController.navigate(Screen.StartTrip.createRoute(id)) },
                onEndTripClick = { id -> navController.navigate(Screen.EndTrip.createRoute(id)) },
                onBackClick = { navController.popBackStack() }
            )
        }

        composable(
            route = Screen.StartTrip.route,
            arguments = listOf(navArgument("orderId") { type = NavType.IntType })
        ) { backStackEntry ->
            val orderId = backStackEntry.arguments?.getInt("orderId") ?: 0
            StartTripScreen(
                orderId = orderId,
                onBackClick = { navController.popBackStack() }
            )
        }

        composable(
            route = Screen.EndTrip.route,
            arguments = listOf(navArgument("orderId") { type = NavType.IntType })
        ) { backStackEntry ->
            val orderId = backStackEntry.arguments?.getInt("orderId") ?: 0
            EndTripScreen(
                orderId = orderId,
                onBackClick = { navController.popBackStack() }
            )
        }

        // ─── Admin Dual-Dimension Flow ─────────────────────────────────────────
        composable(Screen.AdminLogin.route) {
            AdminLoginScreen(
                onLoginSuccess = { navController.navigate(Screen.AdminHome.route) { popUpTo(0) } },
                onBackClick = { navController.popBackStack() }
            )
        }

        composable(Screen.AdminHome.route) {
            AdminHomeScreen(
                onLogout = {
                    tokenManager.clearAuth()
                    navController.navigate(Screen.RoleSelection.route) { popUpTo(0) }
                }
            )
        }
    }
}
