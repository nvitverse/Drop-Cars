package com.dropcars.driverapp.bubble

import android.animation.ValueAnimator
import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.Service
import android.content.Context
import android.content.Intent
import android.graphics.Color
import android.graphics.PixelFormat
import android.graphics.Typeface
import android.graphics.drawable.GradientDrawable
import android.net.Uri
import android.os.Build
import android.os.IBinder
import android.view.Gravity
import android.view.View
import android.view.WindowManager
import android.widget.LinearLayout
import android.widget.TextView
import androidx.core.app.NotificationCompat
import com.dropcars.driverapp.MainActivity

/**
 * Foreground service that owns the single floating "new booking" bubble.
 */
class BubbleOverlayService : Service() {

  private var windowManager: WindowManager? = null
  private var bubbleView: View? = null
  private var pulseAnimator: ValueAnimator? = null
  private var isPersistent = false

  companion object {
    const val ACTION_SHOW = "com.dropcars.driverapp.bubble.ACTION_SHOW"
    const val ACTION_HIDE = "com.dropcars.driverapp.bubble.ACTION_HIDE"
    const val ACTION_START_PERSISTENT = "com.dropcars.driverapp.bubble.ACTION_START_PERSISTENT"
    const val ACTION_STOP_PERSISTENT = "com.dropcars.driverapp.bubble.ACTION_STOP_PERSISTENT"
    const val EXTRA_TRIP_TYPE = "tripType"
    const val EXTRA_FARE = "fare"
    const val EXTRA_BOOKING_ID = "bookingId"

    private const val FOREGROUND_CHANNEL_ID = "dropcars-bubble-service"
    private const val FOREGROUND_NOTIFICATION_ID = 9021

    private const val TAP_DEEP_LINK = "exp+dropcars3://bubble-tap"
  }

  override fun onBind(intent: Intent?): IBinder? = null

  override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
    startForeground(FOREGROUND_NOTIFICATION_ID, buildServiceNotification())

