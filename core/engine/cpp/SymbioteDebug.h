#pragma once

#include <string>
#include <vector>

// Diagnostic logging for the C++ half of the engine — the twin of `core/engine/src/debug.ts`, and
// until 2026-09-18 it did not exist at all.
//
// WHY IT HAD TO. The commit path, the payload builder and every tag rule live here now, and this
// translation unit's only way to say anything was `throw jsi::JSError` — so a C++ rule could crash
// or stay silent, with nothing in between. `<keep_logs_gate_behind_DEBUG>` asks new code with
// non-trivial runtime behavior to log at its seam as a matter of course; that was unsatisfiable on
// this side of the wire, and the first rule that wanted a developer WARNING rather than a crash
// (ScrollView's ignored `horizontal`) is what made the gap block a port.
//
// THE SWITCH IS THE SAME ONE, pushed down rather than re-invented: `DEBUG=1` in the environment or
// `globalThis.__SYMBIOTE_DEBUG__` in JS. `installBindings` reads both at install, and
// `setDebugEnabled` is exposed so a later JS toggle reaches this side too — otherwise the runtime
// escape hatch that exists for hosts where the env is unreachable would silently stop at the
// boundary.
//
// THE MESSAGE IS BUILT ONLY WHEN THE SWITCH IS ON, and the macro is what guarantees it. C++ has the
// same trap the JS module's header describes: an argument is evaluated at the CALL SITE, so a
// `debugLog("x " + std::to_string(y))` on the per-node commit path costs its concatenation whether
// or not anything is listening. `SYMBIOTE_DLOG` tests the flag first, so the expression is not
// evaluated at all when logging is off — which makes the cheap thing the DEFAULT rather than a rule
// every call site has to remember. Call `debugLog` directly only where the argument is already a
// built string.
//
// WHERE IT GOES. stderr, so a device build surfaces it in the Xcode console and in logcat without
// any bridge of its own. It is also RETAINED while the switch is on, which is what makes a log
// assertable from a test rather than merely visible to a human — `takeDebugLog` drains it. Nothing
// is retained while the switch is off, because nothing is called.

namespace symbiote {

/** One relaxed atomic read. The gate on every call site; see `SYMBIOTE_DLOG`. */
bool debugEnabled();

void setDebugEnabled(bool enabled);

/** Prefixed, written to stderr, and retained for `takeDebugLog`. */
void debugLog(const std::string &message);

/** Drains the retained lines. The test-facing read, and the reason retention exists. */
std::vector<std::string> takeDebugLog();

} // namespace symbiote

// Guards BEFORE evaluating, so building the message costs nothing with logging off.
#define SYMBIOTE_DLOG(expr)                                                    \
  do {                                                                         \
    if (::symbiote::debugEnabled()) ::symbiote::debugLog((expr));              \
  } while (false)
