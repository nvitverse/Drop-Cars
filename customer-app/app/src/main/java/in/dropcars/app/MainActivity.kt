package in.dropcars.app

import android.os.Bundle
import android.widget.Toast
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import androidx.navigation.compose.rememberNavController
import com.razorpay.PaymentData
import com.razorpay.PaymentResultWithDataListener
import dagger.hilt.android.AndroidEntryPoint
import in.dropcars.app.data.local.AuthTokenManager
import in.dropcars.app.data.repository.WalletRepository
import in.dropcars.app.ui.navigation.DropCarsNavGraph
import in.dropcars.app.ui.theme.DropCarsTheme
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import javax.inject.Inject

@AndroidEntryPoint
class MainActivity : ComponentActivity(), PaymentResultWithDataListener {

    @Inject
    lateinit var tokenManager: AuthTokenManager

    @Inject
    lateinit var walletRepository: WalletRepository

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate()
        enableEdgeToEdge()

        setContent {
            DropCarsTheme {
                val navController = rememberNavController()
                DropCarsNavGraph(
                    navController = navController,
                    tokenManager = tokenManager
                )
            }
        }
    }

    override fun onPaymentSuccess(razorpayPaymentId: String?, paymentData: PaymentData?) {
        val orderId = paymentData?.orderId
        val signature = paymentData?.signature

        if (orderId != null && razorpayPaymentId != null && signature != null) {
            CoroutineScope(Dispatchers.IO).launch {
                walletRepository.verifyRazorpayPayment(orderId, razorpayPaymentId, signature)
                    .onSuccess {
                        runOnUiThread {
                            Toast.makeText(this@MainActivity, "Wallet Top-up Successful!", Toast.LENGTH_LONG).show()
                        }
                    }
                    .onFailure { error ->
                        runOnUiThread {
                            Toast.makeText(this@MainActivity, "Payment Verification Failed: ${error.message}", Toast.LENGTH_LONG).show()
                        }
                    }
            }
        } else {
            Toast.makeText(this, "Payment successful! ID: $razorpayPaymentId", Toast.LENGTH_LONG).show()
        }
    }

    override fun onPaymentError(code: Int, response: String?, paymentData: PaymentData?) {
        Toast.makeText(this, "Payment Failed ($code): $response", Toast.LENGTH_LONG).show()
    }
}
