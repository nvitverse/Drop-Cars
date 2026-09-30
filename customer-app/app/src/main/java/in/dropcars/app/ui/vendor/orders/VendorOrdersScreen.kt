package in.dropcars.app.ui.vendor.orders

import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material3.*
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import in.dropcars.app.data.model.BaseOrder
import in.dropcars.app.ui.components.StatusBadge
import in.dropcars.app.ui.theme.DropCarsTheme

@Composable
fun VendorOrdersScreen(
    onOrderClick: (Int) -> Unit,
    viewModel: VendorOrdersViewModel = hiltViewModel()
) {
    val uiState by viewModel.uiState.collectAsState()

    Surface(
        modifier = Modifier.fillMaxSize(),
        color = MaterialTheme.colorScheme.background
    ) {
        Column(modifier = Modifier.fillMaxSize().padding(16.dp)) {
            Text(
                text = "My Bookings",
                style = MaterialTheme.typography.headlineMedium,
                color = MaterialTheme.colorScheme.onSurface,
                modifier = Modifier.padding(bottom = 16.dp)
            )

            when (val state = uiState) {
                is VendorOrdersUiState.Loading -> {
                    Box(modifier = Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
                        CircularProgressIndicator()
                    }
                }
                is VendorOrdersUiState.Error -> {
                    Column(
                        modifier = Modifier.fillMaxSize(),
                        verticalArrangement = Arrangement.Center,
                        horizontalAlignment = Alignment.CenterHorizontally
                    ) {
                        Text(text = state.message, color = MaterialTheme.colorScheme.error)
                        Button(onClick = { viewModel.fetchOrders() }, modifier = Modifier.padding(top = 16.dp)) {
                            Text("Retry")
                        }
                    }
                }
                is VendorOrdersUiState.Success -> {
                    if (state.orders.isEmpty()) {
                        Box(modifier = Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
                            Text("No bookings found.", style = MaterialTheme.typography.bodyLarge)
                        }
                    } else {
                        LazyColumn(verticalArrangement = Arrangement.spacedBy(12.dp)) {
                            items(state.orders) { order ->
                                VendorOrderItemCard(
                                    order = order,
                                    onClick = { onOrderClick(order.id) },
                                    onCancel = { viewModel.cancelOrder(order.id) },
                                    onRecreate = { viewModel.recreateOrder(order.id) }
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
fun VendorOrderItemCard(
    order: BaseOrder,
    onClick: () -> Unit,
    onCancel: () -> Unit,
    onRecreate: () -> Unit
) {
    val pickup = order.pickup_drop_location["0"] ?: ""
    val drop = order.pickup_drop_location["1"] ?: ""

    Card(
        modifier = Modifier
            .fillMaxWidth()
            .clickable { onClick() },
        shape = DropCarsTheme.CornerLg,
        colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surfaceVariant)
    ) {
        Column(modifier = Modifier.padding(16.dp)) {
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically
            ) {
                Text(
                    text = "Order #${order.id}",
                    style = MaterialTheme.typography.titleLarge,
                    color = MaterialTheme.colorScheme.onSurface
                )
                StatusBadge(status = order.trip_status)
            }

            Spacer(modifier = Modifier.height(8.dp))

            Text(
                text = "$pickup ➔ $drop",
                style = MaterialTheme.typography.bodyLarge,
                color = MaterialTheme.colorScheme.onSurface
            )

            Text(
                text = "${order.trip_type} • ${order.car_type}",
                style = MaterialTheme.typography.bodyMedium,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
                modifier = Modifier.padding(top = 4.dp)
            )

            Text(
                text = "Customer: ${order.customer_name} (${order.customer_number})",
                style = MaterialTheme.typography.bodyMedium,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
                modifier = Modifier.padding(top = 4.dp)
            )

            Row(
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(top = 12.dp),
                horizontalArrangement = Arrangement.End
            ) {
                if (order.trip_status == "AUTO_CANCELLED") {
                    TextButton(onClick = onRecreate) {
                        Text("Recreate Order")
                    }
                } else if (order.trip_status == "PENDING" || order.trip_status == "ACCEPTED") {
                    TextButton(onClick = onCancel, colors = ButtonDefaults.textButtonColors(contentColor = MaterialTheme.colorScheme.error)) {
                        Text("Cancel Order")
                    }
                }
            }
        }
    }
}
