package com.symbiote.foregroundservice

/** Bounded tombstones for starts that must never be revived by a late/redelivered intent. */
internal class TerminalSessionRegistry(private val capacity: Int = 32) {
  private val sessionIds = LinkedHashSet<String>()

  init {
    require(capacity > 0) { "capacity must be positive" }
  }

  @Synchronized
  fun remember(sessionId: String) {
    sessionIds.remove(sessionId)
    sessionIds.add(sessionId)
    while (sessionIds.size > capacity) {
      val iterator = sessionIds.iterator()
      iterator.next()
      iterator.remove()
    }
  }

  @Synchronized operator fun contains(sessionId: String): Boolean = sessionId in sessionIds
}

/** Per-session values consumed by exactly one competing completion path. */
internal class OneShotSessionRegistry<T> {
  private val values = mutableMapOf<String, T>()

  @Synchronized fun register(sessionId: String, value: T) {
    values[sessionId] = value
  }

  @Synchronized fun take(sessionId: String): T? = values.remove(sessionId)
}

/** UI-thread-confined ownership of exactly the task started by this service. */
internal class HeadlessTaskOwnership {
  var taskId: Int? = null
    private set

  fun record(taskId: Int) {
    check(this.taskId == null) { "A headless task is already active" }
    this.taskId = taskId
  }

  fun finishIfOwned(taskId: Int): Boolean {
    if (this.taskId != taskId) return false
    this.taskId = null
    return true
  }

  fun take(): Int? = taskId.also { taskId = null }
}
