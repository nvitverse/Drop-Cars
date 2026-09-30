package in.dropcars.app.ui.vendor.neworder

import android.annotation.SuppressLint
import android.content.Context
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Add
import androidx.compose.material.icons.filled.Delete
import androidx.compose.material.icons.filled.MyLocation
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import com.google.android.gms.location.LocationServices
import in.dropcars.app.data.model.BookingRecipientMode
import in.dropcars.app.data.model.CarType
import in.dropcars.app.data.model.OrderType
import in.dropcars.app.ui.components.FareBreakdownCard
import in.dropcars.app.ui.theme.DropCarsTheme

@SuppressLint("MissingPermission")
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun NewOrderScreen(
    onOrderConfirmed: (Int) -> Unit,
    viewModel: NewOrderViewModel = hiltViewModel()
) {
    val context = LocalContext.current

    var recipientMode by remember { mutableStateOf(BookingRecipientMode.BOOK_FOR_ME) }
    var selectedTripType by remember { mutableStateOf(OrderType.ONEWAY) }
    var selectedCarType by remember { mutableStateOf(CarType.SEDAN_4_PLUS_1) }

    var pickupCity by remember { mutableStateOf("Chennai") }
    var dropCity by remember { mutableStateOf("Bangalore") }
    var intermediateStops by remember { mutableStateOf(mutableStateListOf<String>()) }
    var startDateTime by remember { mutableStateOf("2025-08-01T06:00:00") }

    // Customer & Passenger Details
    var customerName by remember { mutableStateOf("") }
    var customerNumber by remember { mutableStateOf("") }
    var passengerName by remember { mutableStateOf("") }
    var passengerNumber by remember { mutableStateOf("") }
    var passengerEmail by remember { mutableStateOf("") }

    var costPerKm by remember { mutableStateOf("12") }
    var extraCostPerKm by remember { mutableStateOf("14") }
    var driverAllowance by remember { mutableStateOf("300") }
    var permitCharges by remember { mutableStateOf("200") }
    var tollCharges by remember { mutableStateOf("150") }
    var pickupNotes by remember { mutableStateOf("") }

    var carDropdownExpanded by remember { mutableStateOf(false) }

    val quoteState by viewModel.quoteState.collectAsState()

    LaunchedEffect(quoteState) {
        if (quoteState is QuoteState.ConfirmSuccess) {
            onOrderConfirmed((quoteState as QuoteState.ConfirmSuccess).orderId)
        }
    }

    Column(
        modifier = Modifier
            .fillMaxSize()
            .padding(16.dp)
            .verticalScroll(rememberScrollState()),
        verticalArrangement = Arrangement.spacedBy(14.dp)
    ) {
        Text(
            text = "Create Booking",
            style = MaterialTheme.typography.headlineMedium,
            color = MaterialTheme.colorScheme.onSurface
        )

        // ─── Recipient Selector Toggle: Book for Me vs Book for Others ───────────────
        SingleChoiceSegmentedButtonRow(modifier = Modifier.fillMaxWidth()) {
            SegmentedButton(
                selected = recipientMode == BookingRecipientMode.BOOK_FOR_ME,
                onClick = { recipientMode = BookingRecipientMode.BOOK_FOR_ME },
                shape = SegmentedButtonDefaults.itemShape(0, 2)
            ) {
                Text("👤 Book for Me", style = MaterialTheme.typography.labelLarge)
            }
            SegmentedButton(
                selected = recipientMode == BookingRecipientMode.BOOK_FOR_OTHERS,
                onClick = { recipientMode = BookingRecipientMode.BOOK_FOR_OTHERS },
                shape = SegmentedButtonDefaults.itemShape(1, 2)
            ) {
                Text("👥 Book for Others", style = MaterialTheme.typography.labelLarge)
            }
        }

        // Trip Type Segmented Control
        SingleChoiceSegmentedButtonRow(modifier = Modifier.fillMaxWidth()) {
            OrderType.entries.forEachIndexed { index, type ->
                SegmentedButton(
                    selected = selectedTripType == type,
                    onClick = { selectedTripType = type },
                    shape = SegmentedButtonDefaults.itemShape(index, OrderType.entries.size)
                ) {
                    Text(text = type.value, style = MaterialTheme.typography.labelLarge)
                }
            }
        }

        // Car Type Selector Dropdown
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
                modifier = Modifier
                    .fillMaxWidth()
                    .menuAnchor()
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

        // Route Details with "📍 Use Current Location" Button
        OutlinedButton(
            onClick = {
                try {
                    val fusedLocationClient = LocationServices.getFusedLocationProviderClient(context)
                    fusedLocationClient.lastLocation.addOnSuccessListener { loc ->
                        if (loc != null) {
                            pickupCity = "GPS: (${loc.latitude}, ${loc.longitude})"
                        }
                    }
                } catch (e: Exception) {
                    e.printStackTrace()
                }
            },
            modifier = Modifier.fillMaxWidth()
        ) {
            Icon(Icons.Default.MyLocation, contentDescription = "Use Current Location")
            Spacer(modifier = Modifier.width(8.dp))
            Text("📍 Use Current Location")
        }

        Row(horizontalArrangement = Arrangement.spacedBy(12.dp)) {
            OutlinedTextField(
                value = pickupCity,
                onValueChange = { pickupCity = it },
                label = { Text("Pickup Location") },
                modifier = Modifier.weight(1f),
                singleLine = true
            )
            OutlinedTextField(
                value = dropCity,
                onValueChange = { dropCity = it },
                label = { Text("Drop Location") },
                modifier = Modifier.weight(1f),
                singleLine = true
            )
        }

        // ─── Intermediate Stops (+ Add Stop) ───────────────────────────────────
        if (selectedTripType == OrderType.MULTY_CITY || selectedTripType == OrderType.ROUND_TRIP) {
            Text("Intermediate Route Stops", style = MaterialTheme.typography.titleMedium)
            intermediateStops.forEachIndexed { idx, stop ->
                Row(verticalAlignment = Alignment.CenterVertically) {
                    OutlinedTextField(
                        value = stop,
                        onValueChange = { intermediateStops[idx] = it },
                        label = { Text("Stop #${idx + 1}") },
                        modifier = Modifier.weight(1f),
                        singleLine = true
                    )
                    IconButton(onClick = { intermediateStops.removeAt(idx) }) {
                        Icon(Icons.Default.Delete, contentDescription = "Remove Stop", tint = MaterialTheme.colorScheme.error)
                    }
                }
            }

            OutlinedButton(
                onClick = { intermediateStops.add("Intermediate Stop") },
                modifier = Modifier.fillMaxWidth()
            ) {
                Icon(Icons.Default.Add, contentDescription = "Add Stop")
                Spacer(modifier = Modifier.width(8.dp))
                Text("+ Add Stop")
            }
        }

        OutlinedTextField(
            value = startDateTime,
            onValueChange = { startDateTime = it },
            label = { Text("Start Date Time (ISO-8601)") },
            modifier = Modifier.fillMaxWidth(),
            singleLine = true
        )

        // Customer vs Passenger Contact Info
        if (recipientMode == BookingRecipientMode.BOOK_FOR_ME) {
            Row(horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                OutlinedTextField(
                    value = customerName,
                    onValueChange = { customerName = it },
                    label = { Text("Customer Name") },
                    modifier = Modifier.weight(1f),
                    singleLine = true
                )
                OutlinedTextField(
                    value = customerNumber,
                    onValueChange = { customerNumber = it },
                    label = { Text("Customer Phone") },
                    keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Phone),
                    modifier = Modifier.weight(1f),
                    singleLine = true
                )
            }
        } else {
            Text("Passenger Details (Book for Others)", style = MaterialTheme.typography.titleMedium)
            OutlinedTextField(
                value = passengerName,
                onValueChange = { passengerName = it },
                label = { Text("Passenger Full Name *") },
                modifier = Modifier.fillMaxWidth(),
                singleLine = true
            )
            Row(horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                OutlinedTextField(
                    value = passengerNumber,
                    onValueChange = { passengerNumber = it },
                    label = { Text("Passenger Mobile *") },
                    keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Phone),
                    modifier = Modifier.weight(1f),
                    singleLine = true
                )
                OutlinedTextField(
                    value = passengerEmail,
                    onValueChange = { passengerEmail = it },
                    label = { Text("Passenger Email (Optional)") },
                    keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.EmailAddress),
                    modifier = Modifier.weight(1f),
                    singleLine = true
                )
            }
        }

        // Rates
        Row(horizontalArrangement = Arrangement.spacedBy(12.dp)) {
            OutlinedTextField(
                value = costPerKm,
                onValueChange = { costPerKm = it },
                label = { Text("Cost / KM (₹)") },
                keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Number),
                modifier = Modifier.weight(1f),
                singleLine = true
            )
            OutlinedTextField(
                value = driverAllowance,
                onValueChange = { driverAllowance = it },
                label = { Text("Driver Batta (₹)") },
                keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Number),
                modifier = Modifier.weight(1f),
                singleLine = true
            )
        }

        OutlinedTextField(
            value = pickupNotes,
            onValueChange = { pickupNotes = it },
            label = { Text("Pickup Notes / Instructions") },
            modifier = Modifier.fillMaxWidth()
        )

        // Actions: Quote vs Confirm
        Row(horizontalArrangement = Arrangement.spacedBy(12.dp)) {
            OutlinedButton(
                onClick = {
                    val finalName = if (recipientMode == BookingRecipientMode.BOOK_FOR_ME) customerName else passengerName
                    val finalPhone = if (recipientMode == BookingRecipientMode.BOOK_FOR_ME) customerNumber else passengerNumber

                    viewModel.requestOnewayQuote(
                        pickupCity, dropCity, selectedCarType.value, startDateTime,
                        finalName, finalPhone,
                        costPerKm.toIntOrNull() ?: 12, extraCostPerKm.toIntOrNull() ?: 14,
                        driverAllowance.toIntOrNull() ?: 300, permitCharges.toIntOrNull() ?: 200,
                        tollCharges.toIntOrNull() ?: 150, pickupNotes
                    )
                },
                modifier = Modifier
                    .weight(1f)
                    .height(50.dp),
                shape = DropCarsTheme.CornerMd
            ) {
                Text("Get Quote")
            }

            Button(
                onClick = {
                    val finalName = if (recipientMode == BookingRecipientMode.BOOK_FOR_ME) customerName else passengerName
                    val finalPhone = if (recipientMode == BookingRecipientMode.BOOK_FOR_ME) customerNumber else passengerNumber

                    viewModel.confirmOnewayOrder(
                        pickupCity, dropCity, selectedCarType.value, startDateTime,
                        finalName, finalPhone,
                        costPerKm.toIntOrNull() ?: 12, extraCostPerKm.toIntOrNull() ?: 14,
                        driverAllowance.toIntOrNull() ?: 300, permitCharges.toIntOrNull() ?: 200,
                        tollCharges.toIntOrNull() ?: 150, pickupNotes
                    )
                },
                modifier = Modifier
                    .weight(1f)
                    .height(50.dp),
                shape = DropCarsTheme.CornerMd
            ) {
                Text("Confirm Booking")
            }
        }

        if (quoteState is QuoteState.Loading) {
            CircularProgressIndicator(modifier = Modifier.padding(top = 16.dp))
        }

        if (quoteState is QuoteState.Error) {
            Text(
                text = (quoteState as QuoteState.Error).message,
                color = MaterialTheme.colorScheme.error
            )
        }

        if (quoteState is QuoteState.OnewayQuoteSuccess) {
            FareBreakdownCard(fare = (quoteState as QuoteState.OnewayQuoteSuccess).fare)
        }
    }
}
