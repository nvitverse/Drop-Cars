package in.dropcars.app.ui.driver.trips

import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import in.dropcars.app.ui.components.CameraCaptureCard
import in.dropcars.app.ui.components.DropCarsTopBar
import in.dropcars.app.ui.theme.DropCarsTheme
import java.io.File

@Composable
fun EndTripScreen(
    orderId: Int,
    onBackClick: () -> Unit,
    viewModel: DriverTripsViewModel = hiltViewModel()
) {
    var endKm by remember { mutableStateOf("") }
    var tollUpdate by remember { mutableStateOf(false) }
    var updatedTollCharges by remember { mutableStateOf("") }
    var waitingTime by remember { mutableStateOf("") }
    var closeSpeedometerImg by remember { mutableStateOf<File?>(null) }

    val opStatus by viewModel.operationStatus.collectAsState()

    LaunchedEffect(opStatus) {
        if (opStatus?.contains("successfully") == true) {
            viewModel.resetOperationStatus()
            onBackClick()
        }
    }

    Scaffold(
        topBar = { DropCarsTopBar(title = "Complete Trip #${orderId}", onBackClick = onBackClick) }
    ) { innerPadding ->
        Column(
            modifier = Modifier
                .fillMaxSize()
                .padding(innerPadding)
                .padding(20.dp)
                .verticalScroll(rememberScrollState()),
            verticalArrangement = Arrangement.spacedBy(16.dp)
        ) {
            OutlinedTextField(
                value = endKm,
                onValueChange = { endKm = it },
                label = { Text("Closing Odometer KM") },
                keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Number),
                modifier = Modifier.fillMaxWidth(),
                singleLine = true
            )

            Row(verticalAlignment = androidx.compose.ui.Alignment.CenterVertically) {
                Checkbox(checked = tollUpdate, onCheckedChange = { tollUpdate = it })
                Text("Toll Charges Changed During Trip?")
            }

            if (tollUpdate) {
                OutlinedTextField(
                    value = updatedTollCharges,
                    onValueChange = { updatedTollCharges = it },
                    label = { Text("Updated Toll Amount (₹)") },
                    keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Number),
                    modifier = Modifier.fillMaxWidth(),
                    singleLine = true
                )
            }

            OutlinedTextField(
                value = waitingTime,
                onValueChange = { waitingTime = it },
                label = { Text("Waiting Time (Minutes, Optional)") },
                keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Number),
                modifier = Modifier.fillMaxWidth(),
                singleLine = true
            )

            CameraCaptureCard("Closing Speedometer Odometer Photo", onImageCaptured = { closeSpeedometerImg = it })

            opStatus?.let {
                Text(it, color = if (it.contains("successfully")) MaterialTheme.colorScheme.primary else MaterialTheme.colorScheme.error)
            }

            Button(
                onClick = {
                    val km = endKm.toIntOrNull()
                    if (km != null && closeSpeedometerImg != null) {
                        viewModel.endTrip(
                            orderId = orderId,
                            endKm = km,
                            tollUpdate = tollUpdate,
                            updatedToll = updatedTollCharges.toIntOrNull(),
                            waitingTime = waitingTime.toIntOrNull(),
                            closeSpeedometerImg = closeSpeedometerImg!!
                        )
                    }
                },
                modifier = Modifier.fillMaxWidth().height(50.dp),
                shape = DropCarsTheme.CornerMd
            ) {
                Text("Complete & Submit Trip")
            }
        }
    }
}
