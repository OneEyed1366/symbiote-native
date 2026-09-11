---
paths:
  - 'core/engine/src/events/**'
  - 'core/engine/src/fabric.ts'
  - 'core/engine/src/pan-responder/**'
---

# A granted JS responder must tell NATIVE, or it loses every gesture to the scroll view above it

`nativeFabricUIManager.setIsJSResponder(shadowNode, isResponder, blockNativeResponder)` is what
stops a native recogniser — a `UIScrollView`, above all — competing for a gesture JS has claimed.
React's entire contribution is eight lines (`injectGlobalResponderHandler`,
`ReactFabric-dev.js:18862`); everything under the call is stock C++ (`UIManagerBinding.cpp:255` ->
`UIManager::setIsJSResponder`). The engine had no equivalent and `negotiateResponder` said so out
loud — *"we have no native surface to block"* — which read as a statement about our architecture
and was a missing call.

**This gap is real and was found by accident — it did NOT cause the bug that uncovered it, and the
misattribution is the more useful half of this entry.** The first log from the device read:

```
topTouchStart
PanResponder startShouldSet -> true      the box asks for the gesture
topScrollBeginDrag                       ...and the scroll view takes it
topScroll x20                            no topTouchMove anywhere in the log
```

Two absences — no grant, no move — were read as one cause: native took the gesture, so no move
arrived, so the negotiation never got a move to grant on. Coherent, and wrong. Instrumenting every
exit of `negotiateResponder` showed `responder move: nobody wants it` firing on every frame, so the
moves were arriving all along; the log simply had no line for them. The real cause was a Svelte
spread swallowing the handler's return value (`svelte-shim-element-global-must-be-an-ancestor.md`,
"The SIXTH door"), and it explained BOTH absences on its own.

So: **two symptoms that can share a cause are not evidence that they do**, and an absence in a log
is only evidence when something in that log would have printed. Adding one line per exit path cost
minutes and ended a chain of three wrong diagnoses.

## Why nothing headless could see it

Every layer checks out in isolation, and all of them were checked before the cause was found:
the spread compiles to `attribute_effect` and installs all twelve responder listeners; `panHandlers`
carries exactly RN's twelve names; `AnimatedValueXY` in a `transform` commits and updates;
`touchHistory` is maintained; `PanResponder`'s own suite covers dx/dy, velocity and re-init.

The fake Fabric has no scroll view and no gesture recogniser, so **the arm that loses the gesture
does not exist there**. A headless suite can only prove the call is MADE — which is what
`events/native-responder-handover.test.ts` now does, with a negative arm (a node nobody claims
produces no native call) so "the handover happens" cannot be satisfied by one that happens
unconditionally.

## What to check when a gesture "does not react at all"

Read the event stream first, and read it for what is ABSENT:

```
no topTouchMove after topTouchStart      native took the gesture — this rule
topTouchMove but no PanResponder move    the duplicate-frame guard (frameTimestampOf)
move with dx=0                           geometry, not delivery
```

`PanResponder` logs `startShouldSet`, `grant`, and both sides of the frame guard (`move` /
`move SWALLOWED`) under `DEBUG=1`, which splits those three in one drag.

**A gesture that works when dragged sideways and not otherwise is this bug, not a flaky one.** A
vertical ScrollView does not claim a horizontal drag, so a sibling demo doing horizontal drags
keeps working and looks like a counter-example.

The canary had exactly that pair — and on 2026-09-08 the sideways-works/downward-does-not split was
NOT this bug: the two demos also differed in how they bound their handlers (named attributes vs a
spread), and that was the live difference. **When two demos differ in more than one way, the
difference you noticed first is not the one under test.** Enumerate them before drawing a line.

## The rule under it

Anywhere RN's renderer talks to the native side on our behalf, we owe the same call. The seam is
already ours (`getSlot()`), the C++ is stock, and `<native_core_is_untouched>` is not in tension
with this — we are calling an existing slot, not patching one. Treat "we have no native surface to
do X" as a claim to verify against `ReactFabric-dev.js`, never as a property of the design.
