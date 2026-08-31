package com.symbiote.foregroundservice

import android.os.Bundle
import android.os.ResultReceiver
import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.WritableArray
import com.facebook.react.bridge.WritableMap
import java.lang.ref.WeakReference

internal data class NotificationConfig(
    val channelId: String,
    val channelName: String,
    val channelDescription: String?,
    val title: String,
    val body: String?,
    val smallIcon: String?,
    val stopActionLabel: String?,
    val notificationId: Int,
)

internal data class StartConfig(
    val sessionId: String,
    val taskKey: String,
    val data: Bundle,
    val types: Set<String>,
    val notification: NotificationConfig,
    val taskTimeoutMs: Long,
)

internal data class NotificationUpdate(val title: String, val body: String?)

internal data class ServiceError(val code: String, val message: String)

internal data class ServiceSnapshot(
    val status: String = STATUS_STOPPED,
    val sessionId: String? = null,
    val taskKey: String? = null,
    val types: Set<String> = emptySet(),
    val notificationId: Int? = null,
    val startedAt: Long? = null,
    val stopReason: String? = null,
    val error: ServiceError? = null,
) {
  fun toWritableMap(): WritableMap =
      Arguments.createMap().apply {
        putString("status", status)
        if (taskKey == null) putNull("taskKey") else putString("taskKey", taskKey)
        putArray("types", types.toWritableArray())
        if (notificationId == null) putNull("notificationId") else putInt("notificationId", notificationId)
        if (startedAt == null) putNull("startedAt") else putDouble("startedAt", startedAt.toDouble())
        if (stopReason == null) putNull("stopReason") else putString("stopReason", stopReason)
        if (error == null) {
          putNull("error")
        } else {
          putMap(
              "error",
              Arguments.createMap().apply {
                putString("code", error.code)
                putString("message", error.message)
              },
          )
        }
      }

  companion object {
    const val STATUS_STOPPED = "stopped"
  }
}

private fun Set<String>.toWritableArray(): WritableArray =
    Arguments.createArray().also { array -> forEach(array::pushString) }

internal object ForegroundServiceRuntime {
  private var snapshot = ServiceSnapshot()
  private val terminalSessions = TerminalSessionRegistry()
  private val startReceivers = OneShotSessionRegistry<ResultReceiver>()
  private var module = WeakReference<SymbioteForegroundServiceModule>(null)
  private var service = WeakReference<SymbioteForegroundService>(null)

  @Synchronized
  fun attachModule(value: SymbioteForegroundServiceModule) {
    module = WeakReference(value)
  }

  @Synchronized
  fun detachModule(value: SymbioteForegroundServiceModule) {
    if (module.get() === value) module.clear()
  }

  @Synchronized
  fun attachService(value: SymbioteForegroundService) {
    service = WeakReference(value)
  }

  @Synchronized
  fun detachService(value: SymbioteForegroundService) {
    if (service.get() === value) service.clear()
  }

  @Synchronized fun current(): ServiceSnapshot = snapshot
  @Synchronized fun wasTerminal(sessionId: String): Boolean = sessionId in terminalSessions
  @Synchronized fun hasActiveSession(): Boolean = snapshot.status in ACTIVE_STATUSES
  @Synchronized
  fun hasActiveSessionOtherThan(sessionId: String): Boolean =
      snapshot.status in ACTIVE_STATUSES && snapshot.sessionId != sessionId

  @Synchronized
  fun registerStartReceiver(sessionId: String, receiver: ResultReceiver) {
    startReceivers.register(sessionId, receiver)
  }

  fun resolveStart(sessionId: String): Boolean {
    val receiver = takeStartReceiver(sessionId) ?: return false
    receiver.send(SymbioteForegroundServiceModule.RESULT_OK, null)
    return true
  }

  fun rejectStart(sessionId: String, code: String, message: String): Boolean {
    val receiver = takeStartReceiver(sessionId) ?: return false
    receiver.send(
        SymbioteForegroundServiceModule.RESULT_ERROR,
        Bundle().apply {
          putString(SymbioteForegroundServiceModule.RESULT_CODE, code)
          putString(SymbioteForegroundServiceModule.RESULT_MESSAGE, message)
        },
    )
    return true
  }

  fun tryStarting(config: StartConfig): Boolean {
    val next = config.startingSnapshot()
    val target =
        synchronized(this) {
          if (snapshot.status in ACTIVE_STATUSES || service.get() != null) return false
          snapshot = next
          module.get()
        }
    target?.emit("starting", next)
    return true
  }

