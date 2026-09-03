package com.symbiote.foregroundservice

import android.annotation.SuppressLint
import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.content.pm.ServiceInfo
import android.os.Build
import android.os.Bundle
import androidx.core.app.NotificationCompat
import androidx.core.app.ServiceCompat
import com.facebook.react.HeadlessJsTaskService
import com.facebook.react.ReactInstanceEventListener
import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.JavaScriptModule
import com.facebook.react.bridge.ReactContext
import com.facebook.react.bridge.UiThreadUtil
import com.facebook.react.internal.featureflags.ReactNativeNewArchitectureFeatureFlags
import com.facebook.react.jstasks.HeadlessJsTaskConfig
import com.facebook.react.jstasks.HeadlessJsTaskContext

private interface AppRegistry : JavaScriptModule {
  fun cancelHeadlessTask(taskId: Int, taskKey: String)
}

class SymbioteForegroundService : HeadlessJsTaskService() {
  private var activeConfig: StartConfig? = null
  private val taskOwnership = HeadlessTaskOwnership()
  private var taskContext: ReactContext? = null
  private var stopRequested = false
  private var stopReason = SymbioteForegroundServiceModule.STOP_DESTROYED
  private var removePendingContextListener: (() -> Unit)? = null

  override fun onCreate() {
    super.onCreate()
    ForegroundServiceRuntime.attachService(this)
  }

  override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
    if (intent?.action == SymbioteForegroundServiceModule.ACTION_STOP) {
      val reason = SymbioteForegroundServiceModule.STOP_NOTIFICATION_ACTION
      if (!ForegroundServiceRuntime.requestStop(reason)) requestStop(reason)
      return START_NOT_STICKY
    }

    val config =
        try {
          requireNotNull(intent) { "Foreground service started without an intent" }.toStartConfig()
        } catch (error: RuntimeException) {
          if (activeConfig != null || ForegroundServiceRuntime.hasActiveSession()) {
            return START_NOT_STICKY
          }
          fail(null, "E_INVALID_INTENT", error, startId)
          return START_NOT_STICKY
        }

    val current = activeConfig
    // A stop/timeout tombstone wins over redelivery, including while the original service instance
    // is still unwinding. Otherwise a late same-session intent could re-promote its notification.
    if (ForegroundServiceRuntime.wasTerminal(config.sessionId)) {
      reportStartError(config, SymbioteForegroundServiceModule.ERROR_START_CANCELLED, "Foreground service start was cancelled")
      if (current == null && !ForegroundServiceRuntime.hasActiveSessionOtherThan(config.sessionId)) {
        stopReason = SymbioteForegroundServiceModule.STOP_REQUESTED
        stopSelfResult(startId)
      }
      return START_NOT_STICKY
    }
    if (current?.sessionId == config.sessionId) {
      return try {
        // Keep notification updates made after the original intent instead of restoring stale text.
        showForeground(current)
        ForegroundServiceRuntime.resolveStart(config.sessionId)
        START_REDELIVER_INTENT
      } catch (error: SecurityException) {
        fail(
            current.sessionId,
            SymbioteForegroundServiceModule.ERROR_PERMISSION_DENIED,
            error,
            startId,
        )
        START_NOT_STICKY
      } catch (error: RuntimeException) {
        fail(current.sessionId, "E_SERVICE_START", error, startId)
        START_NOT_STICKY
      }
    }
    if (current != null) {
      reportStartError(config, "E_ALREADY_RUNNING", "A different foreground-service session is active")
      return START_NOT_STICKY
    }
    if (!ForegroundServiceRuntime.admitService(config)) {
      reportStartError(config, "E_ALREADY_RUNNING", "A foreground service is already active")
      if (!ForegroundServiceRuntime.hasActiveSessionOtherThan(config.sessionId)) {
        stopSelfResult(startId)
      }
      return START_NOT_STICKY
    }

