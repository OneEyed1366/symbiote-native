// The listener channel: which `on*` prop becomes a listener, who owns the slot, and the handful of
// events Fabric gates behind a boolean prop

import { recordSetOwnedListener } from './mutation-buffer';
import {
  appListenerFor,
  attachLazyHostBehavior,
  hasHostBehaviors,
  notifyOwnedListenerChange,
  ownsListener,
  stashAppListener,
} from './host-behavior';
import {
  IMAGE_LOAD_EVENT_NAMES,
  anyImageLoadEventListenerWired,
} from './image-source-write';
import { setProp } from './node-props';
import type {
  IEventDispatch,
  IListener,
  ISymbioteEvent,
  ISymbioteNode,
} from './node-types';

// Fabric gates a handful of events behind a BOOLEAN prop: unlike scroll/touch/change these fire
// only when the shadow node carries the flag, and a gated handler would otherwise attach on our
// side while the native event silently never arrives

// `magicTap` maps to `onMagicTap`, not the C++ member name `onAccessibilityMagicTap`: RN's own
// `BaseViewConfig.ios.js` disagrees with its C++ prop name, and matching stock is the only choice
const GATED_EVENT_PROPS: ReadonlyMap<string, string> = new Map([
  ['layout', 'onLayout'],
  ['textLayout', 'onTextLayout'],
  ['accessibilityTap', 'onAccessibilityTap'],
  ['magicTap', 'onMagicTap'],
  ['accessibilityEscape', 'onAccessibilityEscape'],
  ['accessibilityAction', 'onAccessibilityAction'],
  ['click', 'onClick'],
  ['clickCapture', 'onClickCapture'],
]);

// Install a listener the BEHAVIOR owns, bypassing the ownership check, т.к. `setEventListener`
// diverts an owned name into the stash and that would be circular for the behavior's dispatcher

// `undefined` removes it, gate flag included: ScrollView takes the owner's `layout` only while
// something wants it, and a one-way installer would leave `onLayout: true` stuck in the payload
export function setBehaviorListener(
  node: ISymbioteNode,
  name: string,
  listener: IListener | undefined,
): void {
  if (listener === undefined) node.listeners?.delete(name);
  else (node.listeners ??= new Map()).set(name, listener);
  // The flag is written UNCONDITIONALLY. Writing it only on the FLIP was measured and rejected: it
  // saves 1 KB per item on the two anchor-backed touchables and costs 10 ms on their teardown
  // (`gated-listener-writes.test.ts`, symbiote-perf-measurement §24)
  const flagProp = GATED_EVENT_PROPS.get(name);
  if (flagProp !== undefined)
    setProp(node, flagProp, listener === undefined ? undefined : true);
}

// Arm (or release, with `undefined`) the shared handler a behavior dispatches through, instead of
// installing one closure per name. See `IEventDispatch`
export function setNodeDispatch(
  node: ISymbioteNode,
  dispatch: IEventDispatch | undefined,
): void {
  node.dispatch = dispatch;
}

/** Whether anything at all would receive `name` on this node. */
export function hasListenerFor(node: ISymbioteNode, name: string): boolean {
  if (node.listeners?.has(name) === true) return true;
  return node.dispatch?.names.has(name) === true;
}

// The app's own listener first: a behavior owns its names, so the two never collide, and an
// unarmed node stops at one `Map` probe
export function listenerFor(
  node: ISymbioteNode,
  name: string,
): IListener | undefined {
  const own = node.listeners?.get(name);
  if (own !== undefined) return own;
  const dispatch = node.dispatch;
  if (dispatch === undefined || !dispatch.names.has(name)) return undefined;
  // ONE closure per delivered event, where a dispatcher per name built seven per mounted node.
  // `name` is bound here rather than read off `event.type`, so a caller building its own event
  // (every test driving a behavior by hand) reaches the same handler
  return event => dispatch.deliver(node, name, event);
}

// The unowned names whose presence a platform rule reads
const PRESSABILITY_NAMES: ReadonlySet<string> = new Set([
  'press',
  'longPress',
  'startShouldSetResponder',
]);

// A name a host behavior OWNS never reaches `node.listeners`: the behavior's dispatcher holds that
// slot, and the map is single-slot, so the app's callback would evict it with no diagnostic
function stashOwnedListener(
  node: ISymbioteNode,
  name: string,
  value: unknown,
  isHandler: boolean,
): void {
  // The PRESENCE only, never the identity: a fresh closure nearly every render must not notify
  const wasWired = appListenerFor(node, name) !== undefined;
  stashAppListener(node, name, isHandler ? value : undefined);
  if (wasWired !== isHandler) {
    // The BIT, on the flip only, so a platform rule can resolve a key depending on whether the app
    // wired anything without the closure leaving JS
    recordSetOwnedListener(node, name, isHandler);
    notifyOwnedListenerChange(node, name, isHandler);
  }
  const flagged = GATED_EVENT_PROPS.get(name);
  if (flagged !== undefined)
    setProp(node, flagged, isHandler ? true : undefined);
}

