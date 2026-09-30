package in.dropcars.app.ui.owner.wallet

import android.app.Activity
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import in.dropcars.app.ui.theme.DropCarsTheme
import in.dropcars.app.ui.theme.GreenSuccess
import in.dropcars.app.util.RazorpayHelper

@Composable
fun OwnerWalletScreen(
    viewModel: OwnerWalletViewModel = hiltViewModel()
) {
    val uiState by viewModel.uiState.collectAsState()
    val razorpayOrder by viewModel.razorpayOrder.collectAsState()
    val verificationStatus by viewModel.paymentVerificationStatus.collectAsState()

    val context = LocalContext.current
    var topupAmount by remember { mutableStateOf("1000") }

    LaunchedEffect(razorpayOrder) {
        razorpayOrder?.let { rpOrder ->
            (context as? Activity)?.let { activity ->
                RazorpayHelper.startPayment(
                    activity = activity,
                    orderId = rpOrder.rp_order_id,
                    amountInPaise = rpOrder.amount
                )
            }
        }
    }

    Surface(
        modifier = Modifier.fillMaxSize(),
        color = MaterialTheme.colorScheme.background
    ) {
        Column(modifier = Modifier.fillMaxSize().padding(16.dp)) {
            Text("Vehicle Owner Wallet", style = MaterialTheme.typography.headlineMedium, modifier = Modifier.padding(bottom = 16.dp))

            when (val state = uiState) {
                is OwnerWalletState.Loading -> CircularProgressIndicator()
                is OwnerWalletState.Error -> Text(state.message, color = MaterialTheme.colorScheme.error)
                is OwnerWalletState.Success -> {
                    Card(
                        modifier = Modifier.fillMaxWidth(),
                        shape = DropCarsTheme.CornerLg,
                        colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surfaceVariant)
                    ) {
                        Column(modifier = Modifier.padding(16.dp)) {
                            Text("Current Wallet Balance", style = MaterialTheme.typography.titleLarge)
                            Text(
                                text = "₹${state.balance.current_balance}",
                                style = MaterialTheme.typography.headlineLarge,
                                color = GreenSuccess,
                                modifier = Modifier.padding(vertical = 4.dp)
                            )
                        }
                    }

                    Spacer(modifier = Modifier.height(16.dp))

                    Text("Razorpay Wallet Top-up", style = MaterialTheme.typography.titleLarge)
                    Row(horizontalArrangement = Arrangement.spacedBy(8.dp), modifier = Modifier.padding(top = 8.dp)) {
                        OutlinedTextField(
                            value = topupAmount,
                            onValueChange = { topupAmount = it },
                            label = { Text("Amount (₹)") },
                            keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Number),
                            modifier = Modifier.weight(1f),
                            singleLine = true
                        )
                        Button(
                            onClick = {
                                topupAmount.toIntOrNull()?.let { amount ->
                                    viewModel.initiateRazorpayTopup(amount)
                                }
                            },
                            modifier = Modifier.height(56.dp),
                            shape = DropCarsTheme.CornerMd
                        ) {
                            Text("Top Up Now")
                        }
                    }

                    verificationStatus?.let {
                        Text(it, modifier = Modifier.padding(top = 8.dp), color = MaterialTheme.colorScheme.primary)
                    }

                    Spacer(modifier = Modifier.height(20.dp))

                    Text("Wallet Transaction Ledger", style = MaterialTheme.typography.titleLarge)
                    LazyColumn(verticalArrangement = Arrangement.spacedBy(8.dp), modifier = Modifier.padding(top = 8.dp)) {
                        items(state.ledger) { entry ->
                            Card(
                                modifier = Modifier.fillMaxWidth(),
                                shape = DropCarsTheme.CornerMd,
                                colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surfaceVariant)
                            ) {
                                Row(
                                    modifier = Modifier.padding(12.dp),
                                    horizontalArrangement = Arrangement.SpaceBetween,
                                    verticalAlignment = Alignment.CenterVertically
                                ) {
                                    Column {
                                        Text("${entry.entry_type}: ₹${entry.amount}", style = MaterialTheme.typography.titleLarge)
                                        entry.notes?.let { Text(it, style = MaterialTheme.typography.bodyMedium) }
                                        Text(entry.created_at, style = MaterialTheme.typography.bodySmall)
                                    }
                                    Text("₹${entry.balance_after}", style = MaterialTheme.typography.titleMedium)
                                }
                            }
                        }
                    }
                }
            }
        }
    }
}
