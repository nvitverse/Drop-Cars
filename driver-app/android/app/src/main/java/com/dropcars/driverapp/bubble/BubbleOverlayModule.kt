package com.dropcars.driverapp.bubble

import android.content.Intent
import android.net.Uri
import android.os.Build
import android.provider.Settings
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod

/**
 * JS-facing bridge for the floating "new booking" overlay bubble.
 *
 * Registered the standard (non-codegen) NativeModule way. This project has
 * the New Architecture enabled (see app.json "newArchEnabled"), but React
 * Native's TurboModule interop layer (on by default since RN 0.74) still
 * bridges plain ReactContextBaseJavaModule modules like this one without
 * requiring a codegen spec, so no extra New Architecture wiring is needed.
 */
class BubbleOverlayModule(reactContext: ReactApplicationContext) :
  ReactContextBaseJavaModule(reactContext) {

  override fun getName() = "BubbleOverlayModule"

  @ReactMethod
  fun hasOverlayPermission(promise: Promise) {
    val granted = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
      Settings.canDrawOverlays(reactApplicationContext)
    } else {
      // SYSTEM_ALERT_WINDOW was a normal (install-time only) permission
      // before Android 6.0 Marshmallow - the manifest declaration alone is
      // sufficient and there is no runtime grant/check to perform.
      true
    }
    promise.resolve(granted)
  }

  @ReactMethod
  fun requestOverlayPermission(promise: Promise) {
    if (Build.VERSION.SDK_INT < Build.VERSION_CODES.M) {
      promise.resolve(null)
      return
    }
    try {
      val intent = Intent(
        Settings.ACTION_MANAGE_OVERLAY_PERMISSION,
        Uri.parse("package:" + reactApplicationContext.packageName)
      ).apply {
        addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
      }
      reactApplicationContext.startActivity(intent)
      promise.resolve(null)
    } catch (e: Exception) {
      promise.reject("OVERLAY_SETTINGS_UNAVAILABLE", e)
    }
  }

  @ReactMethod
  fun showBubble(tripType: String, fare: String, bookingId: String) {
    val context = reactApplicationContext
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M && !Settings.canDrawOverlays(context)) {
      // JS is expected to gate this call on hasOverlayPermission() already;
      // this is just a last-resort guard against a stale JS-side flag.
      return
    }
    val intent = Intent(context, BubbleOverlayService::class.java).apply {
      action = BubbleOverlayService.ACTION_SHOW
      putExtra(BubbleOverlayService.EXTRA_TRIP_TYPE, tripType)
      putExtra(BubbleOverlayService.EXTRA_FARE, fare)
      putExtra(BubbleOverlayService.EXTRA_BOOKING_ID, bookingId)
    }
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
      context.startForegroundService(intent)
    } else {
      context.startService(intent)
    }
  }

  @ReactMethod
  fun hideBubble() {
    val context = reactApplicationContext
    val intent = Intent(context, BubbleOverlayService::class.java).apply {
      action = BubbleOverlayService.ACTION_HIDE
    }
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
      context.startForegroundService(intent)
    } else {
      context.startService(intent)
    }
  }

  // Keeps the app process alive (via a low-priority "watching for bookings"
  // foreground notification) for as long as the driver is logged in and has
  // opted in - so an FCM push has a live JS runtime to wake instead of a
  // killed process, which is what actually made background bubbles
  // unreliable before. Call once after login (if opted in) / once on logout.
  @ReactMethod
  fun startPersistentService(promise: Promise) {
    val context = reactApplicationContext
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M && !Settings.canDrawOverlays(context)) {
      promise.resolve(false)
      return
    }
    val intent = Intent(context, BubbleOverlayService::class.java).apply {
      action = BubbleOverlayService.ACTION_START_PERSISTENT
    }
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
      context.startForegroundService(intent)
    } else {
      context.startService(intent)
    }
    promise.resolve(true)
  }

  @ReactMethod
  fun stopPersistentService() {
    val context = reactApplicationContext
    val intent = Intent(context, BubbleOverlayService::class.java).apply {
      action = BubbleOverlayService.ACTION_STOP_PERSISTENT
    }
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
      context.startForegroundService(intent)
    } else {
      context.startService(intent)
    }
  }
}