// The explicit event channel. Structural adapters (Svelte `addEventListener`, Angular
// `Renderer2.listen`) call this with an already-known event name, flat-bag adapters reach it
// through `routeProp`, and a non-function value clears the listener
export function setEventListener(
  node: ISymbioteNode,
  name: string,
  value: unknown,
): void {
  const isHandler = typeof value === 'function';
  if (isOwnedByBehavior(node, name, isHandler)) {
    stashOwnedListener(node, name, value, isHandler);
    return;
  }
  // A plain `<text>` presses through the engine's own synthesis with no behavior owning the names,
  // yet its payload depends on whether it is pressable. Same bit as the owned path, on the flip
  if (PRESSABILITY_NAMES.has(name)) {
    const wasWired = node.listeners?.has(name) === true;
    if (wasWired !== isHandler) recordSetOwnedListener(node, name, isHandler);
  }
  if (isHandler) {
    const handler = value;
    if (TOUCH_PROP_NAMES.has(name)) touchPropWired = true;
    node.listeners ??= new Map();
    node.listeners.set(name, (event: ISymbioteEvent) => handler(event));
  } else {
    node.listeners?.delete(name);
  }
  syncEventFlags(node, name, isHandler);
}

// The behavior that owns `name`, attaching a lazy one first: its trigger is the very write that
// brings the name, so the check has to come before the owned-or-not decision
function isOwnedByBehavior(
  node: ISymbioteNode,
  name: string,
  isHandler: boolean,
): boolean {
  if (isHandler && attachLazyHostBehavior(node, name)) return true;
  return hasHostBehaviors() && ownsListener(node, name);
}

// Kept apart so `setEventListener` stays readable: the props a listener's presence implies
function syncEventFlags(
  node: ISymbioteNode,
  name: string,
  isHandler: boolean,
): void {
  const flagProp = GATED_EVENT_PROPS.get(name);
  if (flagProp !== undefined)
    setProp(node, flagProp, isHandler ? true : undefined);
  // `onLoad` and friends are real Fabric events on `RCTImageView`, so they land here rather than in
  // `writeProp`. See `image-source-write.ts` for Android's synthesized `shouldNotifyLoadEvents`
  if (node.resolvesImageSources && IMAGE_LOAD_EVENT_NAMES.has(name)) {
    setProp(
      node,
      'shouldNotifyLoadEvents',
      anyImageLoadEventListenerWired(node.listeners) ? true : undefined,
    );
  }
}

// `/^on[A-Z]/` spelled out, т.к. this runs on EVERY prop write and a regex costs measurably more
// than the character reads. 111 is 'o', 110 is 'n', 65-90 is A-Z, and `charCodeAt` past the end
// answers NaN, which fails every comparison
export function isOnEventName(key: string): boolean {
  if (key.charCodeAt(0) !== 111 || key.charCodeAt(1) !== 110) return false;
  const third = key.charCodeAt(2);
  return third >= 65 && third <= 90;
}

/** `onChange` to `change`. */
export function listenerName(propName: string): string {
  return propName.charAt(2).toLowerCase() + propName.slice(3);
}

// `onTouchStart` and its siblings, `Capture` twins included: RN's base ViewConfig bubbles the raw
// touch events to any view, so they are listeners on every node whatever its component
const TOUCH_PROP_EVENTS = [
  'touchStart',
  'touchStartCapture',
  'touchMove',
  'touchMoveCapture',
  'touchEnd',
  'touchEndCapture',
  'touchCancel',
  'touchCancelCapture',
] as const;
type ITouchPropEvent = (typeof TOUCH_PROP_EVENTS)[number];
const TOUCH_PROP_NAMES: ReadonlySet<string> = new Set<ITouchPropEvent>(
  TOUCH_PROP_EVENTS,
);

// Monotone, like `hasAttached`: once an app wires one, every touch frame asks the tree for the
// path, and an app that never does pays one boolean read per frame
let touchPropWired = false;

export function hasTouchPropListeners(): boolean {
  return touchPropWired;
}

// PanResponder's `panHandlers`: a JS-side protocol synthesized from raw touches, not Fabric
// ViewConfig events, so `isEventFor` never reports them. Treated as listeners on any node so the
// handlers attach instead of reaching Fabric as dead props
export const RESPONDER_EVENTS: ReadonlySet<string> = new Set([
  'startShouldSetResponder',
  'startShouldSetResponderCapture',
  'moveShouldSetResponder',
  'moveShouldSetResponderCapture',
  'responderGrant',
  'responderReject',
  'responderStart',
  'responderMove',
  'responderEnd',
  'responderRelease',
  'responderTerminate',
  'responderTerminationRequest',
  ...TOUCH_PROP_EVENTS,
]);
