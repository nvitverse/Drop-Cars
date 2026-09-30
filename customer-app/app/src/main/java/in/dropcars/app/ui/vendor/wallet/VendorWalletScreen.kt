package in.dropcars.app.ui.vendor.wallet

import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import in.dropcars.app.ui.components.StatusBadge
import in.dropcars.app.ui.theme.DropCarsTheme
import in.dropcars.app.ui.theme.GreenSuccess

@Composable
fun VendorWalletScreen(
    viewModel: VendorWalletViewModel = hiltViewModel()
) {
    val uiState by viewModel.uiState.collectAsState()

    var withdrawAmount by remember { mutableStateOf("") }
    var withdrawNotes by remember { mutableStateOf("") }

    Surface(
        modifier = Modifier.fillMaxSize(),
        color = MaterialTheme.colorScheme.background
    ) {
        Column(modifier = Modifier.fillMaxSize().padding(16.dp)) {
            Text(
                text = "Vendor Wallet & Payouts",
                style = MaterialTheme.typography.headlineMedium,
                color = MaterialTheme.colorScheme.onSurface,
                modifier = Modifier.padding(bottom = 16.dp)
            )

            when (val state = uiState) {
                is VendorWalletState.Loading -> CircularProgressIndicator()
                is VendorWalletState.Error -> Text(state.message, color = MaterialTheme.colorScheme.error)
                is VendorWalletState.Success -> {
                    Card(
                        modifier = Modifier.fillMaxWidth(),
                        shape = DropCarsTheme.CornerLg,
                        colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surfaceVariant)
                    ) {
                        Column(modifier = Modifier.padding(16.dp)) {
                            Text("Total Balance", style = MaterialTheme.typography.titleLarge)
                            Text(
                                text = "₹${state.balance.total_balance}",
                                style = MaterialTheme.typography.headlineLarge,
                                color = GreenSuccess,
                                modifier = Modifier.padding(vertical = 4.dp)
                            )
                            Text("Wallet: ₹${state.balance.wallet_balance} | Bank: ₹${state.balance.bank_balance}", style = MaterialTheme.typography.bodyMedium)
                        }
                    }

                    Spacer(modifier = Modifier.height(16.dp))

                    Text("Request Payout / Withdrawal", style = MaterialTheme.typography.titleLarge)
                    Row(horizontalArrangement = Arrangement.spacedBy(8.dp), modifier = Modifier.padding(top = 8.dp)) {
                        OutlinedTextField(
                            value = withdrawAmount,
                            onValueChange = { withdrawAmount = it },
                            label = { Text("Amount (₹)") },
                            modifier = Modifier.weight(1f),
                            singleLine = true
                        )
                        Button(
                            onClick = {
                                withdrawAmount.toIntOrNull()?.let { amount ->
                                    viewModel.requestWithdrawal(amount, withdrawNotes)
                                    withdrawAmount = ""
                                }
                            },
                            modifier = Modifier.height(56.dp),
                            shape = DropCarsTheme.CornerMd
                        ) {
                            Text("Withdraw")
                        }
                    }

                    Spacer(modifier = Modifier.height(20.dp))

                    Text("Withdrawal Requests", style = MaterialTheme.typography.titleLarge)
                    LazyColumn(verticalArrangement = Arrangement.spacedBy(8.dp), modifier = Modifier.padding(top = 8.dp)) {
                        items(state.transfers) { transfer ->
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
                                        Text("₹${transfer.requested_amount}", style = MaterialTheme.typography.titleLarge)
                                        Text(transfer.created_at, style = MaterialTheme.typography.bodyMedium)
                                    }
                                    StatusBadge(status = transfer.status)
                                }
                            }
                        }
                    }
                }
            }
        }
    }
}
