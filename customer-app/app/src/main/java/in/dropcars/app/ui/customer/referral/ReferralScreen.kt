package in.dropcars.app.ui.customer.referral

import android.content.Context
import android.content.Intent
import androidx.compose.foundation.layout.*
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Share
import androidx.compose.material3.*
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.unit.dp
import in.dropcars.app.ui.components.DropCarsTopBar
import in.dropcars.app.ui.theme.DropCarsTheme
import in.dropcars.app.ui.theme.GreenSuccess

@Composable
fun ReferralScreen(
    onBackClick: () -> Unit
) {
    val context = LocalContext.current
    val referralCode = "RAJAN100"

    Scaffold(
        topBar = { DropCarsTopBar(title = "Refer & Earn ₹100", onBackClick = onBackClick) }
    ) { innerPadding ->
        Column(
            modifier = Modifier
                .fillMaxSize()
                .padding(innerPadding)
                .padding(20.dp),
            horizontalAlignment = Alignment.CenterHorizontally,
            verticalArrangement = Arrangement.spacedBy(16.dp)
        ) {
            Card(
                modifier = Modifier.fillMaxWidth(),
                shape = DropCarsTheme.CornerLg,
                colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surfaceVariant)
            ) {
                Column(
                    modifier = Modifier.padding(24.dp),
                    horizontalAlignment = Alignment.CenterHorizontally
                ) {
                    Text("🎉 Double-Sided Referral Program", style = MaterialTheme.typography.titleLarge)
                    Spacer(modifier = Modifier.height(8.dp))
                    Text("Give ₹100 to your friends, get ₹100 when they complete their first ride!", style = MaterialTheme.typography.bodyMedium)

                    Spacer(modifier = Modifier.height(20.dp))

                    Text("YOUR UNIQUE REFERRAL CODE", style = MaterialTheme.typography.labelLarge)
                    Text(
                        text = referralCode,
                        style = MaterialTheme.typography.headlineLarge,
                        color = MaterialTheme.colorScheme.primary,
                        modifier = Modifier.padding(vertical = 8.dp)
                    )

                    Button(
                        onClick = {
                            val shareIntent = Intent(Intent.ACTION_SEND).apply {
                                type = "text/plain"
                                putExtra(
                                    Intent.EXTRA_TEXT,
                                    "Use my code $referralCode on Drop Cars to get ₹100 OFF your first intercity ride! Download now: https://dropcars.in/r/$referralCode"
                                )
                            }
                            context.startActivity(Intent.createChooser(shareIntent, "Share Referral Code"))
                        },
                        modifier = Modifier.fillMaxWidth().height(50.dp),
                        shape = DropCarsTheme.CornerMd
                    ) {
                        Icon(Icons.Default.Share, contentDescription = "Share Code")
                        Spacer(modifier = Modifier.width(8.dp))
                        Text("Share via WhatsApp / SMS")
                    }
                }
            }

            // Wallet Rewards Summary Card
            Card(
                modifier = Modifier.fillMaxWidth(),
                shape = DropCarsTheme.CornerLg,
                colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surfaceVariant)
            ) {
                Column(modifier = Modifier.padding(16.dp)) {
                    Text("Referral Rewards Wallet", style = MaterialTheme.typography.titleMedium)
                    Text("₹300.00", style = MaterialTheme.typography.headlineMedium, color = GreenSuccess)
                    Text("3 friends successfully completed their first ride!", style = MaterialTheme.typography.bodyMedium)
                }
            }
        }
    }
}
