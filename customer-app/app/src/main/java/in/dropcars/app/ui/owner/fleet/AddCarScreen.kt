package in.dropcars.app.ui.owner.fleet

import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import in.dropcars.app.data.model.CarType
import in.dropcars.app.ui.components.CameraCaptureCard
import in.dropcars.app.ui.components.DropCarsTopBar
import in.dropcars.app.ui.theme.DropCarsTheme
import java.io.File

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun AddCarScreen(
    onBackClick: () -> Unit,
    viewModel: OwnerFleetViewModel = hiltViewModel()
) {
    var carName by remember { mutableStateOf("") }
    var selectedCarType by remember { mutableStateOf(CarType.SEDAN_4_PLUS_1) }
    var carNumber by remember { mutableStateOf("") }
    var year by remember { mutableStateOf("2023") }

    var rcFront by remember { mutableStateOf<File?>(null) }
    var rcBack by remember { mutableStateOf<File?>(null) }
    var insurance by remember { mutableStateOf<File?>(null) }
    var fc by remember { mutableStateOf<File?>(null) }
    var carImg by remember { mutableStateOf<File?>(null) }
    var permit by remember { mutableStateOf<File?>(null) }

    var carDropdownExpanded by remember { mutableStateOf(false) }
    val opStatus by viewModel.operationStatus.collectAsState()

    LaunchedEffect(opStatus) {
        if (opStatus?.contains("successfully") == true) {
            viewModel.resetOperationStatus()
            onBackClick()
        }
    }

    Scaffold(
        topBar = { DropCarsTopBar(title = "Register Vehicle", onBackClick = onBackClick) }
    ) { innerPadding ->
        Column(
            modifier = Modifier
                .fillMaxSize()
                .padding(innerPadding)
                .padding(20.dp)
                .verticalScroll(rememberScrollState()),
            verticalArrangement = Arrangement.spacedBy(14.dp)
        ) {
            OutlinedTextField(
                value = carName,
                onValueChange = { carName = it },
                label = { Text("Car Model / Name") },
                modifier = Modifier.fillMaxWidth(),
                singleLine = true
            )

            ExposedDropdownMenuBox(
                expanded = carDropdownExpanded,
                onExpandedChange = { carDropdownExpanded = !carDropdownExpanded }
            ) {
                OutlinedTextField(
                    value = selectedCarType.value,
                    onValueChange = {},
                    readOnly = true,
                    label = { Text("Car Category") },
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

            OutlinedTextField(
                value = carNumber,
                onValueChange = { carNumber = it },
                label = { Text("Vehicle Registration Number (e.g. TN01AB1234)") },
                modifier = Modifier.fillMaxWidth(),
                singleLine = true
            )

            OutlinedTextField(
                value = year,
                onValueChange = { year = it },
                label = { Text("Year of Manufacture") },
                modifier = Modifier.fillMaxWidth(),
                singleLine = true
            )

            Text("Required Vehicle Documents (Max 5MB each)", style = MaterialTheme.typography.titleMedium)

            CameraCaptureCard("RC Front Photo", onImageCaptured = { rcFront = it })
            CameraCaptureCard("RC Back Photo", onImageCaptured = { rcBack = it })
            CameraCaptureCard("Insurance Photo", onImageCaptured = { insurance = it })
            CameraCaptureCard("Fitness Certificate (FC)", onImageCaptured = { fc = it })
            CameraCaptureCard("Car Exterior Photo", onImageCaptured = { carImg = it })
            CameraCaptureCard("Permit Photo", onImageCaptured = { permit = it })

            opStatus?.let {
                Text(it, color = if (it.contains("successfully")) MaterialTheme.colorScheme.primary else MaterialTheme.colorScheme.error)
            }

            Button(
                onClick = {
                    if (rcFront != null && rcBack != null && insurance != null && fc != null && carImg != null && permit != null) {
                        viewModel.addCar(
                            carName, selectedCarType.value, carNumber, year,
                            rcFront!!, rcBack!!, insurance!!, fc!!, carImg!!, permit!!
                        )
                    }
                },
                modifier = Modifier.fillMaxWidth().height(50.dp),
                shape = DropCarsTheme.CornerMd
            ) {
                Text("Submit Vehicle Registration")
            }
        }
    }
}