    when (intent?.action) {
      null -> {}
      ACTION_START_PERSISTENT -> {
        isPersistent = true
      }
      ACTION_STOP_PERSISTENT -> {
        isPersistent = false
        removeBubble()
        stopSelf()
      }
      ACTION_HIDE -> {
        removeBubble()
        if (!isPersistent) stopSelf()
      }
      else -> {
        val tripType = intent?.getStringExtra(EXTRA_TRIP_TYPE) ?: "Trip"
        val fare = intent?.getStringExtra(EXTRA_FARE) ?: ""
        val bookingId = intent?.getStringExtra(EXTRA_BOOKING_ID) ?: ""
        showBubble(tripType, fare, bookingId)
      }
    }
    return START_STICKY
  }

  override fun onDestroy() {
    removeBubble()
    super.onDestroy()
  }

  private fun buildServiceNotification(): Notification {
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
      val manager = getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
      if (manager.getNotificationChannel(FOREGROUND_CHANNEL_ID) == null) {
        val channel = NotificationChannel(
          FOREGROUND_CHANNEL_ID,
          "New booking bubble",
          NotificationManager.IMPORTANCE_LOW
        ).apply {
          description = "Keeps the floating new-booking bubble visible over other apps"
        }
        manager.createNotificationChannel(channel)
      }
    }

    val contentIntent = PendingIntent.getActivity(
      this,
      0,
      Intent(this, MainActivity::class.java).apply {
        addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TOP)
      },
      pendingIntentFlags()
    )

    val title = if (isPersistent) "Drop Cars - watching for bookings" else "New booking bubble is on"
    val text = if (isPersistent)
      "You'll be alerted the moment a new booking comes in, even with the app closed"
    else
      "Tap a bubble to jump straight to that booking"

    return NotificationCompat.Builder(this, FOREGROUND_CHANNEL_ID)
      .setContentTitle(title)
      .setContentText(text)
      .setSmallIcon(applicationInfo.icon)
      .setOngoing(true)
      .setContentIntent(contentIntent)
      .build()
  }

  private fun pendingIntentFlags(): Int {
    return if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
      PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
    } else {
      PendingIntent.FLAG_UPDATE_CURRENT
    }
  }

  private fun showBubble(tripType: String, fare: String, bookingId: String) {
    removeBubble()

    val wm = getSystemService(Context.WINDOW_SERVICE) as WindowManager
    windowManager = wm

    val density = resources.displayMetrics.density
    fun dp(value: Int) = (value * density).toInt()

    val container = LinearLayout(this).apply {
      orientation = LinearLayout.VERTICAL
      setPadding(dp(14), dp(10), dp(14), dp(10))
      background = GradientDrawable().apply {
        shape = GradientDrawable.RECTANGLE
        cornerRadius = dp(20).toFloat()
        setColor(Color.parseColor("#1F6FEB"))
      }
      elevation = dp(6).toFloat()
    }

    container.addView(TextView(this).apply {
      text = tripType
      setTextColor(Color.WHITE)
      textSize = 11f
      typeface = Typeface.DEFAULT_BOLD
      alpha = 0.85f
    })

    if (fare.isNotBlank()) {
      container.addView(TextView(this).apply {
        text = fare
        setTextColor(Color.WHITE)
        textSize = 17f
        typeface = Typeface.DEFAULT_BOLD
      })
    }

    val badge = View(this).apply {
      background = GradientDrawable().apply {
        shape = GradientDrawable.OVAL
        setColor(Color.parseColor("#FF3B30"))
      }
    }
    val badgeSize = dp(10)
    val badgeParams = LinearLayout.LayoutParams(badgeSize, badgeSize).apply {
      gravity = Gravity.END
      topMargin = -dp(4)
    }
    container.addView(badge, badgeParams)

    container.setOnClickListener {
      openBookingAndDismiss(bookingId)
    }

    val overlayType = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
      WindowManager.LayoutParams.TYPE_APPLICATION_OVERLAY
    } else {
      @Suppress("DEPRECATION")
      WindowManager.LayoutParams.TYPE_PHONE
    }

    val params = WindowManager.LayoutParams(
      WindowManager.LayoutParams.WRAP_CONTENT,
      WindowManager.LayoutParams.WRAP_CONTENT,
      overlayType,
      WindowManager.LayoutParams.FLAG_NOT_FOCUSABLE,
      PixelFormat.TRANSLUCENT
    ).apply {
      gravity = Gravity.TOP or Gravity.END
      x = dp(8)
      y = dp(160)
    }

    runCatching { wm.addView(container, params) }
      .onSuccess {
        bubbleView = container
        startPulse(container)
      }
  }

  private fun startPulse(target: View) {
    pulseAnimator?.cancel()
    pulseAnimator = ValueAnimator.ofFloat(1f, 1.1f, 1f).apply {
      duration = 1200
      repeatCount = ValueAnimator.INFINITE
      addUpdateListener {
        val scale = it.animatedValue as Float
        target.scaleX = scale
        target.scaleY = scale
      }
      start()
    }
  }

  private fun openBookingAndDismiss(bookingId: String) {
    val uri = Uri.parse("$TAP_DEEP_LINK?bookingId=" + Uri.encode(bookingId))
    val intent = Intent(Intent.ACTION_VIEW, uri).apply {
      setPackage(applicationContext.packageName)
      addFlags(
        Intent.FLAG_ACTIVITY_NEW_TASK or
          Intent.FLAG_ACTIVITY_CLEAR_TOP or
          Intent.FLAG_ACTIVITY_SINGLE_TOP
      )
    }
    runCatching { startActivity(intent) }
    removeBubble()
    if (!isPersistent) stopSelf()
  }

  private fun removeBubble() {
    pulseAnimator?.cancel()
    pulseAnimator = null
    val view = bubbleView
    if (view != null) {
      runCatching { windowManager?.removeView(view) }
      bubbleView = null
    }
  }
}
