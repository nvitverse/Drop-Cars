package in.dropcars.app.service

import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.os.Build
import androidx.core.app.NotificationCompat
import com.google.firebase.messaging.FirebaseMessagingService
import com.google.firebase.messaging.RemoteMessage
import dagger.hilt.android.AndroidEntryPoint
import in.dropcars.app.MainActivity
import in.dropcars.app.data.api.DropCarsApi
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import javax.inject.Inject

@AndroidEntryPoint
class DropCarsFcmService : FirebaseMessagingService() {

    @Inject
    lateinit var api: DropCarsApi

    override fun onNewToken(token: String) {
        super.onNewToken(token)
        // Register token with backend
        CoroutineScope(Dispatchers.IO).launch {
            try {
                api.registerFcmToken(mapOf("fcm_token" to token))
            } catch (e: Exception) {
                e.printStackTrace()
            }
        }
    }

    override fun onMessageReceived(remoteMessage: RemoteMessage) {
        super.onMessageReceived(remoteMessage)

        val data = remoteMessage.data
        val type = data["type"] ?: "DEFAULT"
        val orderId = data["order_id"]

        val title = when (type) {
            "ORDER_ACCEPTED" -> "Order Accepted!"
            "DRIVER_ASSIGNED" -> "Driver Assigned"
            "TRIP_STARTED" -> "Trip Started"
            "TRIP_ENDED" -> "Trip Completed"
            "CANCELLED" -> "Booking Cancelled"
            "WALLET_CREDITED" -> "Wallet Credited"
            else -> remoteMessage.notification?.title ?: "Drop Cars Alert"
        }

        val message = when (type) {
            "ORDER_ACCEPTED" -> "Order #$orderId has been accepted."
            "DRIVER_ASSIGNED" -> "Driver ${data["driver_name"]} assigned for Order #$orderId."
            "TRIP_STARTED" -> "Trip #$orderId is now in progress."
            "TRIP_ENDED" -> "Trip #$orderId completed. Distance: ${data["total_km"]} km."
            "CANCELLED" -> "Order #$orderId has been cancelled."
            "WALLET_CREDITED" -> "₹${data["amount"]} credited to your wallet."
            else -> remoteMessage.notification?.body ?: "New notification from Drop Cars"
        }

        showNotification(title, message)
    }

    private fun showNotification(title: String, message: String) {
        val channelId = "dropcars_notifications"
        val notificationManager = getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            val channel = NotificationChannel(
                channelId,
                "Drop Cars Notifications",
                NotificationManager.IMPORTANCE_HIGH
            )
            notificationManager.createNotificationChannel(channel)
        }

        val intent = Intent(this, MainActivity::class.java).apply {
            flags = Intent.FLAG_ACTIVITY_CLEAR_TOP or Intent.FLAG_ACTIVITY_SINGLE_TOP
        }

        val pendingIntent = PendingIntent.getActivity(
            this,
            0,
            intent,
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
        )

        val notification = NotificationCompat.Builder(this, channelId)
            .setSmallIcon(android.R.drawable.ic_dialog_info)
            .setContentTitle(title)
            .setContentText(message)
            .setAutoCancel(true)
            .setContentIntent(pendingIntent)
            .setPriority(NotificationCompat.PRIORITY_HIGH)
            .build()

        notificationManager.notify(System.currentTimeMillis().toInt(), notification)
    }
}