    return try {
      activeConfig = config
      showForeground(config)
      ForegroundServiceRuntime.running(config)
      scheduleHeadlessTask(config)
      // The task-start listener retains the payload only until a cold React context is ready.
      activeConfig = config.copy(data = Bundle())
      val acknowledged = ForegroundServiceRuntime.resolveStart(config.sessionId)
      if (!acknowledged && ForegroundServiceRuntime.wasTerminal(config.sessionId)) {
        requestStop(SymbioteForegroundServiceModule.STOP_START_FAILED)
        START_NOT_STICKY
      } else {
        // No receiver is normal after process death/redelivery: the original JS caller no longer
        // exists, but the persisted intent still owns a valid foreground/headless session.
        START_REDELIVER_INTENT
      }
    } catch (error: SecurityException) {
      fail(
          config.sessionId,
          SymbioteForegroundServiceModule.ERROR_PERMISSION_DENIED,
          error,
          startId,
      )
      START_NOT_STICKY
    } catch (error: RuntimeException) {
      fail(config.sessionId, "E_SERVICE_START", error, startId)
      START_NOT_STICKY
    }
  }

  override fun onHeadlessJsTaskFinish(taskId: Int) {
    // HeadlessJsTaskContext broadcasts every task in the React context to every listener. Only the
    // exact ID returned when this service started its task belongs to this lifecycle.
    if (!taskOwnership.finishIfOwned(taskId)) return
    detachTaskListener()
    if (!stopRequested) stopReason = SymbioteForegroundServiceModule.STOP_TASK_FINISHED
    stopSelf()
  }

  override fun onDestroy() {
    clearPendingContextListener()
    val shouldCancelTask = !stopRequested && taskOwnership.taskId != null
    stopRequested = true
    if (shouldCancelTask) cancelActiveTask()
    // Stop may arrive after onCreate but before onStartCommand has populated activeConfig.
    // The runtime already admitted that session, so use it to publish the terminal state.
    val sessionId = activeConfig?.sessionId ?: ForegroundServiceRuntime.current().sessionId
    activeConfig = null
    stopForeground(STOP_FOREGROUND_REMOVE)
    ForegroundServiceRuntime.detachService(this)
    detachTaskListener()
    if (sessionId != null) ForegroundServiceRuntime.stopped(sessionId, stopReason)
    super.onDestroy()
  }

  internal fun requestStop(reason: String): Boolean {
    if (stopRequested) return true
    stopRequested = true
    stopReason = reason
    clearPendingContextListener()
    cancelActiveTask()
    stopForeground(STOP_FOREGROUND_REMOVE)
    stopSelf()
    return true
  }

  internal fun updateNotification(update: NotificationUpdate): Boolean {
    if (stopRequested) return false
    val current = activeConfig ?: return false
    val updated =
        current.copy(
            notification =
                current.notification.copy(
                    title = update.title,
                    body = update.body,
                )
        )
    activeConfig = updated
    getSystemService(NotificationManager::class.java)
        .notify(updated.notification.notificationId, buildNotification(updated.notification))
    ForegroundServiceRuntime.notificationUpdated(updated.sessionId)
    return true
  }

  private fun scheduleHeadlessTask(config: StartConfig) {
    acquireWakeLockNow(this)
    val context = reactContext
    if (context != null) {
      startOwnedTask(context, config)
      return
    }
    createReactContextAndScheduleTask(config)
  }

  @Suppress("DEPRECATION")
  private fun createReactContextAndScheduleTask(config: StartConfig) {
    lateinit var listener: ReactInstanceEventListener
    listener =
        object : ReactInstanceEventListener {
          override fun onReactContextInitialized(context: ReactContext) {
            clearPendingContextListener()
            UiThreadUtil.runOnUiThread {
              if (!stopRequested) startOwnedTask(context, config)
            }
          }
        }

    if (ReactNativeNewArchitectureFeatureFlags.enableBridgelessArchitecture()) {
      val host = checkNotNull(reactHost)
      // A ready host may invoke the listener inline, so install its remover first.
      removePendingContextListener = { host.removeReactInstanceEventListener(listener) }
      host.addReactInstanceEventListener(listener)
      host.start()
    } else {
      val manager = reactNativeHost.reactInstanceManager
      removePendingContextListener = { manager.removeReactInstanceEventListener(listener) }
      manager.addReactInstanceEventListener(listener)
      manager.createReactContextInBackground()
    }
  }

  private fun startOwnedTask(context: ReactContext, config: StartConfig) {
    val tasks = HeadlessJsTaskContext.getInstance(context)
    tasks.addTaskEventListener(this)
    taskContext = context
    taskOwnership.record(tasks.startTask(config.toTaskConfig()))
  }

  private fun StartConfig.toTaskConfig(): HeadlessJsTaskConfig =
      HeadlessJsTaskConfig(
          taskKey,
          Arguments.fromBundle(data),
          taskTimeoutMs,
          true,
      )

  private fun cancelActiveTask() {
    val taskId = taskOwnership.take() ?: return
    val config = activeConfig
    val context = taskContext
    if (config != null && context != null) {
      try {
        context.getJSModule(AppRegistry::class.java).cancelHeadlessTask(taskId, config.taskKey)
      } catch (_: RuntimeException) {
        // Native completion below is authoritative even when JS is already unavailable.
      }
      val tasks = HeadlessJsTaskContext.getInstance(context)
      if (tasks.isTaskRunning(taskId)) tasks.finishTask(taskId)
    }
  }

  private fun detachTaskListener() {
    taskContext?.let { HeadlessJsTaskContext.getInstance(it).removeTaskEventListener(this) }
    taskContext = null
  }

  private fun clearPendingContextListener() {
    removePendingContextListener?.invoke()
    removePendingContextListener = null
  }

  private fun showForeground(config: StartConfig) {
    createChannel(config.notification)
    ServiceCompat.startForeground(
        this,
        config.notification.notificationId,
        buildNotification(config.notification),
        foregroundServiceTypeMask(config.types),
    )
  }

  private fun createChannel(config: NotificationConfig) {
    if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return
    val channel =
        NotificationChannel(
            config.channelId,
            config.channelName,
            NotificationManager.IMPORTANCE_LOW,
        )
    channel.description = config.channelDescription
    getSystemService(NotificationManager::class.java).createNotificationChannel(channel)
  }

  private fun buildNotification(config: NotificationConfig): Notification {
    val icon = resolveIcon(config.smallIcon)
    val builder =
        NotificationCompat.Builder(this, config.channelId)
            .setSmallIcon(icon)
            .setContentTitle(config.title)
            .setOngoing(true)
            .setOnlyAlertOnce(true)
            .setPriority(NotificationCompat.PRIORITY_LOW)
            .setCategory(NotificationCompat.CATEGORY_SERVICE)
    config.body?.let(builder::setContentText)
    launchPendingIntent()?.let(builder::setContentIntent)
    config.stopActionLabel?.let { label ->
      builder.addAction(icon, label, stopPendingIntent(config.notificationId))
    }
    return builder.build()
  }

  @SuppressLint("DiscouragedApi") // Resource names cross the JS/native boundary by design.
  private fun resolveIcon(name: String?): Int {
    if (name != null) {
      val drawable = resources.getIdentifier(name, "drawable", packageName)
      if (drawable != 0) return drawable
      val mipmap = resources.getIdentifier(name, "mipmap", packageName)
      require(mipmap != 0) { "Notification icon resource \"$name\" was not found" }
      return mipmap
    }
    return applicationInfo.icon.also {
      require(it != 0) { "The application has no notification icon" }
    }
  }

  private fun launchPendingIntent(): PendingIntent? {
    val launchIntent = packageManager.getLaunchIntentForPackage(packageName) ?: return null
    return PendingIntent.getActivity(
        this,
        0,
        launchIntent,
        PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
    )
  }

  private fun stopPendingIntent(notificationId: Int): PendingIntent =
      PendingIntent.getService(
          this,
          notificationId,
          Intent(this, SymbioteForegroundService::class.java).apply {
            action = SymbioteForegroundServiceModule.ACTION_STOP
          },
          PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
      )

  private fun foregroundServiceTypeMask(types: Set<String>): Int {
    if (Build.VERSION.SDK_INT < Build.VERSION_CODES.Q) return 0
    var mask = 0
    if (SymbioteForegroundServiceModule.TYPE_MEDIA_PLAYBACK in types) {
      mask = mask or ServiceInfo.FOREGROUND_SERVICE_TYPE_MEDIA_PLAYBACK
    }
    if (
        Build.VERSION.SDK_INT >= Build.VERSION_CODES.R &&
            SymbioteForegroundServiceModule.TYPE_MICROPHONE in types
    ) {
      mask = mask or ServiceInfo.FOREGROUND_SERVICE_TYPE_MICROPHONE
    }
    return mask
  }

  private fun reportStartError(config: StartConfig, code: String, message: String) {
    ForegroundServiceRuntime.rejectStart(config.sessionId, code, message)
  }

  private fun fail(
      sessionId: String?,
      code: String,
      error: Throwable,
      startId: Int,
  ) {
    val message = error.message ?: error.javaClass.simpleName
    ForegroundServiceRuntime.failed(sessionId, code, message)
    stopRequested = true
    stopReason = SymbioteForegroundServiceModule.STOP_START_FAILED
    clearPendingContextListener()
    cancelActiveTask()
    if (activeConfig?.sessionId == sessionId) activeConfig = null
    stopForeground(STOP_FOREGROUND_REMOVE)
    stopSelfResult(startId)
  }

  private fun Intent.toStartConfig(): StartConfig {
    val types = requireNotNull(getStringArrayListExtra(EXTRA_TYPES)).toSet()
    require(types.isNotEmpty()) { "Foreground service types are missing" }
    return StartConfig(
        sessionId = requireNotNull(getStringExtra(EXTRA_SESSION_ID)),
        taskKey = requireNotNull(getStringExtra(EXTRA_TASK_KEY)),
        data = getBundleExtra(EXTRA_DATA) ?: Bundle(),
        types = types,
        notification =
            NotificationConfig(
                channelId = requireNotNull(getStringExtra(EXTRA_CHANNEL_ID)),
                channelName = requireNotNull(getStringExtra(EXTRA_CHANNEL_NAME)),
                channelDescription = getStringExtra(EXTRA_CHANNEL_DESCRIPTION),
                title = requireNotNull(getStringExtra(EXTRA_TITLE)),
                body = getStringExtra(EXTRA_BODY),
                smallIcon = getStringExtra(EXTRA_SMALL_ICON),
                stopActionLabel = getStringExtra(EXTRA_STOP_ACTION_LABEL),
                notificationId = getIntExtra(EXTRA_NOTIFICATION_ID, 0).also { require(it > 0) },
            ),
        taskTimeoutMs = getLongExtra(EXTRA_TASK_TIMEOUT, 0),
    )
  }

  companion object {
    private const val EXTRA_SESSION_ID = "sessionId"
    private const val EXTRA_TASK_KEY = "taskKey"
    private const val EXTRA_DATA = "data"
    private const val EXTRA_TYPES = "types"
    private const val EXTRA_CHANNEL_ID = "channelId"
    private const val EXTRA_CHANNEL_NAME = "channelName"
    private const val EXTRA_CHANNEL_DESCRIPTION = "channelDescription"
    private const val EXTRA_TITLE = "title"
    private const val EXTRA_BODY = "body"
    private const val EXTRA_SMALL_ICON = "smallIcon"
    private const val EXTRA_STOP_ACTION_LABEL = "stopActionLabel"
    private const val EXTRA_NOTIFICATION_ID = "notificationId"
    private const val EXTRA_TASK_TIMEOUT = "taskTimeoutMs"

    internal fun startIntent(context: Context, config: StartConfig): Intent =
        Intent(context, SymbioteForegroundService::class.java).apply {
          putExtra(EXTRA_SESSION_ID, config.sessionId)
          putExtra(EXTRA_TASK_KEY, config.taskKey)
          putExtra(EXTRA_DATA, config.data)
          putStringArrayListExtra(EXTRA_TYPES, ArrayList(config.types))
          putExtra(EXTRA_CHANNEL_ID, config.notification.channelId)
          putExtra(EXTRA_CHANNEL_NAME, config.notification.channelName)
          putExtra(EXTRA_CHANNEL_DESCRIPTION, config.notification.channelDescription)
          putExtra(EXTRA_TITLE, config.notification.title)
          putExtra(EXTRA_BODY, config.notification.body)
          putExtra(EXTRA_SMALL_ICON, config.notification.smallIcon)
          putExtra(EXTRA_STOP_ACTION_LABEL, config.notification.stopActionLabel)
          putExtra(EXTRA_NOTIFICATION_ID, config.notification.notificationId)
          putExtra(EXTRA_TASK_TIMEOUT, config.taskTimeoutMs)
        }
  }
}
