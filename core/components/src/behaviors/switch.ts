// Switch's machine, on the engine node instead of inside a framework component — the second
// STATEFUL primitive after TextInput (`.claude/rules/host-primitive-tier.md`, "cheapest: tag
// exists, no handle. lastNativeReport -> dispatchViewCommand").
//
// WHAT A `Switch` COMPONENT ACTUALLY DOES, and why none of it needs a framework. It mirrors the
// value native LAST REPORTED (not the value the app authors), and when the two disagree — the app
// rejected the toggle, or its handler is a no-op — it commands native back down with the
// platform's snap-back command (Switch.js:221-225: iOS `setValue`, Android `setNativeValue`). The
// TEMPLATE reads none of it.
//
// WHY THE DIVERGENCE CHECK IS DEFERRED A MICROTASK, NOT RUN SYNCHRONOUSLY INSIDE `onChange`. The
// obvious place to compare "what native just reported" against "what the app currently authors" is
// right where the report arrives. It is wrong: an ACCEPTED toggle updates the app's own state, and
// that state reaches the node only once the app's OWN reconciliation runs — which, for
// every adapter here, happens strictly after `onChange` returns, never during it. Checking
// synchronously would read the STALE pre-accept value and send a spurious snap-back on every
// accepted toggle. The wrapper avoids this by running its own check from an effect that fires AFTER
// the app's state update has flowed into a new render (`useLayoutEffect`, `$effect`, a post-flush
// `watch`); Angular's OWN switch component (`adapters/angular/src/components/switch/shared.ts`,
// `snapBackIfNeeded`) already solves the identical problem for a node with no render the same way —
// `queueMicrotask` then a plain read of the current value — and this mirrors it rather than routing
// through `IHostBehavior.afterCommit`.
//
// `afterCommit` was the first design and it does NOT work here: it requires a commit that actually
// changes something to reach `runDeferredAttaches` at all (`commit.ts`'s `!result.changed` early
// return — the same gate `text-input.test.ts` documents), and this check on its own writes no prop.
// Pairing it with `requestCommitFor` — which schedules a commit but writes nothing either — hits
// exactly that early return and never fires; proven wrong by this file's own test before it shipped.
// `queueMicrotask` sidesteps the whole question: it needs no commit, only a later turn of the
// microtask queue, and `dispatchViewCommand` is an imperative call to native independent of Fabric's
// prop-commit pipeline anyway.
//
// The residual gap this leaves, and it is why `afterCommit` is STILL registered below: a check
// scheduled only from `onChange` never re-runs for a prop change with no preceding native event —
// e.g. the app moves `value` on its own initiative while a PAST toggle's disagreement is still
// unresolved. `afterCommit` costs nothing extra (it fires only on a commit that already changed
// something) and closes that one case; the microtask path is what the no-op-handler case actually
// needs.
import {
  appListenerFor,
  dispatchViewCommand,
  dlog,
  Platform,
  propOf,
  registerHostBehavior,
  setBehaviorListener,
  type ISymbioteEvent,
  type ISymbioteNode,
} from '@symbiote-native/engine';

import {
  createInitialSwitchState,
  shouldSnapBack,
  switchReducer,
  valueFromChange,
  type ISwitchState,
} from '../state/switch';
import type { ISwitchChangeEvent } from '../view/render-switch';

export const SWITCH_TAG = 'switch';

const states = new WeakMap<ISymbioteNode, ISwitchState>();

function stateOf(node: ISymbioteNode): ISwitchState | undefined {
  return states.get(node);
}

// The three narrowing helpers that stood here — `stringOf`, `booleanOf` and `trackColorOf` — went
// with the fold. They existed to read an untyped bag safely, and the bag is read on the other side
// of the wire now, where a `folly::dynamic` is checked the same way and with no allocation.

// THE PROP FOLD MOVED TO THE ENGINE — `foldSwitchProps` in `SymbioteFabricProps.cpp`, with
// `core/engine/cpp/tests/js/switch-payload.itest.ts` as its contract.
//
// It is the clearest case of the three ports so far: `trackColor` / `thumbColor` /
// `ios_backgroundColor` are AUTHORED names and none of them is a real Fabric prop. RN's Switch view
// declares `onTintColor`/`tintColor` (iOS) or `trackColorFor*`/`trackTintColor` (Android), plus
// `thumbTintColor`, and `ios_backgroundColor` is a STYLE rather than a prop. The wrappers took those
// per-platform NAMES from an adapter-supplied table; a tag has no adapter to ask, so the branch
// belongs beside the tree — once, instead of the five copies it had.
//
// What is still here is the MACHINE: the snap-back handshake below, which reads app state a
// microtask after native reports a toggle and corrects a disagreement with an imperative command.

