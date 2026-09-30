package in.dropcars.app.ui.owner.pending

import androidx.compose.foundation.layout.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import in.dropcars.app.ui.components.DropCarsTopBar
import in.dropcars.app.ui.theme.DropCarsTheme

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun AssignDriverCarScreen(
    assignmentId: Int,
    onBackClick: () -> Unit,
    viewModel: OwnerPendingOrdersViewModel = hiltViewModel()
) {
    val drivers by viewModel.availableDrivers.collectAsState()
    val cars by viewModel.availableCars.collectAsState()
    val assignResult by viewModel.assignResult.collectAsState()

    var selectedDriverId by remember { mutableStateOf("") }
    var selectedCarId by remember { mutableStateOf("") }

    var driverDropdownExpanded by remember { mutableStateOf(false) }
    var carDropdownExpanded by remember { mutableStateOf(false) }

    LaunchedEffect(assignmentId) {
        viewModel.loadFleetForAssignment()
    }

    LaunchedEffect(assignResult) {
        if (assignResult?.contains("successfully") == true) {
            onBackClick()
        }
    }

    Scaffold(
        topBar = { DropCarsTopBar(title = "Assign Driver & Vehicle", onBackClick = onBackClick) }
    ) { innerPadding ->
        Column(
            modifier = Modifier
                .fillMaxSize()
                .padding(innerPadding)
                .padding(20.dp),
            verticalArrangement = Arrangement.spacedBy(16.dp)
        ) {
            Text("Assignment #$assignmentId", style = MaterialTheme.typography.titleLarge)

            // Select Driver
            ExposedDropdownMenuBox(
                expanded = driverDropdownExpanded,
                onExpandedChange = { driverDropdownExpanded = !driverDropdownExpanded }
            ) {
                val driverName = drivers.find { it.id == selectedDriverId }?.full_name ?: "Select Driver"
                OutlinedTextField(
                    value = driverName,
                    onValueChange = {},
                    readOnly = true,
                    label = { Text("Available Driver") },
                    trailingIcon = { ExposedDropdownMenuDefaults.TrailingIcon(expanded = driverDropdownExpanded) },
                    modifier = Modifier.fillMaxWidth().menuAnchor()
                )
                ExposedDropdownMenu(
                    expanded = driverDropdownExpanded,
                    onDismissRequest = { driverDropdownExpanded = false }
                ) {
                    drivers.forEach { driver ->
                        DropdownMenuItem(
                            text = { Text("${driver.full_name} (${driver.primary_number})") },
                            onClick = {
                                selectedDriverId = driver.id
                                driverDropdownExpanded = false
                            }
                        )
                    }
                }
            }

            // Select Car
            ExposedDropdownMenuBox(
                expanded = carDropdownExpanded,
                onExpandedChange = { carDropdownExpanded = !carDropdownExpanded }
            ) {
                val carName = cars.find { it.id == selectedCarId }?.let { "${it.car_name} [${it.car_number}]" } ?: "Select Car"
                OutlinedTextField(
                    value = carName,
                    onValueChange = {},
                    readOnly = true,
                    label = { Text("Available Vehicle") },
                    trailingIcon = { ExposedDropdownMenuDefaults.TrailingIcon(expanded = carDropdownExpanded) },
                    modifier = Modifier.fillMaxWidth().menuAnchor()
                )
                ExposedDropdownMenu(
                    expanded = carDropdownExpanded,
                    onDismissRequest = { carDropdownExpanded = false }
                ) {
                    cars.forEach { car ->
                        DropdownMenuItem(
                            text = { Text("${car.car_name} - ${car.car_number} (${car.car_type})") },
                            onClick = {
                                selectedCarId = car.id
                                carDropdownExpanded = false
                            }
                        )
                    }
                }
            }

            assignResult?.let {
                Text(it, color = if (it.contains("successfully")) MaterialTheme.colorScheme.primary else MaterialTheme.colorScheme.error)
            }

            Button(
                onClick = {
                    if (selectedDriverId.isNotEmpty() && selectedCarId.isNotEmpty()) {
                        viewModel.assignCarAndDriver(assignmentId, selectedDriverId, selectedCarId)
                    }
                },
                modifier = Modifier.fillMaxWidth().height(50.dp),
                shape = DropCarsTheme.CornerMd
            ) {
                Text("Confirm Assignment")
            }
        }
    }
}
