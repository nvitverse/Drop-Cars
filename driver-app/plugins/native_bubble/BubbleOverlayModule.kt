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
 */
class BubbleOverlayModule(reactContext: ReactApplicationContext) :
  ReactContextBaseJavaModule(reactContext) {

  override fun getName() = "BubbleOverlayModule"

  @ReactMethod
  fun hasOverlayPermission(promise: Promise) {
    val granted = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
      Settings.canDrawOverlays(reactApplicationContext)
    } else {
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
