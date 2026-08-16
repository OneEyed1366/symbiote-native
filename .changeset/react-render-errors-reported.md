---
'@symbiote-native/engine': minor
'@symbiote-native/react': minor
---

Stop the React adapter from swallowing render errors. `createContainer` takes three error
callbacks and all three were `noop`: a throw anywhere in render made the reconciler abandon the
commit, so nothing painted - and nothing was logged either. The app showed a blank screen with an
empty console, which reads as "the renderer is broken" rather than "your component threw". It cost
this repo a workaround already: a test that needed to prove a throw had to wrap the tree in an
error boundary, because `mount()` itself reported nothing.

All three now route to the host: uncaught (no boundary), caught (a boundary handled it, which
decides what the USER sees, not whether the developer hears about it), and recovered. React's own
defaults do the same thing - `reportGlobalError` / `console.error` in ReactFiberErrorLogger - and
React Native wraps them again to reach the redbox.

The fourth callback, `onDefaultTransitionIndicator`, stays a no-op on purpose. RN's own renderer
says why in as many words: "Native doesn't have a default indicator."

New engine export `reportUncaughtError(error, { origin, componentStack })`, the shared seam for
any adapter that catches something its framework would otherwise have surfaced itself. It reaches
`global.ErrorUtils` on a native host - the documented global RN's own
`Libraries/vendor/core/ErrorUtils.js` is a one-line re-export of, so no deep import into RN's
internals - and falls back to `console.error` anywhere else. Exactly one channel, never both: RN
routes `console.error` into LogBox too, and upstream suppresses its own log for that same reason.
A thrown non-Error is wrapped so the reporter still gets a message and a stack, and the component
stack is attached the way LogBox reads it.

This is deliberately not the `dlog` channel. `dlog` is DEBUG-gated and therefore the developer's;
an error that blanked the screen has to reach the app whether or not anyone turned diagnostics on.
