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
 *
 * This must run as a foreground service (not a plain background Service)
 * because from Android 8 (API 26) onward the OS aggressively kills plain
 * background services within seconds of the app leaving the foreground; the
 * mandatory persistent notification is the trade-off Android requires in
 * exchange for keeping the overlay window alive while the driver is outside
 * the app.
 */
class BubbleOverlayService : Service() {

  private var windowManager: WindowManager? = null
  private var bubbleView: View? = null
  private var pulseAnimator: ValueAnimator? = null

  // Set once START_PERSISTENT is received; keeps the service (and process)
  // alive across ACTION_HIDE / bubble-tap instead of stopSelf()-ing, so FCM
  // pushes reach a live JS runtime instead of a killed one. Reset to false
  // only by ACTION_STOP_PERSISTENT (driver goes offline / logs out).
  private var isPersistent = false

  companion object {
    const val ACTION_SHOW = "com.dropcars.driverapp.bubble.ACTION_SHOW"
    const val ACTION_HIDE = "com.dropcars.driverapp.bubble.ACTION_HIDE"
    const val ACTION_START_PERSISTENT = "com.dropcars.driverapp.bubble.ACTION_START_PERSISTENT"
    const val ACTION_STOP_PERSISTENT = "com.dropcars.driverapp.bubble.ACTION_STOP_PERSISTENT"
    const val EXTRA_TRIP_TYPE = "tripType"
    const val EXTRA_FARE = "fare"
    const val EXTRA_BOOKING_ID = "bookingId"

    // Where the driver last dragged the bubble to - survives the bubble being
    // replaced by a new-booking alert or re-shown after returning to the app.
    private var lastX: Int? = null
    private var lastY: Int? = null

    private const val FOREGROUND_CHANNEL_ID = "dropcars-bubble-service"
    private const val FOREGROUND_NOTIFICATION_ID = 9021

    // Must match the scheme + host already wired into AndroidManifest.xml's
    // MainActivity intent-filter and consumed by app/bubble-tap.tsx.
    private const val TAP_DEEP_LINK = "exp+dropcars3://bubble-tap"
  }

  override fun onBind(intent: Intent?): IBinder? = null

  override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
    // Any service started via startForegroundService() MUST call
    // startForeground() within a few seconds, even on the path that's about
    // to immediately stop itself (ACTION_HIDE) - otherwise the OS throws
    // ANR-style "did not call startForeground" and kills the app.
    startForeground(FOREGROUND_NOTIFICATION_ID, buildServiceNotification())