  fun admitService(config: StartConfig): Boolean {
    val target: SymbioteForegroundServiceModule?
    val next: ServiceSnapshot
    synchronized(this) {
      if (config.sessionId in terminalSessions) return false
      if (snapshot.sessionId == config.sessionId && snapshot.status in ACTIVE_STATUSES) return true
      if (snapshot.status in ACTIVE_STATUSES) return false
      next = config.startingSnapshot()
      snapshot = next
      target = module.get()
    }
    target?.emit("starting", next)
    return true
  }

  fun running(config: StartConfig) {
    val target: SymbioteForegroundServiceModule?
    val next: ServiceSnapshot
    synchronized(this) {
      if (snapshot.sessionId != config.sessionId || snapshot.status != "starting") return
      next =
          config.startingSnapshot().copy(
              status = "running",
              startedAt = System.currentTimeMillis(),
          )
      snapshot = next
      target = module.get()
    }
    target?.emit("started", next)
  }

  fun notificationUpdated(sessionId: String) {
    val target: SymbioteForegroundServiceModule?
    val next: ServiceSnapshot
    synchronized(this) {
      if (snapshot.sessionId != sessionId || snapshot.status != "running") return
      next = snapshot.copy(error = null)
      snapshot = next
      target = module.get()
    }
    target?.emit("notificationUpdated", next)
  }

  fun requestStop(reason: String): Boolean {
    val target: SymbioteForegroundService?
    val sessionId: String?
    synchronized(this) {
      if (snapshot.status !in ACTIVE_STATUSES) return false
      sessionId = snapshot.sessionId
      sessionId?.let(terminalSessions::remember)
      target = service.get()
    }
    sessionId?.let {
      rejectStart(it, SymbioteForegroundServiceModule.ERROR_START_CANCELLED, "Foreground service start was cancelled")
    }
    stopping(reason)
    return target?.requestStop(reason) == true
  }

  fun stopping(reason: String) {
    val target: SymbioteForegroundServiceModule?
    val next: ServiceSnapshot
    synchronized(this) {
      if (snapshot.status !in STOPPABLE_STATUSES) return
      next = snapshot.copy(status = "stopping", stopReason = reason, error = null)
      snapshot = next
      target = module.get()
    }
    target?.emit("stopping", next)
  }

  fun stopped(sessionId: String?, reason: String) {
    val target: SymbioteForegroundServiceModule?
    val next: ServiceSnapshot
    synchronized(this) {
      if (sessionId != null && snapshot.sessionId != null && snapshot.sessionId != sessionId) return
      if (snapshot.status == "failed") return
      if (snapshot.status == "stopped" && snapshot.stopReason == reason) return
      if (sessionId != null && reason != SymbioteForegroundServiceModule.STOP_DESTROYED) {
        terminalSessions.remember(sessionId)
      }
      next = snapshot.copy(status = "stopped", stopReason = reason, error = null)
      snapshot = next
      target = module.get()
    }
    target?.emit("stopped", next)
    sessionId?.let {
      rejectStart(it, SymbioteForegroundServiceModule.ERROR_START_CANCELLED, "Foreground service stopped before start completed")
    }
  }

  fun failed(sessionId: String?, code: String, message: String) {
    val target: SymbioteForegroundServiceModule?
    val next: ServiceSnapshot
    synchronized(this) {
      if (sessionId == null && snapshot.status in ACTIVE_STATUSES) return
      if (sessionId != null && snapshot.sessionId != null && snapshot.sessionId != sessionId) return
      sessionId?.let(terminalSessions::remember)
      next =
          if (sessionId == null) {
            ServiceSnapshot(
                status = "failed",
                stopReason = "startFailed",
                error = ServiceError(code, message),
            )
          } else {
            snapshot.copy(
                status = "failed",
                stopReason = "startFailed",
                error = ServiceError(code, message),
            )
          }
      snapshot = next
      target = module.get()
    }
    target?.emit("failed", next)
    sessionId?.let { rejectStart(it, code, message) }
  }

  fun updateNotification(options: NotificationUpdate): Boolean =
      synchronized(this) { service.get() }?.updateNotification(options) == true

  private fun takeStartReceiver(sessionId: String): ResultReceiver? = startReceivers.take(sessionId)

  private fun StartConfig.startingSnapshot(): ServiceSnapshot =
      ServiceSnapshot(
          status = "starting",
          sessionId = sessionId,
          taskKey = taskKey,
          types = types,
          notificationId = notification.notificationId,
      )

  private val STOPPABLE_STATUSES = setOf("starting", "running")
  private val ACTIVE_STATUSES = STOPPABLE_STATUSES + "stopping"
}
