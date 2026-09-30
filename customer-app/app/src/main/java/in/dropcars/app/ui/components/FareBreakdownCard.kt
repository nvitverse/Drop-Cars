package in.dropcars.app.ui.components

import androidx.compose.foundation.layout.*
import androidx.compose.material3.*
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import in.dropcars.app.data.model.FareBreakdown
import in.dropcars.app.ui.theme.DropCarsTheme
import in.dropcars.app.ui.theme.GreenSuccess

@Composable
fun FareBreakdownCard(
    fare: FareBreakdown,
    modifier: Modifier = Modifier
) {
    Card(
        modifier = modifier.fillMaxWidth(),
        shape = DropCarsTheme.CornerLg,
        colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surfaceVariant)
    ) {
        Column(modifier = Modifier.padding(16.dp)) {
            Text(
                text = "Fare Estimate",
                style = MaterialTheme.typography.titleLarge,
                color = MaterialTheme.colorScheme.onSurface
            )

            Spacer(modifier = Modifier.height(12.dp))

            FareRow(label = "Total Distance", value = "${fare.total_km} km")
            FareRow(label = "Trip Time", value = fare.trip_time)
            FareRow(label = "Base Fare", value = "₹${fare.base_km_amount}")
            if (fare.driver_allowance > 0) {
                FareRow(label = "Driver Allowance", value = "₹${fare.driver_allowance}")
            }
            if (fare.permit_charges > 0) {
                FareRow(label = "Permit Charges", value = "₹${fare.permit_charges}")
            }
            if (fare.toll_charges > 0) {
                FareRow(label = "Toll Charges", value = "₹${fare.toll_charges}")
            }
            if (fare.hill_charges > 0) {
                FareRow(label = "Hill Charges", value = "₹${fare.hill_charges}")
            }

            Divider(modifier = Modifier.padding(vertical = 8.dp))

            FareRow(
                label = "Customer Amount",
                value = "₹${fare.customer_amount}",
                isBold = true,
                color = MaterialTheme.colorScheme.primary
            )
            FareRow(
                label = "Driver Payable",
                value = "₹${fare.driver_amount}",
                isBold = true,
                color = GreenSuccess
            )
        }
    }
}

@Composable
fun FareRow(
    label: String,
    value: String,
    isBold: Boolean = false,
    color: androidx.compose.ui.graphics.Color = MaterialTheme.colorScheme.onSurface
) {
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .padding(vertical = 4.dp),
        horizontalArrangement = Arrangement.SpaceBetween,
        verticalAlignment = Alignment.CenterVertically
    ) {
        Text(
            text = label,
            style = MaterialTheme.typography.bodyMedium,
            color = MaterialTheme.colorScheme.onSurfaceVariant
        )
        Text(
            text = value,
            style = if (isBold) MaterialTheme.typography.titleLarge else MaterialTheme.colorScheme.bodyMedium.copy(fontWeight = FontWeight.Medium),
            color = color
        )
    }
}
