package in.dropcars.app.ui.vendor

import androidx.compose.foundation.layout.padding
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.AccountCircle
import androidx.compose.material.icons.filled.AddCircle
import androidx.compose.material.icons.filled.ListAlt
import androidx.compose.material.icons.filled.AccountBalanceWallet
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Modifier
import in.dropcars.app.ui.vendor.neworder.NewOrderScreen
import in.dropcars.app.ui.vendor.orders.VendorOrdersScreen
import in.dropcars.app.ui.vendor.wallet.VendorWalletScreen

@Composable
fun VendorHomeScreen(
    onNavigateOrderDetail: (Int) -> Unit,
    onLogout: () -> Unit
) {
    var selectedTab by remember { mutableStateIntOf(0) }

    Scaffold(
        bottomBar = {
            NavigationBar {
                NavigationBarItem(
                    selected = selectedTab == 0,
                    onClick = { selectedTab = 0 },
                    icon = { Icon(Icons.Default.AddCircle, contentDescription = "New Booking") },
                    label = { Text("New Order") }
                )
                NavigationBarItem(
                    selected = selectedTab == 1,
                    onClick = { selectedTab = 1 },
                    icon = { Icon(Icons.Default.ListAlt, contentDescription = "My Orders") },
                    label = { Text("Bookings") }
                )
                NavigationBarItem(
                    selected = selectedTab == 2,
                    onClick = { selectedTab = 2 },
                    icon = { Icon(Icons.Default.AccountBalanceWallet, contentDescription = "Wallet") },
                    label = { Text("Wallet") }
                )
                NavigationBarItem(
                    selected = selectedTab == 3,
                    onClick = { selectedTab = 3 },
                    icon = { Icon(Icons.Default.AccountCircle, contentDescription = "Profile") },
                    label = { Text("Profile") }
                )
            }
        }
    ) { innerPadding ->
        Surface(modifier = Modifier.padding(innerPadding)) {
            when (selectedTab) {
                0 -> NewOrderScreen(onOrderConfirmed = { orderId -> onNavigateOrderDetail(orderId) })
                1 -> VendorOrdersScreen(onOrderClick = onNavigateOrderDetail)
                2 -> VendorWalletScreen()
                3 -> VendorProfileTab(onLogout = onLogout)
            }
        }
    }
}

@Composable
fun VendorProfileTab(onLogout: () -> Unit) {
    Column(
        modifier = Modifier.padding(24.dp)
    ) {
        Text("Vendor Profile", style = MaterialTheme.typography.headlineMedium)
        Spacer(modifier = Modifier.padding(top = 16.dp))
        Button(
            onClick = onLogout,
            colors = ButtonDefaults.buttonColors(containerColor = MaterialTheme.colorScheme.error)
        ) {
            Text("Log Out")
        }
    }
}
