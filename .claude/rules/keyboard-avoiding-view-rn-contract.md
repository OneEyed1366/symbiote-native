---
paths:
  - 'core/components/src/view/render-keyboard-avoiding-view.ts'
  - 'adapters/react/src/components/keyboard-avoiding-view/**'
  - 'adapters/vue/src/components/keyboard-avoiding-view*'
  - 'adapters/svelte/src/components/keyboard-avoiding-view/**'
  - 'adapters/angular/src/components/keyboard-avoiding-view/**'
  - 'adapters/solid/src/components/keyboard-avoiding-view*'
---

# KeyboardAvoidingView: the RN-aligned contract, and the two traps in wiring it

Three divergences from RN's `KeyboardAvoidingView.js` were closed 2026-08-18. All five adapters had
carried them identically since the component landed, which is exactly why no adapter test caught
them: they agreed with each other and with the shared half they all call. **A fold can only be
checked against the thing it folds toward** — that check now lives in
`core/components/src/view/render-keyboard-avoiding-view.test.ts`, written against RN's source.

## The contract an adapter must consume

```ts
// 1. TWO listeners, chosen by host — never three.
const events = keyboardAvoidingEventNamesFor(Platform.OS);
Keyboard.addListener(events.show, onShow); // ios: keyboardWillShow  | android: keyboardDidShow
Keyboard.addListener(events.hide, onHide); // ios: keyboardWillHide  | android: keyboardDidHide

// 2. computeInset takes an options object.
computeInset(frame, keyboard, verticalOffset, {
  behavior, // live, read at event time
  previousInset, // live, the inset CURRENTLY applied
  prefersCrossFadeTransitions, // read once at mount
});

// 3. The cross-fade setting goes through the core wrapper, never AccessibilityInfo directly.
readPrefersCrossFadeTransitions().then(value => {
  /* store in a plain, non-reactive slot */
});
```

Why each:

- **`keyboardWillShow` on iOS** makes the view ride up WITH the keyboard animation instead of
  snapping into place after it. And `keyboardDidChangeFrame`, which every adapter used to subscribe
  to, is the listener RN's own comment warns against: with an undocked, split or floating iOS
  keyboard it fires BEFORE the hide notification, so it applies a frame captured mid-dismissal.
- **`previousInset`** is RN's `this.state.bottom`, and it is a **fixpoint correction, not an
  accumulation**. In `behavior="height"` the wrapper is shrunk BY the inset, so its next `onLayout`
  reports a frame shorter by exactly that much. Without adding it back, each subsequent keyboard
  event computes a smaller overlap and the view walks back down under the keyboard. Core gates the
  term to `'height'`; the adapter only passes the values through.
- **`readPrefersCrossFadeTransitions`** exists because the engine's iOS accessibility getters
  REJECT when the native error callback fires — deliberate RN parity the engine keeps — while this
  read happens at mount with nobody awaiting it. Five adapters writing the same `.catch` is five
  chances to forget one. With the setting on, iOS reports the keyboard `screenY` as 0, which the
  ordinary math turns into "lift the view by its entire height" and pushes content off screen.

## Trap 1 — `behavior` is as stale-prone as `previousInset`, and only one of them looks it

Both are read inside a subscription that outlives many renders. `previousInset` is the obvious one
and gets the care; `behavior` is a prop that quietly comes along for the ride, so a handler that
captures it applies the OLD behavior's math after a `behavior` change. Found in the React adapter
during this alignment, after the brief had warned about `previousInset` only.

**Both must be read live at event time**, and what that costs differs per framework:

| Adapter | What it takes                                                                                                                         |
| ------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| React   | the functional `setInset(previous => …)` form, plus `behavior` in the effect deps (or a latest-ref) — a plain closure read is the bug |
| Vue     | read through the normalized attrs inside the handler, never captured in `setup`                                                       |
| Solid   | read `local.<prop>` inside the handler — props are getters, so that is already live                                                   |
| Svelte  | nothing: a destructured prop compiles to a getter, so a read inside a long-lived handler is already current                           |
| Angular | read the field at event time, don't capture it when the subscription is built                                                         |

Svelte and Solid get it for free, but the freedom is a COMPILER/runtime guarantee, not a source-level
one — both adapters pin it with a test rather than trusting it, and so should any new adapter.

A test firing ONE keyboard event cannot see either bug. The regression test has to fire a second
event after the state changed — and for `behavior`, change the prop after mount.

## Trap 2 — a function that reads a global has an unprovable branch

Two helpers here take as an ARGUMENT something they could have read themselves:

```ts
keyboardAvoidingEventNamesFor(os)              // not Platform.OS read inside
readPrefersCrossFadeTransitions(query?)        // not AccessibilityInfo called inside
```

That is deliberate. The headless `Platform` module always resolves to iOS
(`platform/index.ts` re-exports `index.ios`), so a direct read would leave the Android branch
permanently unprovable — and the reject path of a native getter cannot be reached at all without a
native-module fake. Injecting with a real default costs the callers nothing (adapters pass no
arguments) and makes every branch a plain unit test. The same trick fixed
`keyboardTypeForInputMode` in `state/text-input.ts`; prefer it whenever a pure function in
`core/components` would otherwise reach for host state.

## Still not aligned

Nothing known. RN's `_relativeKeyboardHeight`, its subscription split and its cross-fade early
return are all reproduced. If a fourth divergence turns up, add it to the core test FIRST — that
file is where a divergence becomes visible, because it is the only test that checks our fold against
RN's source rather than against our own output.
