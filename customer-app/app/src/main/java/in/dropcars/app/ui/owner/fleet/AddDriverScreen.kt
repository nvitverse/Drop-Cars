package in.dropcars.app.ui.owner.fleet

import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.input.PasswordVisualTransformation
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import in.dropcars.app.ui.components.CameraCaptureCard
import in.dropcars.app.ui.components.DropCarsTopBar
import in.dropcars.app.ui.theme.DropCarsTheme
import java.io.File

@Composable
fun AddDriverScreen(
    onBackClick: () -> Unit,
    viewModel: OwnerFleetViewModel = hiltViewModel()
) {
    var fullName by remember { mutableStateOf("") }
    var primaryNumber by remember { mutableStateOf("") }
    var password by remember { mutableStateOf("") }
    var address by remember { mutableStateOf("") }
    var city by remember { mutableStateOf("") }
    var pincode by remember { mutableStateOf("") }
    var licenceNumber by remember { mutableStateOf("") }
    var licenceFrontImg by remember { mutableStateOf<File?>(null) }

    val opStatus by viewModel.operationStatus.collectAsState()

    LaunchedEffect(opStatus) {
        if (opStatus?.contains("successfully") == true) {
            viewModel.resetOperationStatus()
            onBackClick()
        }
    }

    Scaffold(
        topBar = { DropCarsTopBar(title = "Register Fleet Driver", onBackClick = onBackClick) }
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
                value = fullName,
                onValueChange = { fullName = it },
                label = { Text("Driver Full Name") },
                modifier = Modifier.fillMaxWidth(),
                singleLine = true
            )

            OutlinedTextField(
                value = primaryNumber,
                onValueChange = { primaryNumber = it },
                label = { Text("Driver Phone Number") },
                keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Phone),
                modifier = Modifier.fillMaxWidth(),
                singleLine = true
            )

            OutlinedTextField(
                value = password,
                onValueChange = { password = it },
                label = { Text("Driver Login Password") },
                visualTransformation = PasswordVisualTransformation(),
                keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Password),
                modifier = Modifier.fillMaxWidth(),
                singleLine = true
            )

            OutlinedTextField(
                value = address,
                onValueChange = { address = it },
                label = { Text("Address") },
                modifier = Modifier.fillMaxWidth()
            )

            Row(horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                OutlinedTextField(
                    value = city,
                    onValueChange = { city = it },
                    label = { Text("City") },
                    modifier = Modifier.weight(1f),
                    singleLine = true
                )
                OutlinedTextField(
                    value = pincode,
                    onValueChange = { pincode = it },
                    label = { Text("Pincode") },
                    keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Number),
                    modifier = Modifier.weight(1f),
                    singleLine = true
                )
            }

            OutlinedTextField(
                value = licenceNumber,
                onValueChange = { licenceNumber = it },
                label = { Text("Driving Licence Number") },
                modifier = Modifier.fillMaxWidth(),
                singleLine = true
            )

            CameraCaptureCard("Licence Front Photo", onImageCaptured = { licenceFrontImg = it })

            opStatus?.let {
                Text(it, color = if (it.contains("successfully")) MaterialTheme.colorScheme.primary else MaterialTheme.colorScheme.error)
            }

            Button(
                onClick = {
                    if (licenceFrontImg != null) {
                        viewModel.addDriver(fullName, primaryNumber, password, address, city, pincode, licenceNumber, licenceFrontImg!!)
                    }
                },
                modifier = Modifier.fillMaxWidth().height(50.dp),
                shape = DropCarsTheme.CornerMd
            ) {
                Text("Register Driver")
            }
        }
    }
}
