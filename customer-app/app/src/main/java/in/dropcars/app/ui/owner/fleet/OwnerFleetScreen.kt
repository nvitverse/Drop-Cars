package in.dropcars.app.ui.owner.fleet

import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Add
import androidx.compose.material.icons.filled.PersonAdd
import androidx.compose.material3.*
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import in.dropcars.app.data.model.CarDetails
import in.dropcars.app.ui.components.StatusBadge
import in.dropcars.app.ui.theme.DropCarsTheme

@Composable
fun OwnerFleetScreen(
    onAddCarClick: () -> Unit,
    onAddDriverClick: () -> Unit,
    viewModel: OwnerFleetViewModel = hiltViewModel()
) {
    val uiState by viewModel.uiState.collectAsState()

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
                Text("Fleet Vehicles", style = MaterialTheme.typography.headlineMedium)
                Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    IconButton(onClick = onAddDriverClick) {
                        Icon(Icons.Default.PersonAdd, contentDescription = "Add Driver")
                    }
                    FloatingActionButton(onClick = onAddCarClick, containerColor = MaterialTheme.colorScheme.primary) {
                        Icon(Icons.Default.Add, contentDescription = "Add Car")
                    }
                }
            }

            when (val state = uiState) {
                is FleetUiState.Loading -> CircularProgressIndicator()
                is FleetUiState.Error -> Text(state.message, color = MaterialTheme.colorScheme.error)
                is FleetUiState.Success -> {
                    if (state.cars.isEmpty()) {
                        Box(modifier = Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
                            Text("No vehicles registered in your fleet.")
                        }
                    } else {
                        LazyColumn(verticalArrangement = Arrangement.spacedBy(12.dp)) {
                            items(state.cars) { car ->
                                FleetCarCard(car = car)
                            }
                        }
                    }
                }
            }
        }
    }
}

@Composable
fun FleetCarCard(car: CarDetails) {
    Card(
        modifier = Modifier.fillMaxWidth(),
        shape = DropCarsTheme.CornerLg,
        colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surfaceVariant)
    ) {
        Column(modifier = Modifier.padding(16.dp)) {
            Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
                Text(car.car_name, style = MaterialTheme.typography.titleLarge)
                StatusBadge(status = car.car_status)
            }
            Text("Number: ${car.car_number}", style = MaterialTheme.typography.bodyLarge)
            Text("Type: ${car.car_type}", style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.onSurfaceVariant)
            Text("RC Status: ${car.rc_front_status ?: "PENDING"}", style = MaterialTheme.typography.bodyMedium)
        }
    }
}
