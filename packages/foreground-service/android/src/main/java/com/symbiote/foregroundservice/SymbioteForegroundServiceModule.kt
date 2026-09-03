package com.symbiote.foregroundservice

import android.Manifest
import android.content.Intent
import android.content.pm.PackageManager
import android.os.Bundle
import android.os.Handler
import android.os.Looper
import android.os.ResultReceiver
import androidx.core.content.ContextCompat
import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import com.facebook.react.bridge.ReadableArray
import com.facebook.react.bridge.ReadableMap
import com.facebook.react.bridge.ReadableType
import java.util.UUID

class SymbioteForegroundServiceModule(reactContext: ReactApplicationContext) :
    ReactContextBaseJavaModule(reactContext) {

  @Volatile private var listenerCount = 0
  private val mainHandler = Handler(Looper.getMainLooper())

  override fun getName(): String = NAME

  override fun initialize() {
    super.initialize()
    ForegroundServiceRuntime.attachModule(this)
  }

  override fun invalidate() {
    ForegroundServiceRuntime.detachModule(this)
    super.invalidate()
  }

  @ReactMethod
  fun start(options: ReadableMap, promise: Promise) {
    val config =
        try {
          parseStartConfig(options)
        } catch (error: RuntimeException) {
          promise.reject(ERROR_INVALID_OPTIONS, error.message, error)
          return
        }

    if (
        TYPE_MICROPHONE in config.types &&
            ContextCompat.checkSelfPermission(
                reactApplicationContext,
                Manifest.permission.RECORD_AUDIO,
            ) != PackageManager.PERMISSION_GRANTED
    ) {
      promise.reject(
          ERROR_MICROPHONE_PERMISSION,
          "RECORD_AUDIO must be granted before starting a microphone foreground service",
      )
      return
    }
    if (!ForegroundServiceRuntime.tryStarting(config)) {
      promise.reject(ERROR_ALREADY_RUNNING, "A foreground service is already active")
      return
    }

    val receiver =
        object : ResultReceiver(mainHandler) {
          override fun onReceiveResult(resultCode: Int, resultData: Bundle?) {
            if (resultCode == RESULT_OK) {
              promise.resolve(null)
            } else {
              promise.reject(
                  resultData?.getString(RESULT_CODE) ?: ERROR_NATIVE,
                  resultData?.getString(RESULT_MESSAGE) ?: "Foreground service failed to start",
              )
            }
          }
        }
    ForegroundServiceRuntime.registerStartReceiver(config.sessionId, receiver)
    scheduleStartTimeout(config.sessionId)

    try {
      ContextCompat.startForegroundService(
          reactApplicationContext,
          SymbioteForegroundService.startIntent(reactApplicationContext, config),
      )
    } catch (error: SecurityException) {
      failStart(config, ERROR_PERMISSION_DENIED, error)
    } catch (error: IllegalStateException) {
      failStart(config, ERROR_START_NOT_ALLOWED, error)
    } catch (error: RuntimeException) {
      failStart(config, ERROR_NATIVE, error)
    }
  }

  @ReactMethod
  fun updateNotification(options: ReadableMap, promise: Promise) {
    val update =
        try {
          NotificationUpdate(
              title = options.requiredText("title"),
              body = options.optionalString("body"),
          )
        } catch (error: RuntimeException) {
          promise.reject(ERROR_INVALID_OPTIONS, error.message, error)
          return
        }
    mainHandler.post {
      try {
        if (!ForegroundServiceRuntime.updateNotification(update)) {
          promise.reject(ERROR_NOT_RUNNING, "No foreground service is running")
        } else {
          promise.resolve(null)
        }
      } catch (error: RuntimeException) {
        promise.reject(ERROR_NATIVE, error.message, error)
      }
    }
  }

  @ReactMethod
  fun stop(promise: Promise) {
    mainHandler.post {
      try {
        val current = ForegroundServiceRuntime.current()
        if (current.status != ServiceSnapshot.STATUS_STOPPED && current.status != "failed") {
          if (!ForegroundServiceRuntime.requestStop(STOP_REQUESTED)) {
            reactApplicationContext.stopService(
                Intent(reactApplicationContext, SymbioteForegroundService::class.java)
            )
            // No service was attached when requestStop took its snapshot. Publish terminal state
            // now; a late intent carries a terminal session ID and will stop without reviving it.
            ForegroundServiceRuntime.stopped(current.sessionId, STOP_REQUESTED)
          }
        }
        promise.resolve(null)
      } catch (error: RuntimeException) {
        promise.reject(ERROR_NATIVE, error.message, error)
      }
    }
  }

  @ReactMethod
  fun getState(promise: Promise) {
    promise.resolve(ForegroundServiceRuntime.current().toWritableMap())
  }

  @ReactMethod
  fun addListener(eventType: String) {
    if (eventType == EVENT_NAME) listenerCount += 1
  }

  @ReactMethod
  fun removeListeners(count: Double) {
    listenerCount = maxOf(0, listenerCount - count.toInt())
  }

  internal fun emit(eventType: String, snapshot: ServiceSnapshot) {
    if (listenerCount == 0 || !reactApplicationContext.hasActiveReactInstance()) return
    reactApplicationContext.emitDeviceEvent(
        EVENT_NAME,
        Arguments.createMap().apply {
          putString("type", eventType)
          putMap("state", snapshot.toWritableMap())
        },
    )
  }

  private fun scheduleStartTimeout(sessionId: String) {
    mainHandler.postDelayed(
        {
          val message = "Foreground service did not acknowledge startup within ${START_ACK_TIMEOUT_MS}ms"
          if (ForegroundServiceRuntime.rejectStart(sessionId, ERROR_START_TIMEOUT, message)) {
            // The exact session is now terminal. Its eventual intent will stop itself; a global
            // stopService() here could kill a newer session racing this timeout.
            ForegroundServiceRuntime.failed(sessionId, ERROR_START_TIMEOUT, message)
          }
        },
        START_ACK_TIMEOUT_MS,
    )
  }

  private fun parseStartConfig(options: ReadableMap): StartConfig {
    val notification = options.requiredMap("notification")
    val data =
        if (!options.hasKey("data") || options.isNull("data")) {
          Bundle()
        } else {
          Arguments.toBundle(options.requiredMap("data")) ?: Bundle()
        }
    return StartConfig(
        sessionId = UUID.randomUUID().toString(),
        taskKey = options.requiredText("taskKey"),
        data = data,
        types = options.requiredTypes(),
        notification =
            NotificationConfig(
                channelId = notification.requiredText("channelId"),
                channelName = notification.requiredText("channelName"),
                channelDescription = notification.optionalText("channelDescription"),
                title = notification.requiredText("title"),
                body = notification.optionalString("body"),
                smallIcon = notification.optionalText("smallIcon"),
                stopActionLabel = notification.optionalText("stopActionLabel"),
                notificationId = notification.notificationId(),
            ),
        taskTimeoutMs = options.optionalNonNegativeLong("taskTimeoutMs"),
    )
  }

  private fun ReadableMap.notificationId(): Int {
    if (!hasKey("notificationId") || isNull("notificationId")) {
      return DEFAULT_NOTIFICATION_ID
    }
    val raw = getDouble("notificationId")
    require(raw > 0 && raw % 1.0 == 0.0 && raw <= Int.MAX_VALUE) {
      "notification.notificationId must be a positive integer"
    }
    return raw.toInt()
  }

  private fun ReadableMap.optionalNonNegativeLong(key: String): Long {
    if (!hasKey(key) || isNull(key)) return 0
    require(getType(key) == ReadableType.Number) { "$key must be a number" }
    val raw = getDouble(key)
    require(raw.isFinite() && raw >= 0 && raw % 1.0 == 0.0 && raw <= MAX_SAFE_INTEGER) {
      "$key must be a non-negative safe integer"
    }
    return raw.toLong()
  }

  private fun ReadableMap.requiredTypes(): Set<String> {
    val array = requiredArray("types")
    require(array.size() > 0) { "types must not be empty" }
    return buildSet {
      for (index in 0 until array.size()) {
        require(array.getType(index) == ReadableType.String) { "types[$index] must be a string" }
        val type = requireNotNull(array.getString(index))
        require(type == TYPE_MICROPHONE || type == TYPE_MEDIA_PLAYBACK) {
          "Unsupported foreground-service type: $type"
        }
        add(type)
      }
    }
  }

  private fun ReadableMap.requiredText(key: String): String {
    require(hasKey(key) && !isNull(key) && getType(key) == ReadableType.String) {
      "$key must be a string"
    }
    return requireNotNull(getString(key)).trim().also {
      require(it.isNotEmpty()) { "$key must not be empty" }
    }
  }

  private fun ReadableMap.optionalText(key: String): String? {
    val value = optionalString(key)?.trim() ?: return null
    require(value.isNotEmpty()) { "$key must not be empty" }
    return value
  }

  private fun ReadableMap.optionalString(key: String): String? {
    if (!hasKey(key) || isNull(key)) return null
    require(getType(key) == ReadableType.String) { "$key must be a string" }
    return getString(key)
  }

  private fun ReadableMap.requiredMap(key: String): ReadableMap {
    require(hasKey(key) && !isNull(key) && getType(key) == ReadableType.Map) {
      "$key must be an object"
    }
    return requireNotNull(getMap(key))
  }

  private fun ReadableMap.requiredArray(key: String): ReadableArray {
    require(hasKey(key) && !isNull(key) && getType(key) == ReadableType.Array) {
      "$key must be an array"
    }
    return requireNotNull(getArray(key))
  }

  private fun failStart(config: StartConfig, code: String, error: RuntimeException) {
    ForegroundServiceRuntime.failed(
        config.sessionId,
        code,
        error.message ?: error.javaClass.simpleName,
    )
  }

  companion object {
    const val NAME = "SymbioteForegroundService"
    const val EVENT_NAME = "symbioteForegroundServiceStateChanged"
    const val TYPE_MICROPHONE = "microphone"
    const val TYPE_MEDIA_PLAYBACK = "mediaPlayback"
    const val DEFAULT_NOTIFICATION_ID = 13_158

    const val ACTION_STOP = "com.symbiote.foregroundservice.STOP"
    const val STOP_REQUESTED = "requested"
    const val STOP_NOTIFICATION_ACTION = "notificationAction"
    const val STOP_TASK_FINISHED = "taskFinished"
    const val STOP_DESTROYED = "destroyed"
    const val STOP_START_FAILED = "startFailed"

    const val RESULT_OK = 0
    const val RESULT_ERROR = 1
    const val RESULT_CODE = "code"
    const val RESULT_MESSAGE = "message"

    const val ERROR_INVALID_OPTIONS = "E_INVALID_OPTIONS"
    const val ERROR_ALREADY_RUNNING = "E_ALREADY_RUNNING"
    const val ERROR_MICROPHONE_PERMISSION = "E_MICROPHONE_PERMISSION"
    const val ERROR_PERMISSION_DENIED = "E_PERMISSION_DENIED"
    const val ERROR_START_NOT_ALLOWED = "E_START_NOT_ALLOWED"
    const val ERROR_START_CANCELLED = "E_START_CANCELLED"
    const val ERROR_START_TIMEOUT = "E_START_TIMEOUT"
    const val ERROR_NOT_RUNNING = "E_NOT_RUNNING"
    const val ERROR_NATIVE = "E_NATIVE"
    private const val START_ACK_TIMEOUT_MS = 10_000L
    private const val MAX_SAFE_INTEGER = 9_007_199_254_740_991.0
  }
}