// The platform-specific imperative command RN's own Switch sends to correct a rejected toggle
// (Switch.js:221-225). It reads `Platform.OS` because it is an IMPERATIVE call decided at gesture
// time, not a prop — the payload half of the same platform split went to the engine with the fold.
function snapBackCommand(): string {
  return Platform.OS === 'android' ? 'setNativeValue' : 'setValue';
}

// Shared by both triggers — see the module header for why there are two.
function evaluateSnapBack(node: ISymbioteNode): void {
  const state = stateOf(node);
  if (state === undefined) return; // detached before this ran

  const fabricValue = propOf(node, 'value') === true;
  if (!shouldSnapBack(state, fabricValue)) {
    dlog(
      `Switch behavior snap-back no-op reported=${String(state.lastNativeReport)} value=${fabricValue}`,
    );
    return;
  }

  dlog(
    `Switch behavior ${snapBackCommand()} snap-back reported=${String(state.lastNativeReport)} value=${fabricValue}`,
  );
  dispatchViewCommand(node, snapBackCommand(), [fabricValue]);
}

function onChange(node: ISymbioteNode, event: ISymbioteEvent): void {
  const state = stateOf(node);
  if (state === undefined) return;

  const value = valueFromChange(event);
  if (value === undefined) return;

  dlog(
    `Switch behavior onChange value=${String(value)} eventCount=${String(event.nativeEvent.eventCount)}`,
  );
  states.set(node, switchReducer(state, { type: 'native-reported', value }));

  // Switch.js:201-207's `handleChange` — `onChange` first, THEN `onValueChange`, always. An app
  // with side effects observable across both (a shared counter, a log) sees that exact order on a
  // real device.
  //
  // `onChange` is a raw `change` listener authored directly on the bare tag — not part of any
  // adapter's public surface today, but `change` is the name this behavior's own dispatcher owns
  // (`ownedListeners` below), so one is stashed rather than silently evicting the machine.
  const rawListener = appListenerFor(node, 'change');
  if (typeof rawListener === 'function') rawListener(event);

  // `onValueChange` is not a Fabric event — it is a fold the component wrapper does over the raw
  // `change` payload (same class as TextInput's `onValueChange`, `text-input.ts`'s
  // `callValueChange`), so it lands on the node as a plain prop key rather than through
  // `ownedListeners`. ONE argument, `value` carried on the event (`ISwitchChangeEvent`) — same
  // reason as TextInput: Svelte's compiler forces an individual `on*` attribute through a native
  // listener wrapper that calls with exactly one argument, always a real object.
  const listener = propOf(node, 'onValueChange');
  if (typeof listener === 'function') {
    const changeEvent: ISwitchChangeEvent = Object.assign(event, { value });
    listener(changeEvent);
  }

  // See the module header: deferred so an ACCEPTING app's own state update has a turn of the
  // microtask queue to write the node first.
  queueMicrotask(() => evaluateSnapBack(node));
}

// Switch.js:238-239,288-289 — unconditional on both platforms, never a function of any prop: a
// switch always claims the responder and never yields it, so its own native drag-to-toggle cannot
// be stolen mid-gesture by a parent ScrollView's own responder negotiation.
function alwaysClaimsResponder(): boolean {
  return true;
}

function neverYieldsResponder(): boolean {
  return false;
}

function attach(node: ISymbioteNode): void {
  states.set(node, createInitialSwitchState());
  setBehaviorListener(node, 'change', event => onChange(node, event));
  setBehaviorListener(node, 'startShouldSetResponder', alwaysClaimsResponder);
  setBehaviorListener(
    node,
    'responderTerminationRequest',
    neverYieldsResponder,
  );
}

function detach(node: ISymbioteNode): void {
  states.delete(node);
}

// Idempotent: an adapter entry may be imported more than once in a bundle, and re-registering the
// same tag with an equivalent behavior must not double-install anything.
export function registerSwitchBehavior(): void {
  registerHostBehavior(SWITCH_TAG, {
    attach,
    // See the module header: closes the residual case a microtask scheduled only from `onChange`
    // cannot — a prop change with no preceding native event.
    afterCommit: evaluateSnapBack,
    detach,
    ownedListeners: ['change'],
  });
}
