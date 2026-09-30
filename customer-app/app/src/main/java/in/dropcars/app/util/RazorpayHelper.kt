package in.dropcars.app.util

import android.app.Activity
import com.razorpay.Checkout
import org.json.JSONObject

object RazorpayHelper {

    // Test Razorpay Key ID - replace with production key in deployment
    private const val RAZORPAY_KEY_ID = "rzp_test_dropcars123"

    fun startPayment(
        activity: Activity,
        orderId: String,
        amountInPaise: Int,
        userEmail: String = "customer@dropcars.in",
        userPhone: String = "9876543210"
    ) {
        val checkout = Checkout()
        checkout.setKeyID(RAZORPAY_KEY_ID)

        try {
            val options = JSONObject().apply {
                put("name", "Drop Cars")
                put("description", "Wallet Top-up")
                put("order_id", orderId)
                put("currency", "INR")
                put("amount", amountInPaise)
                put("prefill", JSONObject().apply {
                    put("email", userEmail)
                    put("contact", userPhone)
                })
                put("theme", JSONObject().apply {
                    put("color", "#0EA5E9")
                })
            }

            checkout.open(activity, options)
        } catch (e: Exception) {
            e.printStackTrace()
        }
    }
}