    when (intent?.action) {
      null -> {
        // System-triggered restart after the process was killed (START_STICKY
        // redelivers a null Intent) - nothing to do beyond the
        // startForeground() call above, which already restores the "online"
        // notification. Not a fresh ACTION_SHOW, so don't render a bubble.
      }
      ACTION_START_PERSISTENT -> {
        isPersistent = true
        // Notification content already reflects "online" via
        // buildServiceNotification() - nothing else to do, startForeground()
        // above already keeps the process alive going forward.
      }
      ACTION_STOP_PERSISTENT -> {
        isPersistent = false
        removeBubble()
        stopSelf()
      }
      ACTION_HIDE -> {
        removeBubble()
        // Only tear the whole service down if nothing else needs it kept
        // alive - a driver who's online still needs the process running to
        // catch the next booking, even after dismissing this one's bubble.
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
          // LOW on purpose: this channel only backs the mandatory "a
          // foreground service is running" notification. The actual booking
          // alert sound/vibration already fired a moment earlier from the
          // FCM push notification's own channel.
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
    // FLAG_IMMUTABLE has been required for PendingIntents targeting API 31+
    // since it's a security requirement (prevents the receiving app from
    // mutating the Intent); harmless to add unconditionally from API 23+.
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

    // Chat-head style: a circular icon bubble showing the Drop Cars logo instead of the previous
    // text-only card, whose small "New Booking" label read as a stray
    // letter at a glance. The fare, if known, sits in a small pill just
    // below the circle so the driver still gets it without opening the app.
    val outer = LinearLayout(this).apply {
      orientation = LinearLayout.VERTICAL
      gravity = Gravity.CENTER_HORIZONTAL
    }

    val circleSize = dp(56)
    // No elevation/shadow: on a TRANSLUCENT overlay window the elevation
    // shadow is drawn from the view's rectangular bounds and showed up as a
    // square outline around the round icon.
    val circle = android.widget.FrameLayout(this).apply {
      background = GradientDrawable().apply {
        shape = GradientDrawable.OVAL
        setColor(Color.WHITE)
        setStroke(dp(2), Color.parseColor("#4D8DFF"))
      }
    }
    val circleParams = LinearLayout.LayoutParams(circleSize, circleSize)
    outer.addView(circle, circleParams)

    // The Drop Cars logo (round launcher icon) fills the circle, like the Rapido / Uber driver bubbles show their logo.
    // Clipped to an oval so the logo is a perfect circle with no square corners.
    circle.addView(android.widget.ImageView(this).apply {
      setImageResource(com.dropcars.driverapp.R.mipmap.ic_launcher_round)
      scaleType = android.widget.ImageView.ScaleType.CENTER_CROP
      clipToOutline = true
      outlineProvider = object : android.view.ViewOutlineProvider() {
        override fun getOutline(view: View, outline: android.graphics.Outline) {
          outline.setOval(0, 0, view.width, view.height)
        }
      }
      layoutParams = android.widget.FrameLayout.LayoutParams(
        android.widget.FrameLayout.LayoutParams.MATCH_PARENT,
        android.widget.FrameLayout.LayoutParams.MATCH_PARENT
      )
    })

    // Small pulsing dot badge to draw the eye, like a chat-head unread
    // marker - only for an actual new-booking alert (a real bookingId).
    // The always-on idle bubble (see ACTION_SHOW_IDLE) has nothing unread
    // to flag, so it stays plain.
    if (bookingId.isNotBlank()) {
      val badgeSize = dp(14)
      circle.addView(View(this).apply {
        background = GradientDrawable().apply {
          shape = GradientDrawable.OVAL
          setColor(Color.parseColor("#FF3B30"))
          setStroke(dp(2), Color.WHITE)
        }
        layoutParams = android.widget.FrameLayout.LayoutParams(badgeSize, badgeSize).apply {
          gravity = Gravity.TOP or Gravity.END
        }
      })
    }

    if (fare.isNotBlank()) {
      outer.addView(TextView(this).apply {
        text = fare
        setTextColor(Color.WHITE)
        textSize = 12f
        typeface = Typeface.DEFAULT_BOLD
        gravity = Gravity.CENTER
        setPadding(dp(8), dp(3), dp(8), dp(3))
        background = GradientDrawable().apply {
          shape = GradientDrawable.RECTANGLE
          cornerRadius = dp(10).toFloat()
          setColor(Color.parseColor("#1F6FEB"))
        }
      }, LinearLayout.LayoutParams(LinearLayout.LayoutParams.WRAP_CONTENT, LinearLayout.LayoutParams.WRAP_CONTENT).apply {
        topMargin = dp(4)
        gravity = Gravity.CENTER_HORIZONTAL
      })
    }

    // Padding around the icon so the pulse zoom renders INSIDE the overlay
    // window. The window is sized to its content, so scaling the whole view
    // past 1.0 pushed the round icon beyond the window's square bounds and
    // it got clipped - the round bubble looked like it was zooming out of a
    // box. The pulse now scales only the circle, into this padding.
    val pad = dp(12)
    val root = android.widget.FrameLayout(this).apply {
      clipChildren = false
      clipToPadding = false
      setPadding(pad, pad, pad, pad)
      addView(outer, android.widget.FrameLayout.LayoutParams(
        android.widget.FrameLayout.LayoutParams.WRAP_CONTENT,
        android.widget.FrameLayout.LayoutParams.WRAP_CONTENT
      ))
    }
    val container = root

    val overlayType = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
      // TYPE_APPLICATION_OVERLAY is the only overlay window type non-system
      // apps are allowed to use from API 26 onward - TYPE_SYSTEM_ALERT and
      // TYPE_PHONE were both blocked for third-party apps starting Android 8.
      WindowManager.LayoutParams.TYPE_APPLICATION_OVERLAY
    } else {
      @Suppress("DEPRECATION")
      WindowManager.LayoutParams.TYPE_PHONE
    }

    val screen = resources.displayMetrics
    val bubbleWidth = circleSize + 2 * pad
    // TOP|START so x/y are plain offsets from the top-left - simple drag
    // math. Reopens where the driver last left it (lastX/lastY), otherwise
    // starts at the right edge.
    val params = WindowManager.LayoutParams(
      WindowManager.LayoutParams.WRAP_CONTENT,
      WindowManager.LayoutParams.WRAP_CONTENT,
      overlayType,
      WindowManager.LayoutParams.FLAG_NOT_FOCUSABLE,
      PixelFormat.TRANSLUCENT
    ).apply {
      gravity = Gravity.TOP or Gravity.START
      x = lastX ?: (screen.widthPixels - bubbleWidth - dp(2))
      y = lastY ?: dp(160)
    }

    // Drag to move, tap to open. A touch only counts as a tap if the finger
    // never travelled past the system touch slop.
    val slop = android.view.ViewConfiguration.get(this).scaledTouchSlop
    var downRawX = 0f
    var downRawY = 0f
    var startX = 0
    var startY = 0
    var moved = false
    container.setOnTouchListener { v, ev ->
      when (ev.actionMasked) {
        android.view.MotionEvent.ACTION_DOWN -> {
          downRawX = ev.rawX
          downRawY = ev.rawY
          startX = params.x
          startY = params.y
          moved = false
          pulseAnimator?.cancel()
          circle.scaleX = 0.92f
          circle.scaleY = 0.92f
          true
        }
        android.view.MotionEvent.ACTION_MOVE -> {
          val dx = ev.rawX - downRawX
          val dy = ev.rawY - downRawY
          if (!moved && (kotlin.math.abs(dx) > slop || kotlin.math.abs(dy) > slop)) moved = true
          if (moved) {
            params.x = (startX + dx).toInt().coerceIn(0, (screen.widthPixels - v.width).coerceAtLeast(0))
            params.y = (startY + dy).toInt().coerceIn(0, (screen.heightPixels - v.height).coerceAtLeast(0))
            runCatching { wm.updateViewLayout(v, params) }
          }
          true
        }
        android.view.MotionEvent.ACTION_UP -> {
          circle.scaleX = 1f
          circle.scaleY = 1f
          if (!moved) {
            openBookingAndDismiss(bookingId)
          } else {
            snapToEdge(v, params, screen.widthPixels)
            startPulse(circle)
          }
          true
        }
        android.view.MotionEvent.ACTION_CANCEL -> {
          circle.scaleX = 1f
          circle.scaleY = 1f
          startPulse(circle)
          true
        }
        else -> false
      }
    }

    runCatching { wm.addView(container, params) }
      .onSuccess {
        bubbleView = container
        startPulse(circle)
      }
  }

  // After a drag, glide to the nearest side edge (like a chat head) and
  // remember the spot so the next bubble reappears there.
  private fun snapToEdge(view: View, params: WindowManager.LayoutParams, screenWidth: Int) {
    val maxX = (screenWidth - view.width).coerceAtLeast(0)
    val target = if (params.x + view.width / 2 < screenWidth / 2) 0 else maxX
    lastX = target
    lastY = params.y
    ValueAnimator.ofInt(params.x, target).apply {
      duration = 180
      addUpdateListener {
        params.x = it.animatedValue as Int
        runCatching { windowManager?.updateViewLayout(view, params) }
      }
      start()
    }
  }

  private fun startPulse(target: View) {
    pulseAnimator?.cancel()
    pulseAnimator = ValueAnimator.ofFloat(1f, 1.08f, 1f).apply {
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
    // Same rule as ACTION_HIDE: a driver who opted into persistent
    // background watching still needs the service alive to catch the
    // NEXT booking after tapping into this one - unconditionally
    // stopping here (as this used to) would silently turn that off,
    // relying on BubbleContext's AppState listener to accidentally
    // restart it once the app resumes. Fixed 2026-09-04.
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
