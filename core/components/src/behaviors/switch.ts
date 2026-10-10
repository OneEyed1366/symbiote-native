// TODO(rn-port): RN's `Switch.js` is a React component, its snap-back is re-expressed here

// Switch's machine on the engine node, it mirrors what native LAST reported and snaps it back.
// The check runs a microtask after `onChange`, so an ACCEPTING app's state reaches the node first,
// `afterCommit` stays for a `value` change with no native event (see Angular's `snapBackIfNeeded`)
import {
  appListenerFor,
  dispatchViewCommand,
  dlog,
  Platform,
  propOf,
  registerHostBehavior,
  setNodeDispatch,
  type IEventDispatch,
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

  const isValueOn = propOf(node, 'value') === true;
  if (!shouldSnapBack(state, isValueOn)) {
    dlog(
      `Switch behavior snap-back no-op reported=${String(state.lastNativeReport)} value=${isValueOn}`,
    );
    return;
  }

  dlog(
    `Switch behavior ${snapBackCommand()} snap-back reported=${String(state.lastNativeReport)} value=${isValueOn}`,
  );
  dispatchViewCommand(node, snapBackCommand(), [isValueOn]);
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

  // Switch.js:201-207's `handleChange`: `onChange` first, THEN `onValueChange`, always
  // `onChange` is a raw `change` listener on the bare tag, kept so it cannot evict the machine
  const rawListener = appListenerFor(node, 'change');
  if (typeof rawListener === 'function') rawListener(event);

  // `onValueChange` is a plain prop key, not a Fabric event, the wrapper folds it over `change`
  // ONE argument with `value` on the event (`ISwitchChangeEvent`), Svelte passes `on*` one object
  const listener = propOf(node, 'onValueChange');
  if (typeof listener === 'function') {
    const changeEvent: ISwitchChangeEvent = Object.assign(event, { value });
    listener(changeEvent);
  }

  // See the module header: deferred so an ACCEPTING app's own state update has a turn of the
  // microtask queue to write the node first.
  queueMicrotask(() => evaluateSnapBack(node));
}

// Switch.js:238-239,288-289: unconditional on both platforms, never a function of any prop
// A switch always claims the responder, so a parent ScrollView cannot steal its drag-to-toggle
function alwaysClaimsResponder(): boolean {
  return true;
}

function neverYieldsResponder(): boolean {
  return false;
}

// ONE object for every Switch in the app, where three closures per node used to be
const SWITCH_DISPATCH: IEventDispatch = {
  names: new Set([
    'change',
    'startShouldSetResponder',
    'responderTerminationRequest',
  ]),
  deliver(node, name, event) {
    if (name === 'change') return onChange(node, event);
    return name === 'startShouldSetResponder'
      ? alwaysClaimsResponder()
      : neverYieldsResponder();
  },
};

function attach(node: ISymbioteNode): void {
  states.set(node, createInitialSwitchState());
  setNodeDispatch(node, SWITCH_DISPATCH);
}

function detach(node: ISymbioteNode): void {
  setNodeDispatch(node, undefined);
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
