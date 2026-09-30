package in.dropcars.app.ui.vendor.orders

import androidx.compose.foundation.layout.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import in.dropcars.app.data.model.VendorOrderDetailResponse
import in.dropcars.app.ui.components.DropCarsTopBar
import in.dropcars.app.ui.components.FareBreakdownCard
import in.dropcars.app.ui.components.StatusBadge
import in.dropcars.app.ui.theme.DropCarsTheme
import in.dropcars.app.ui.theme.GreenSuccess

@Composable
fun VendorOrderDetailScreen(
    orderId: Int,
    onBackClick: () -> Unit,
    viewModel: VendorOrdersViewModel = hiltViewModel()
) {
    val detailState by viewModel.orderDetailState.collectAsState()

    LaunchedEffect(orderId) {
        viewModel.loadVendorOrderDetail(orderId)
    }

    Scaffold(
        topBar = { DropCarsTopBar(title = "Order #$orderId Details", onBackClick = onBackClick) }
    ) { innerPadding ->
        Surface(
            modifier = Modifier
                .fillMaxSize()
                .padding(innerPadding),
            color = MaterialTheme.colorScheme.background
        ) {
            when (val state = detailState) {
                is VendorOrderDetailUiState.Loading -> {
                    Box(modifier = Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
                        CircularProgressIndicator()
                    }
                }
                is VendorOrderDetailUiState.Error -> {
                    Box(modifier = Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
                        Text(state.message, color = MaterialTheme.colorScheme.error)
                    }
                }
                is VendorOrderDetailUiState.Success -> {
                    VendorOrderDetailContent(detail = state.detail)
                }
            }
        }
    }
}

@Composable
fun VendorOrderDetailContent(detail: VendorOrderDetailResponse) {
    val order = detail.order
    val pickup = order?.pickup_drop_location?.get("0") ?: ""
    val drop = order?.pickup_drop_location?.get("1") ?: ""

    Column(
        modifier = Modifier
            .fillMaxSize()
            .padding(16.dp),
        verticalArrangement = Arrangement.spacedBy(16.dp)
    ) {
        Card(
            modifier = Modifier.fillMaxWidth(),
            shape = DropCarsTheme.CornerLg,
            colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surfaceVariant)
        ) {
            Column(modifier = Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
                    Text("Order #${order?.id}", style = MaterialTheme.typography.titleLarge)
                    order?.trip_status?.let { StatusBadge(status = it) }
                }

                Text("$pickup ➔ $drop", style = MaterialTheme.typography.headlineSmall)
                Text("${order?.trip_type} • ${order?.car_type}", style = MaterialTheme.typography.bodyLarge)
                Text("Customer: ${order?.customer_name} (${order?.customer_number})", style = MaterialTheme.typography.bodyMedium)

                // ─── Dual OTP Display for Vendor Posted Trips ─────────────────────────
                Card(
                    modifier = Modifier.fillMaxWidth().padding(top = 8.dp),
                    colors = CardDefaults.cardColors(containerColor = GreenSuccess.copy(alpha = 0.15f)),
                    shape = DropCarsTheme.CornerMd
                ) {
                    Column(modifier = Modifier.padding(12.dp)) {
                        Text("🔑 Vendor Trip OTP Codes (Share with Driver)", style = MaterialTheme.typography.titleSmall, color = GreenSuccess)
                        Row(modifier = Modifier.fillMaxWidth().padding(top = 4.dp), horizontalArrangement = Arrangement.SpaceBetween) {
                            Text("Start Trip OTP: ${order?.start_otp ?: "1234"}", style = MaterialTheme.typography.bodyLarge, color = MaterialTheme.colorScheme.onSurface)
                            Text("End Trip OTP: ${order?.end_otp ?: "5678"}", style = MaterialTheme.typography.bodyLarge, color = MaterialTheme.colorScheme.onSurface)
                        }
                    }
                }
            }
        }

        detail.fare_breakdown?.let { fare ->
            FareBreakdownCard(fare = fare)
        }
    }
}
