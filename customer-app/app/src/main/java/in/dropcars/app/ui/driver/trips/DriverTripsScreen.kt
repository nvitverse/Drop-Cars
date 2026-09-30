package in.dropcars.app.ui.driver.trips

import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import in.dropcars.app.data.model.DriverOrderListResponse
import in.dropcars.app.ui.components.StatusBadge
import in.dropcars.app.ui.theme.DropCarsTheme

@Composable
fun DriverTripsScreen(
    onTripClick: (Int) -> Unit,
    viewModel: DriverTripsViewModel = hiltViewModel()
) {
    val uiState by viewModel.uiState.collectAsState()
    val isOnline by viewModel.driverOnlineStatus.collectAsState()

    Surface(
        modifier = Modifier.fillMaxSize(),
        color = MaterialTheme.colorScheme.background
    ) {
        Column(modifier = Modifier.fillMaxSize().padding(16.dp)) {
            Row(
                modifier = Modifier.fillMaxWidth().padding(bottom = 16.dp),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically
            ) {
                Text("Assigned Trips", style = MaterialTheme.typography.headlineMedium)
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Text(if (isOnline) "ONLINE" else "OFFLINE", style = MaterialTheme.typography.labelLarge)
                    Spacer(modifier = Modifier.width(8.dp))
                    Switch(checked = isOnline, onCheckedChange = { viewModel.toggleOnlineStatus(it) })
                }
            }

            when (val state = uiState) {
                is DriverTripsState.Loading -> CircularProgressIndicator()
                is DriverTripsState.Error -> Text(state.message, color = MaterialTheme.colorScheme.error)
                is DriverTripsState.Success -> {
                    if (state.assignedTrips.isEmpty()) {
                        Box(modifier = Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
                            Text("No assigned trips currently.")
                        }
                    } else {
                        LazyColumn(verticalArrangement = Arrangement.spacedBy(12.dp)) {
                            items(state.assignedTrips) { trip ->
                                DriverTripItemCard(trip = trip, onClick = { onTripClick(trip.order_id) })
                            }
                        }
                    }
                }
            }
        }
    }
}

@Composable
fun DriverTripItemCard(trip: DriverOrderListResponse, onClick: () -> Unit) {
    val pickup = trip.pickup_drop_location["0"] ?: ""
    val drop = trip.pickup_drop_location["1"] ?: ""

    Card(
        modifier = Modifier.fillMaxWidth().clickable { onClick() },
        shape = DropCarsTheme.CornerLg,
        colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surfaceVariant)
    ) {
        Column(modifier = Modifier.padding(16.dp)) {
            Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
                Text("Order #${trip.order_id}", style = MaterialTheme.typography.titleLarge)
                StatusBadge(status = trip.trip_status)
            }
            Spacer(modifier = Modifier.height(8.dp))
            Text("$pickup ➔ $drop", style = MaterialTheme.typography.bodyLarge)
            Text("${trip.trip_type} • ${trip.car_type}", style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.onSurfaceVariant)
            Text("Customer: ${trip.customer_name} (${trip.customer_number})", style = MaterialTheme.typography.bodyMedium)
        }
    }
}
