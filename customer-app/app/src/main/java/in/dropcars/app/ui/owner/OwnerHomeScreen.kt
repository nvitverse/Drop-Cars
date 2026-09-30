package in.dropcars.app.ui.owner

import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.padding
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.AccountBalanceWallet
import androidx.compose.material.icons.filled.AccountCircle
import androidx.compose.material.icons.filled.DirectionsCar
import androidx.compose.material.icons.filled.PendingActions
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import in.dropcars.app.ui.owner.fleet.OwnerFleetScreen
import in.dropcars.app.ui.owner.pending.OwnerPendingOrdersScreen
import in.dropcars.app.ui.owner.wallet.OwnerWalletScreen

@Composable
fun OwnerHomeScreen(
    onAssignDriverClick: (Int) -> Unit,
    onAddCarClick: () -> Unit,
    onAddDriverClick: () -> Unit,
    onLogout: () -> Unit
) {
    var selectedTab by remember { mutableStateIntOf(0) }

    Scaffold(
        bottomBar = {
            NavigationBar {
                NavigationBarItem(
                    selected = selectedTab == 0,
                    onClick = { selectedTab = 0 },
                    icon = { Icon(Icons.Default.PendingActions, contentDescription = "Pending Orders") },
                    label = { Text("Pending") }
                )
                NavigationBarItem(
                    selected = selectedTab == 1,
                    onClick = { selectedTab = 1 },
                    icon = { Icon(Icons.Default.DirectionsCar, contentDescription = "My Fleet") },
                    label = { Text("Fleet") }
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
                0 -> OwnerPendingOrdersScreen(onAssignDriverClick = onAssignDriverClick)
                1 -> OwnerFleetScreen(onAddCarClick = onAddCarClick, onAddDriverClick = onAddDriverClick)
                2 -> OwnerWalletScreen()
                3 -> OwnerProfileTab(onLogout = onLogout)
            }
        }
    }
}

@Composable
fun OwnerProfileTab(onLogout: () -> Unit) {
    Column(modifier = Modifier.padding(24.dp)) {
        Text("Vehicle Owner Profile", style = MaterialTheme.typography.headlineMedium)
        Button(
            onClick = onLogout,
            modifier = Modifier.padding(top = 16.dp),
            colors = ButtonDefaults.buttonColors(containerColor = MaterialTheme.colorScheme.error)
        ) {
            Text("Log Out")
        }
    }
}
