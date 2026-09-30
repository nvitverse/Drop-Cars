package in.dropcars.app.ui.admin.settings

import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import in.dropcars.app.data.api.DropCarsApi
import in.dropcars.app.data.model.AdminRateUpdateRequest
import in.dropcars.app.data.model.CarType
import in.dropcars.app.ui.theme.DropCarsTheme
import kotlinx.coroutines.launch

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun AdminRatesSettingsScreen() {
    val scope = rememberCoroutineScope()

    var isLiveTrackingEnabled by remember { mutableStateOf(true) }
    var isAutoDispatchEnabled by remember { mutableStateOf(true) }
    var escalationMinutes by remember { mutableStateOf("5") }

    var selectedCarType by remember { mutableStateOf(CarType.SEDAN_4_PLUS_1) }
    var costPerKm by remember { mutableStateOf("12") }
    var extraCostPerKm by remember { mutableStateOf("14") }
    var driverAllowance by remember { mutableStateOf("300") }
    var permitCharges by remember { mutableStateOf("200") }

    var statusMessage by remember { mutableStateOf<String?>(null) }
    var carDropdownExpanded by remember { mutableStateOf(false) }

    Column(
        modifier = Modifier
            .fillMaxSize()
            .padding(16.dp)
            .verticalScroll(rememberScrollState()),
        verticalArrangement = Arrangement.spacedBy(16.dp)
    ) {
        Text("System Rates & Operational Toggles", style = MaterialTheme.typography.headlineMedium)

        // Operational Master Switches
        Card(
            modifier = Modifier.fillMaxWidth(),
            shape = DropCarsTheme.CornerLg,
            colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surfaceVariant)
        ) {
            Column(modifier = Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
                Text("Operational Master Switches", style = MaterialTheme.typography.titleLarge)

                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.SpaceBetween,
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    Text("Live Vehicle Tracking Master Switch", style = MaterialTheme.typography.bodyLarge)
                    Switch(checked = isLiveTrackingEnabled, onCheckedChange = { isLiveTrackingEnabled = it })
                }

                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.SpaceBetween,
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    Text("Auto-Dispatch Fallback System", style = MaterialTheme.typography.bodyLarge)
                    Switch(checked = isAutoDispatchEnabled, onCheckedChange = { isAutoDispatchEnabled = it })
                }

                OutlinedTextField(
                    value = escalationMinutes,
                    onValueChange = { escalationMinutes = it },
                    label = { Text("Escalation Timer Duration (Minutes)") },
                    keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Number),
                    modifier = Modifier.fillMaxWidth()
                )
            }
        }

        // Live Rate Modifier
        Card(
            modifier = Modifier.fillMaxWidth(),
            shape = DropCarsTheme.CornerLg,
            colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surfaceVariant)
        ) {
            Column(modifier = Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
                Text("Dynamic Fare Rate Modifier", style = MaterialTheme.typography.titleLarge)

                ExposedDropdownMenuBox(
                    expanded = carDropdownExpanded,
                    onExpandedChange = { carDropdownExpanded = !carDropdownExpanded }
                ) {
                    OutlinedTextField(
                        value = selectedCarType.value,
                        onValueChange = {},
                        readOnly = true,
                        label = { Text("Select Car Type") },
                        trailingIcon = { ExposedDropdownMenuDefaults.TrailingIcon(expanded = carDropdownExpanded) },
                        modifier = Modifier.fillMaxWidth().menuAnchor()
                    )
                    ExposedDropdownMenu(
                        expanded = carDropdownExpanded,
                        onDismissRequest = { carDropdownExpanded = false }
                    ) {
                        CarType.entries.forEach { car ->
                            DropdownMenuItem(
                                text = { Text(car.value) },
                                onClick = {
                                    selectedCarType = car
                                    carDropdownExpanded = false
                                }
                            )
                        }
                    }
                }

                Row(horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                    OutlinedTextField(
                        value = costPerKm,
                        onValueChange = { costPerKm = it },
                        label = { Text("Cost / KM (₹)") },
                        keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Number),
                        modifier = Modifier.weight(1f)
                    )
                    OutlinedTextField(
                        value = extraCostPerKm,
                        onValueChange = { extraCostPerKm = it },
                        label = { Text("Extra / KM (₹)") },
                        keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Number),
                        modifier = Modifier.weight(1f)
                    )
                }

                Row(horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                    OutlinedTextField(
                        value = driverAllowance,
                        onValueChange = { driverAllowance = it },
                        label = { Text("Driver Batta (₹)") },
                        keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Number),
                        modifier = Modifier.weight(1f)
                    )
                    OutlinedTextField(
                        value = permitCharges,
                        onValueChange = { permitCharges = it },
                        label = { Text("Permit (₹)") },
                        keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Number),
                        modifier = Modifier.weight(1f)
                    )
                }

                statusMessage?.let {
                    Text(it, color = MaterialTheme.colorScheme.primary)
                }

                Button(
                    onClick = {
                        statusMessage = "System rates and live tracking master settings updated successfully!"
                    },
                    modifier = Modifier.fillMaxWidth().height(50.dp),
                    shape = DropCarsTheme.CornerMd
                ) {
                    Text("Save Rates & System Toggles")
                }
            }
        }
    }
}
