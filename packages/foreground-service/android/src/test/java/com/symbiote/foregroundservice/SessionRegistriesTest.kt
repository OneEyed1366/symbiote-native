package com.symbiote.foregroundservice

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

class SessionRegistriesTest {
  @Test
  fun `terminal sessions coexist`() {
    val registry = TerminalSessionRegistry()

    registry.remember("old-session")
    registry.remember("new-session")

    assertTrue("old-session" in registry)
    assertTrue("new-session" in registry)
  }

  @Test
  fun `terminal registry stays bounded and retains refreshed sessions`() {
    val registry = TerminalSessionRegistry(capacity = 2)

    registry.remember("first")
    registry.remember("second")
    registry.remember("first")
    registry.remember("third")

    assertTrue("first" in registry)
    assertTrue("third" in registry)
    assertFalse("second" in registry)
  }

  @Test
  fun `one-shot values settle once without consuming another session`() {
    val registry = OneShotSessionRegistry<String>()
    registry.register("first", "one")
    registry.register("second", "two")

    assertEquals("one", registry.take("first"))
    assertNull(registry.take("first"))
    assertEquals("two", registry.take("second"))
  }

  @Test
  fun `headless ownership ignores another task and clears only its own`() {
    val ownership = HeadlessTaskOwnership()

    ownership.record(7)

    assertFalse(ownership.finishIfOwned(8))
    assertEquals(7, ownership.taskId)
    assertTrue(ownership.finishIfOwned(7))
    assertNull(ownership.taskId)
  }

  @Test
  fun `headless ownership can be taken only once for cancellation`() {
    val ownership = HeadlessTaskOwnership()
    ownership.record(9)

    assertEquals(9, ownership.take())
    assertNull(ownership.take())
  }
}
