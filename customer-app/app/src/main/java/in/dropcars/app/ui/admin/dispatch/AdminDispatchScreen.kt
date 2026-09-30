package in.dropcars.app.ui.admin.dispatch

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
import in.dropcars.app.ui.theme.Amber
import in.dropcars.app.ui.theme.DropCarsTheme
import in.dropcars.app.ui.theme.RedDanger

@Composable
fun AdminDispatchScreen(
    viewModel: AdminDispatchViewModel = hiltViewModel()
) {
    val uiState by viewModel.uiState.collectAsState()
    val timerSecs by viewModel.escalationTimerSeconds.collectAsState()
    val isAutoEscalated by viewModel.autoEscalated.collectAsState()

    val minutes = timerSecs / 60
    val seconds = timerSecs % 60
    val timerFormatted = "%02d:%02d".format(minutes, seconds)

    Surface(
        modifier = Modifier.fillMaxSize(),
        color = MaterialTheme.colorScheme.background
    ) {
        Column(modifier = Modifier.fillMaxSize().padding(16.dp)) {
            Text("Operational Dispatch Queue", style = MaterialTheme.typography.headlineMedium)

            // Escalation Timer Banner
            Card(
                modifier = Modifier.fillMaxWidth().padding(vertical = 12.dp),
                shape = DropCarsTheme.CornerMd,
                colors = CardDefaults.cardColors(containerColor = if (isAutoEscalated) RedDanger.copy(alpha = 0.2f) else Amber.copy(alpha = 0.2f))
            ) {
                Row(
                    modifier = Modifier.padding(16.dp),
                    horizontalArrangement = Arrangement.SpaceBetween,
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    Column {
                        Text("Escalation Alarm Timer", style = MaterialTheme.typography.titleMedium)
                        Text(
                            text = if (isAutoEscalated) "⚠️ AUTO-BROADCAST TO ALL DRIVERS ACTIVE" else "Manual dispatch timer running",
                            style = MaterialTheme.typography.bodyMedium
                        )
                    }
                    Text(timerFormatted, style = MaterialTheme.typography.headlineLarge, color = if (isAutoEscalated) RedDanger else Amber)
                }
            }

            when (val state = uiState) {
                is AdminOrdersState.Loading -> CircularProgressIndicator()
                is AdminOrdersState.Error -> Text(state.message, color = MaterialTheme.colorScheme.error)
                is AdminOrdersState.Success -> {
                    LazyColumn(verticalArrangement = Arrangement.spacedBy(12.dp)) {
                        items(state.orders) { order ->
                            AdminOrderItemCard(order = order, onAssign = { viewModel.assignOrder(order.id, null, null, null) })
                        }
                    }
                }
            }
        }
    }
}

@Composable
fun AdminOrderItemCard(order: BaseOrder, onAssign: () -> Unit) {
    val pickup = order.pickup_drop_location["0"] ?: ""
    val drop = order.pickup_drop_location["1"] ?: ""

    Card(
        modifier = Modifier.fillMaxWidth(),
        shape = DropCarsTheme.CornerLg,
        colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surfaceVariant)
    ) {
        Column(modifier = Modifier.padding(16.dp)) {
            Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
                Text("Order #${order.id}", style = MaterialTheme.typography.titleLarge)
                StatusBadge(status = order.trip_status)
            }
            Text("$pickup ➔ $drop", style = MaterialTheme.typography.bodyLarge)
            Text("${order.trip_type} • ${order.car_type}", style = MaterialTheme.typography.bodyMedium)
            Text("Customer: ${order.customer_name} (${order.customer_number})", style = MaterialTheme.typography.bodyMedium)

            Button(
                onClick = onAssign,
                modifier = Modifier.fillMaxWidth().padding(top = 12.dp),
                shape = DropCarsTheme.CornerMd
            ) {
                Text("Assign to Driver / Vehicle Owner")
            }
        }
    }
}
