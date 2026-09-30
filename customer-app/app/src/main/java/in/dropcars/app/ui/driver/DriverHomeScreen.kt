package in.dropcars.app.ui.driver

import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.padding
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.AccountCircle
import androidx.compose.material.icons.filled.DirectionsCar
import androidx.compose.material.icons.filled.History
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import in.dropcars.app.ui.driver.trips.DriverTripsScreen

@Composable
fun DriverHomeScreen(
    onTripClick: (Int) -> Unit,
    onLogout: () -> Unit
) {
    var selectedTab by remember { mutableStateIntOf(0) }

    Scaffold(
        bottomBar = {
            NavigationBar {
                NavigationBarItem(
                    selected = selectedTab == 0,
                    onClick = { selectedTab = 0 },
                    icon = { Icon(Icons.Default.DirectionsCar, contentDescription = "Active Trips") },
                    label = { Text("My Trips") }
                )
                NavigationBarItem(
                    selected = selectedTab == 1,
                    onClick = { selectedTab = 1 },
                    icon = { Icon(Icons.Default.History, contentDescription = "Trip History") },
                    label = { Text("History") }
                )
                NavigationBarItem(
                    selected = selectedTab == 2,
                    onClick = { selectedTab = 2 },
                    icon = { Icon(Icons.Default.AccountCircle, contentDescription = "Profile") },
                    label = { Text("Profile") }
                )
            }
        }
    ) { innerPadding ->
        Surface(modifier = Modifier.padding(innerPadding)) {
            when (selectedTab) {
                0 -> DriverTripsScreen(onTripClick = onTripClick)
                1 -> DriverHistoryTab()
                2 -> DriverProfileTab(onLogout = onLogout)
            }
        }
    }
}

@Composable
fun DriverHistoryTab() {
    Column(modifier = Modifier.padding(16.dp)) {
        Text("Completed Trip History", style = MaterialTheme.typography.headlineMedium)
        Spacer(modifier = Modifier.padding(top = 16.dp))
        Text("Your past completed trips will be listed here.", style = MaterialTheme.typography.bodyMedium)
    }
}

@Composable
fun DriverProfileTab(onLogout: () -> Unit) {
    Column(modifier = Modifier.padding(24.dp)) {
        Text("Driver Profile", style = MaterialTheme.typography.headlineMedium)
        Button(
            onClick = onLogout,
            modifier = Modifier.padding(top = 16.dp),
            colors = ButtonDefaults.buttonColors(containerColor = MaterialTheme.colorScheme.error)
        ) {
            Text("Log Out")
        }
    }
}
