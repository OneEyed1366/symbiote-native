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
// that state reaches `node.props.value` only once the app's OWN reconciliation runs — which, for
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

// The LOWERED tag — NOT the wrapper's `symbiote-switch-managed` (`render-switch.ts`). One owner
// per node: the wrapper already runs this same machine in its own lifecycle, so registering here
// under the tag it emits would attach a second, redundant copy.
export const SWITCH_TAG = 'symbiote-switch';

const states = new WeakMap<ISymbioteNode, ISwitchState>();

function stateOf(node: ISymbioteNode): ISwitchState | undefined {
  return states.get(node);
}

function stringOf(value: unknown): string | undefined {
  return typeof value === 'string' ? value : undefined;
}

function booleanOf(value: unknown): boolean | undefined {
  return typeof value === 'boolean' ? value : undefined;
}

// `{ false?, true? }` narrowed at runtime — an authored object arriving through an untyped bag
// cannot be trusted to the type system without reading it field by field, the same idiom
// `text-input.ts`'s `selectionOf` uses for `{ start, end? }`.
function trackColorOf(
  value: unknown,
): { false?: string; true?: string } | undefined {
  if (typeof value !== 'object' || value === null) return undefined;
  const bag: Record<string, unknown> = { ...value };
  const falseColor = stringOf(bag.false);
  const trueColor = stringOf(bag.true);
  if (falseColor === undefined && trueColor === undefined) return undefined;
  return { false: falseColor, true: trueColor };
}

// The wrapper-body prop fold this primitive owes its lowered form: `trackColor` / `thumbColor` /
// `ios_backgroundColor` are AUTHORED names, none of them a real Fabric prop — RN's Switch view
// declares `onTintColor`/`tintColor` (iOS) or `trackColorFor*`/`trackTintColor` (Android), plus
// `thumbTintColor`. `render-switch.ts` folds them for the wrapper path via an adapter-supplied
// `ISwitchPlatform`; a lowered node has no adapter to supply one, so this reads `Platform.OS`
// directly — the same fact every adapter's own index.ios.ts/index.android.ts already encodes as a
// literal, just read once here instead of five times.
function trackColorPropsFor(
  value: boolean,
  trackColor: { false?: string; true?: string } | undefined,
): Record<string, unknown> {
  if (Platform.OS === 'android') {
    return {
      trackColorForFalse: trackColor?.false,
      trackColorForTrue: trackColor?.true,
      trackTintColor: value ? trackColor?.true : trackColor?.false,
    };
  }
  return {
    onTintColor: trackColor?.true,
    tintColor: trackColor?.false,
  };
}

// RN rounds the iOS background pill to this radius when `ios_backgroundColor` is set — the same
// constant `render-switch.ts` uses, kept independent rather than exported+imported for one
// primitive-local literal (see that file for the upstream fact it encodes).
const IOS_BACKGROUND_BORDER_RADIUS = 16;

// The platform-specific imperative command RN's own Switch sends to correct a rejected toggle
// (Switch.js:221-225) — read off Platform.OS for the same reason `trackColorPropsFor` is.
function snapBackCommand(): string {
  return Platform.OS === 'android' ? 'setNativeValue' : 'setValue';
}

function foldPayload(
  props: Readonly<Record<string, unknown>>,
): Record<string, unknown> {
  const value = props.value === true;
  const trackColor = trackColorOf(props.trackColor);
  const iosBackground = stringOf(props.ios_backgroundColor);

  const out: Record<string, unknown> = {
    ...props,
    value,
    disabled: booleanOf(props.disabled),
    ...trackColorPropsFor(value, trackColor),
    thumbTintColor: stringOf(props.thumbColor),
    style:
      iosBackground === undefined
        ? props.style
        : [
            props.style,
            {
              backgroundColor: iosBackground,
              borderRadius: IOS_BACKGROUND_BORDER_RADIUS,
            },
          ],
  };
  // The authored names themselves must NOT ride along: none is a Fabric prop, and leaving them in
  // the payload is how a reader concludes the fold ran when it did not.
  delete out.trackColor;
  delete out.thumbColor;
  delete out.ios_backgroundColor;
  return out;
}

// Shared by both triggers — see the module header for why there are two.
function evaluateSnapBack(node: ISymbioteNode): void {
  const state = stateOf(node);
  if (state === undefined) return; // detached before this ran

  const fabricValue = node.props.value === true;
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

  // `onValueChange` is not a Fabric event — it is a fold the component wrapper does over the raw
  // `change` payload (same class as TextInput's `onValueChange`, `text-input.ts`'s
  // `callValueChange`), so it lands in `node.props` as a plain function key rather than through
  // `ownedListeners`.
  const listener = node.props.onValueChange;
  if (typeof listener === 'function') listener(value, event);

  // A raw `change` listener authored directly on the bare tag — not part of any adapter's public
  // surface today, but `change` is the name this behavior's own dispatcher owns
  // (`ownedListeners` below), so one is stashed rather than silently evicting the machine.
  const rawListener = appListenerFor(node, 'change');
  if (typeof rawListener === 'function') rawListener(event);

  // See the module header: deferred so an ACCEPTING app's own state update has a turn of the
  // microtask queue to reach `node.props.value` first.
  queueMicrotask(() => evaluateSnapBack(node));
}

function attach(node: ISymbioteNode): void {
  states.set(node, createInitialSwitchState());
  setBehaviorListener(node, 'change', event => onChange(node, event));
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
    foldPayload,
    ownedListeners: ['change'],
  });
}
