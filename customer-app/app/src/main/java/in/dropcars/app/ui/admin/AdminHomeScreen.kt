package in.dropcars.app.ui.admin

import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.padding
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.ListAlt
import androidx.compose.material.icons.filled.Settings
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import in.dropcars.app.ui.admin.dispatch.AdminDispatchScreen
import in.dropcars.app.ui.admin.settings.AdminRatesSettingsScreen

@Composable
fun AdminHomeScreen(
    onLogout: () -> Unit
) {
    var selectedTab by remember { mutableStateIntOf(0) }

    Scaffold(
        bottomBar = {
            NavigationBar {
                NavigationBarItem(
                    selected = selectedTab == 0,
                    onClick = { selectedTab = 0 },
                    icon = { Icon(Icons.Default.ListAlt, contentDescription = "Dispatch Queue") },
                    label = { Text("Dispatch") }
                )
                NavigationBarItem(
                    selected = selectedTab == 1,
                    onClick = { selectedTab = 1 },
                    icon = { Icon(Icons.Default.Settings, contentDescription = "System Settings") },
                    label = { Text("Rates & System") }
                )
            }
        }
    ) { innerPadding ->
        Surface(modifier = Modifier.padding(innerPadding)) {
            when (selectedTab) {
                0 -> AdminDispatchScreen()
                1 -> AdminRatesSettingsScreen()
            }
        }
    }
}
