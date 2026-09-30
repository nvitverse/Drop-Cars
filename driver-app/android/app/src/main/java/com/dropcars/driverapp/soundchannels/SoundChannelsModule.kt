package com.dropcars.driverapp.soundchannels

import android.app.NotificationChannel
import android.app.NotificationManager
import android.content.ContentUris
import android.content.ContentValues
import android.content.Context
import android.content.Intent
import android.media.AudioAttributes
import android.net.Uri
import android.os.Build
import android.provider.MediaStore
import androidx.core.content.FileProvider
import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import java.io.File
import java.io.InputStream
import java.net.HttpURLConnection
import java.net.URL

/**
 * Notification channels whose sound is an admin-uploaded MP3.
 *
 * Android plays a notification's sound from its channel, even when the app is
 * closed, and a channel's sound can never change after creation. So every
 * uploaded MP3 gets its own channel id (the backend puts a hash of the URL in
 * it): this module downloads the MP3 once, stores it where the system can
 * read it, and creates that channel. Channels are prefixed "dcs-".
 */
class SoundChannelsModule(private val reactContext: ReactApplicationContext) :
  ReactContextBaseJavaModule(reactContext) {

  override fun getName(): String = "SoundChannels"

  private val nm: NotificationManager
    get() = reactContext.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager

  @ReactMethod
  fun listChannels(promise: Promise) {
    val out = Arguments.createArray()
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
      nm.notificationChannels.filter { it.id.startsWith(PREFIX) }.forEach { out.pushString(it.id) }
    }
    promise.resolve(out)
  }

  @ReactMethod
  fun deleteChannel(channelId: String, promise: Promise) {
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O && channelId.startsWith(PREFIX)) {
      nm.deleteNotificationChannel(channelId)
    }
    promise.resolve(true)
  }

  /** Download [url] (if needed) and create [channelId] with it as the sound. Runs off the UI thread. */
  @ReactMethod
  fun ensureChannel(channelId: String, name: String, url: String, urgent: Boolean, promise: Promise) {
    if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) {
      promise.resolve(false) // no channels before Android 8; the app's normal sound is used
      return
    }
    if (!channelId.startsWith(PREFIX)) {
      promise.reject("E_CHANNEL", "channel id must start with $PREFIX")
      return
    }
    if (nm.getNotificationChannel(channelId) != null) {
      promise.resolve(true)
      return
    }
    Thread {
      try {
        val soundUri = storeSound(channelId, url)
        val attrs = AudioAttributes.Builder()
          .setUsage(AudioAttributes.USAGE_NOTIFICATION)
          .setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION)
          .build()
        val channel = NotificationChannel(channelId, name, NotificationManager.IMPORTANCE_HIGH)
        channel.setSound(soundUri, attrs)
        channel.enableVibration(true)
        channel.vibrationPattern = if (urgent) longArrayOf(0, 400, 200, 400, 200, 400) else longArrayOf(0, 250, 250, 250)
        channel.lockscreenVisibility = android.app.Notification.VISIBILITY_PUBLIC
        channel.setShowBadge(true)
        nm.createNotificationChannel(channel)
        promise.resolve(true)
      } catch (e: Exception) {
        promise.reject("E_SOUND", e.message ?: "could not create sound channel", e)
      }
    }.start()
  }

  private fun download(url: String): Pair<ByteArray, String> {
    val conn = URL(url).openConnection() as HttpURLConnection
    conn.connectTimeout = 15000
    conn.readTimeout = 30000
    conn.instanceFollowRedirects = true
    try {
      if (conn.responseCode !in 200..299) throw IllegalStateException("download failed: HTTP ${conn.responseCode}")
      val type = conn.contentType ?: "audio/mpeg"
      val bytes = conn.inputStream.use(InputStream::readBytes)
      if (bytes.isEmpty() || bytes.size > MAX_BYTES) throw IllegalStateException("sound file is empty or larger than 5 MB")
      return Pair(bytes, type)
    } finally {
      conn.disconnect()
    }
  }

  private fun storeSound(channelId: String, url: String): Uri {
    val (bytes, type) = download(url)
    val mime = if (type.startsWith("audio/")) type.substringBefore(';') else "audio/mpeg"
    val ext = if (mime.contains("wav")) "wav" else if (mime.contains("ogg")) "ogg" else "mp3"
    val fileName = "$channelId.$ext"

    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
      // Android 10+: a notification sound in shared storage, readable by the
      // system sound player, no storage permission needed.
      val resolver = reactContext.contentResolver
      val collection = MediaStore.Audio.Media.getContentUri(MediaStore.VOLUME_EXTERNAL_PRIMARY)
      resolver.query(
        collection, arrayOf(MediaStore.Audio.Media._ID),
        "${MediaStore.Audio.Media.DISPLAY_NAME}=?", arrayOf(fileName), null
      )?.use { c ->
        if (c.moveToFirst()) return ContentUris.withAppendedId(collection, c.getLong(0))
      }
      val values = ContentValues().apply {
        put(MediaStore.Audio.Media.DISPLAY_NAME, fileName)
        put(MediaStore.Audio.Media.MIME_TYPE, mime)
        put(MediaStore.Audio.Media.RELATIVE_PATH, "Notifications/DropCars/")
        put(MediaStore.Audio.Media.IS_NOTIFICATION, 1)
        put(MediaStore.Audio.Media.IS_PENDING, 1)
      }
      val uri = resolver.insert(collection, values) ?: throw IllegalStateException("could not save sound")
      resolver.openOutputStream(uri)?.use { it.write(bytes) } ?: throw IllegalStateException("could not write sound")
      values.clear()
      values.put(MediaStore.Audio.Media.IS_PENDING, 0)
      resolver.update(uri, values, null, null)
      return uri
    }

    // Android 8-9: app-private file shared with the system UI through our FileProvider.
    val dir = File(reactContext.filesDir, "notification_sounds").apply { mkdirs() }
    val file = File(dir, fileName)
    if (!file.exists()) file.writeBytes(bytes)
    val uri = FileProvider.getUriForFile(reactContext, reactContext.packageName + ".soundchannels", file)
    for (pkg in listOf("com.android.systemui", "android")) {
      reactContext.grantUriPermission(pkg, uri, Intent.FLAG_GRANT_READ_URI_PERMISSION)
    }
    return uri
  }

  companion object {
    const val PREFIX = "dcs-"
    const val MAX_BYTES = 5 * 1024 * 1024
  }
}
