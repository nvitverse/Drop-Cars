package in.dropcars.app.ui.driver.trips

import androidx.compose.foundation.layout.*
import androidx.compose.material3.*
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import in.dropcars.app.ui.components.DropCarsTopBar
import in.dropcars.app.ui.components.OsmMapView
import in.dropcars.app.ui.theme.DropCarsTheme

@Composable
fun ActiveTripDetailScreen(
    orderId: Int,
    onStartTripClick: (Int) -> Unit,
    onEndTripClick: (Int) -> Unit,
    onBackClick: () -> Unit,
    viewModel: DriverTripsViewModel = hiltViewModel()
) {
    val uiState by viewModel.uiState.collectAsState()
    val trip = (uiState as? DriverTripsState.Success)?.assignedTrips?.find { it.order_id == orderId }

    Scaffold(
        topBar = { DropCarsTopBar(title = "Trip #${orderId}", onBackClick = onBackClick) }
    ) { innerPadding ->
        Column(
            modifier = Modifier
                .fillMaxSize()
                .padding(innerPadding)
                .padding(16.dp),
            verticalArrangement = Arrangement.spacedBy(16.dp)
        ) {
            OsmMapView()

            trip?.let { t ->
                Card(
                    modifier = Modifier.fillMaxWidth(),
                    shape = DropCarsTheme.CornerLg,
                    colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surfaceVariant)
                ) {
                    Column(modifier = Modifier.padding(16.dp)) {
                        Text("Customer: ${t.customer_name}", style = MaterialTheme.typography.titleLarge)
                        Text("Phone: ${t.customer_number}", style = MaterialTheme.typography.bodyLarge)
                        Text("Trip Type: ${t.trip_type} (${t.car_type})", style = MaterialTheme.typography.bodyMedium)
                        t.pickup_notes?.let { Text("Notes: $it", style = MaterialTheme.typography.bodyMedium) }
                    }
                }

                Row(horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                    Button(
                        onClick = { onStartTripClick(orderId) },
                        modifier = Modifier.weight(1f).height(50.dp),
                        shape = DropCarsTheme.CornerMd
                    ) {
                        Text("Start Trip")
                    }

                    Button(
                        onClick = { onEndTripClick(orderId) },
                        modifier = Modifier.weight(1f).height(50.dp),
                        colors = ButtonDefaults.buttonColors(containerColor = MaterialTheme.colorScheme.primary),
                        shape = DropCarsTheme.CornerMd
                    ) {
                        Text("End Trip")
                    }
                }
            } ?: Text("Loading trip details...")
        }
    }
}
