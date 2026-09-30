package in.dropcars.app.ui.owner.pending

import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import in.dropcars.app.data.model.PendingOrderForOwner
import in.dropcars.app.ui.theme.DropCarsTheme
import in.dropcars.app.ui.theme.GreenSuccess

@Composable
fun OwnerPendingOrdersScreen(
    onAssignDriverClick: (Int) -> Unit,
    viewModel: OwnerPendingOrdersViewModel = hiltViewModel()
) {
    val uiState by viewModel.uiState.collectAsState()

    Surface(
        modifier = Modifier.fillMaxSize(),
        color = MaterialTheme.colorScheme.background
    ) {
        Column(modifier = Modifier.fillMaxSize().padding(16.dp)) {
            Text(
                text = "Available Trip Orders",
                style = MaterialTheme.typography.headlineMedium,
                color = MaterialTheme.colorScheme.onSurface,
                modifier = Modifier.padding(bottom = 16.dp)
            )

            when (val state = uiState) {
                is PendingOrdersUiState.Loading -> CircularProgressIndicator()
                is PendingOrdersUiState.Error -> Text(state.message, color = MaterialTheme.colorScheme.error)
                is PendingOrdersUiState.Success -> {
                    if (state.orders.isEmpty()) {
                        Box(modifier = Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
                            Text("No pending orders available in your city.")
                        }
                    } else {
                        LazyColumn(verticalArrangement = Arrangement.spacedBy(12.dp)) {
                            items(state.orders) { order ->
                                OwnerPendingOrderCard(
                                    order = order,
                                    onAccept = {
                                        viewModel.acceptOrder(order.order_id)
                                        onAssignDriverClick(order.order_id)
                                    }
                                )
                            }
                        }
                    }
                }
            }
        }
    }
}

@Composable
fun OwnerPendingOrderCard(
    order: PendingOrderForOwner,
    onAccept: () -> Unit
) {
    val pickup = order.pickup_drop_location["0"] ?: ""
    val drop = order.pickup_drop_location["1"] ?: ""

    Card(
        modifier = Modifier.fillMaxWidth(),
        shape = DropCarsTheme.CornerLg,
        colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surfaceVariant)
    ) {
        Column(modifier = Modifier.padding(16.dp)) {
            Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
                Text("Order #${order.order_id}", style = MaterialTheme.typography.titleLarge)
                Text("Earn: ₹${order.driver_price}", style = MaterialTheme.typography.titleLarge, color = GreenSuccess)
            }

            Spacer(modifier = Modifier.height(8.dp))
            Text("$pickup ➔ $drop", style = MaterialTheme.typography.bodyLarge)
            Text("${order.trip_type} • ${order.car_type}", style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.onSurfaceVariant)
            Text("Start: ${order.start_date_time}", style = MaterialTheme.typography.bodyMedium)

            Button(
                onClick = onAccept,
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(top = 12.dp),
                shape = DropCarsTheme.CornerMd
            ) {
                Text("Accept Order")
            }
        }
    }
}
