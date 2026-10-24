package com.dropcars.dropcarsadmin.alertoverlay

import android.content.Intent
import android.net.Uri
import android.os.Build
import android.os.PowerManager
import android.provider.Settings
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod

/**
 * JS-facing bridge for the staff alert bubble ("display over other apps") and the battery-whitelist helpers.
 */
class StaffAlertOverlayModule(reactContext: ReactApplicationContext) :
  ReactContextBaseJavaModule(reactContext) {

  override fun getName() = "StaffAlertOverlayModule"

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
    val intent = Intent(context, StaffAlertOverlayService::class.java).apply {
      action = StaffAlertOverlayService.ACTION_SHOW
      putExtra(StaffAlertOverlayService.EXTRA_TRIP_TYPE, tripType)
      putExtra(StaffAlertOverlayService.EXTRA_FARE, fare)
      putExtra(StaffAlertOverlayService.EXTRA_BOOKING_ID, bookingId)
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
    val intent = Intent(context, StaffAlertOverlayService::class.java).apply {
      action = StaffAlertOverlayService.ACTION_HIDE
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
    val intent = Intent(context, StaffAlertOverlayService::class.java).apply {
      action = StaffAlertOverlayService.ACTION_START_PERSISTENT
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
    val intent = Intent(context, StaffAlertOverlayService::class.java).apply {
      action = StaffAlertOverlayService.ACTION_STOP_PERSISTENT
    }
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
      context.startForegroundService(intent)
    } else {
      context.startService(intent)
    }
  }

  /** True when Android is NOT allowed to put this app to sleep (battery optimisation is off for it). */
  @ReactMethod
  fun isIgnoringBatteryOptimizations(promise: Promise) {
    if (Build.VERSION.SDK_INT < Build.VERSION_CODES.M) {
      promise.resolve(true)
      return
    }
    val pm = reactApplicationContext.getSystemService(android.content.Context.POWER_SERVICE) as PowerManager
    promise.resolve(pm.isIgnoringBatteryOptimizations(reactApplicationContext.packageName))
  }

  /** Opens the system dialog "Allow this app to always run in the background?" (falls back to the battery settings list). */
  @ReactMethod
  fun requestIgnoreBatteryOptimizations(promise: Promise) {
    if (Build.VERSION.SDK_INT < Build.VERSION_CODES.M) {
      promise.resolve(null)
      return
    }
    try {
      val intent = Intent(
        Settings.ACTION_REQUEST_IGNORE_BATTERY_OPTIMIZATIONS,
        Uri.parse("package:" + reactApplicationContext.packageName)
      ).apply { addFlags(Intent.FLAG_ACTIVITY_NEW_TASK) }
      reactApplicationContext.startActivity(intent)
      promise.resolve(null)
    } catch (e: Exception) {
      try {
        val fallback = Intent(Settings.ACTION_IGNORE_BATTERY_OPTIMIZATION_SETTINGS).apply { addFlags(Intent.FLAG_ACTIVITY_NEW_TASK) }
        reactApplicationContext.startActivity(fallback)
        promise.resolve(null)
      } catch (e2: Exception) {
        promise.reject("BATTERY_SETTINGS_UNAVAILABLE", e2)
      }
    }
  }
}
