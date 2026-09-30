package in.dropcars.app.ui.driver.trips

import androidx.compose.foundation.layout.*
import androidx.compose.foundation.text.KeyboardOptions
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
fun StartTripScreen(
    orderId: Int,
    onBackClick: () -> Unit,
    viewModel: DriverTripsViewModel = hiltViewModel()
) {
    var startKm by remember { mutableStateOf("") }
    var speedometerImg by remember { mutableStateOf<File?>(null) }
    val opStatus by viewModel.operationStatus.collectAsState()

    LaunchedEffect(opStatus) {
        if (opStatus?.contains("successfully") == true) {
            viewModel.resetOperationStatus()
            onBackClick()
        }
    }

    Scaffold(
        topBar = { DropCarsTopBar(title = "Start Trip #${orderId}", onBackClick = onBackClick) }
    ) { innerPadding ->
        Column(
            modifier = Modifier
                .fillMaxSize()
                .padding(innerPadding)
                .padding(20.dp),
            verticalArrangement = Arrangement.spacedBy(16.dp)
        ) {
            OutlinedTextField(
                value = startKm,
                onValueChange = { startKm = it },
                label = { Text("Start Odometer KM") },
                keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Number),
                modifier = Modifier.fillMaxWidth(),
                singleLine = true
            )

            CameraCaptureCard("Speedometer Odometer Photo", onImageCaptured = { speedometerImg = it })

            opStatus?.let {
                Text(it, color = if (it.contains("successfully")) MaterialTheme.colorScheme.primary else MaterialTheme.colorScheme.error)
            }

            Button(
                onClick = {
                    val km = startKm.toIntOrNull()
                    if (km != null && speedometerImg != null) {
                        viewModel.startTrip(orderId, km, speedometerImg!!)
                    }
                },
                modifier = Modifier.fillMaxWidth().height(50.dp),
                shape = DropCarsTheme.CornerMd
            ) {
                Text("Confirm Trip Start")
            }
        }
    }
}
