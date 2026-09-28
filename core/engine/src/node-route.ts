// Where every adapter's prop write lands, whatever shape it started in: the slot redirect, the
// `id` alias, the class/style slots, the event split, and `setProp` for everything else

import { isEventFor } from './view-config';
import {
  canonicalClassName,
  isClassNameValue,
  resolveClassName,
} from './style-registry';
import { dlog } from './debug';
import { slotPropNameFor } from './host-behavior';
import { hasAnimatedNodes } from './animated/graph';
import { bindAnimatedEvent, bindAnimatedValue } from './animated/host-binding';
import { REACT_JSX_DEV_PROPS, setProp } from './node-props';
import {
  isStyleCallback,
  isSameShallowStyle,
  pushClassStyle,
  setNodePressed,
  stylePartsOf,
} from './node-style';
import {
  RESPONDER_EVENTS,
  isOnEventName,
  listenerName,
  setEventListener,
} from './node-events';
import type { ISymbioteNode } from './node-types';

const CLASS_PROP_KEYS: ReadonlySet<string> = new Set(['class', 'className']);

// `id` is RN's alias for `nativeID` and wins when both are set (`View.js`: `nativeID = id`). No
// ViewConfig declares raw `id`, so Fabric drops it and a half-working rename loses `nativeID`
const ID_ALIAS_FROM = 'id';
const ID_ALIAS_TO = 'nativeID';

// Precedence needs state т.к. upstream decides `id ?? nativeID` in one expression while a per-key
// writer never sees both. The authored `nativeID` is remembered, so clearing `id` hands the slot
// back rather than latching
const idAliased = new WeakMap<
  ISymbioteNode,
  { idValue: unknown; nativeIdValue: unknown }
>();

function routeIdAlias(node: ISymbioteNode, key: string, value: unknown): void {
  const state = idAliased.get(node) ?? {
    idValue: undefined,
    nativeIdValue: undefined,
  };
  if (key === ID_ALIAS_FROM) state.idValue = value;
  else state.nativeIdValue = value;
  idAliased.set(node, state);

  const published = node.nativeIdWinsOverId
    ? (state.nativeIdValue ?? state.idValue)
    : (state.idValue ?? state.nativeIdValue);
  setProp(node, ID_ALIAS_TO, published);
}

// A composed primitive's owner receives props that belong to its internal slot
// (`contentContainerStyle` on ScrollView styles the content view), the same reason the owner is
// named for a child. Returns whether the write was taken
function routeToSlot(
  node: ISymbioteNode,
  key: string,
  value: unknown,
): boolean {
  const slotKey = slotPropNameFor(node, key);
  if (slotKey === undefined) return false;
  // A class name is a legal spelling of `contentContainerStyle`, so a string lands on the slot as
  // `class`: renamed verbatim it would publish a style holding a string, dropped with nothing red
  const slotValueFor = node.hostBehavior?.slotValueFor;
  routeProp(
    node.childHost ?? node,
    slotKey === 'style' && typeof value === 'string' ? 'class' : slotKey,
    slotValueFor === undefined ? value : slotValueFor(slotKey, value),
  );
  return true;
}

// A function `style` arrives intact and is resolved at BOTH states, written as an explicit
// `style` + `activeStyle` pair. Without this it misses `setEventListener`, lands in `setProp` as a
// function and is dropped from the payload, so the node commits with no style at all
function routeStyleValue(node: ISymbioteNode, resolved: unknown): void {
  const parts = stylePartsOf(node);
  if (isStyleCallback(resolved)) {
    parts.explicitStyle = resolved({ pressed: false });
    parts.activeStyle = resolved({ pressed: true });
    parts.activeStyleFromCallback = true;
    pushClassStyle(node, parts);
    return;
  }
  // Gated on something being published, which keeps the restore path intact, and on the previous
  // write not coming from a callback, т.к. that one owns `parts.activeStyle`
  if (
    parts.published !== undefined &&
    !parts.activeStyleFromCallback &&
    isSameShallowStyle(resolved, parts.explicitStyle)
  ) {
    return;
  }
  parts.explicitStyle = resolved;
  // Only a variant WE derived is stale now: an AUTHORED `activeStyle` must survive a `style` write,
  // т.к. the two arrive as independent props in an unspecified order
  if (parts.activeStyleFromCallback) {
    parts.activeStyle = undefined;
    parts.activeStyleFromCallback = false;
  }
  pushClassStyle(node, parts);
}

// The three keys that reach the style slots rather than the payload. Returns whether one did
function routeStyleSlot(
  node: ISymbioteNode,
  key: string,
  resolved: unknown,
): boolean {
  if (CLASS_PROP_KEYS.has(key)) {
    const parts = stylePartsOf(node);
    // Canonicalised HERE so the stored value is what everything downstream keys on: an all-string
    // array becomes one string, and the pressed variant then works on it as on an authored string
    parts.className = canonicalClassName(
      isClassNameValue(resolved) ? resolved : undefined,
    );
    parts.classStyle = resolveClassName(parts.className);
    pushClassStyle(node, parts);
    return true;
  }
  if (key === 'style') {
    routeStyleValue(node, resolved);
    return true;
  }
  // Ours, never Fabric's: it is consumed here and must not reach the payload
  if (key === 'activeStyle') {
    const parts = stylePartsOf(node);
    parts.activeStyle = resolved;
    // Slot 1 is no longer ours, т.к. whatever a callback derived has just been replaced. Without
    // this the flag outlives its value and a later plain `style` clears a variant we never derived
    parts.activeStyleFromCallback = false;
    pushClassStyle(node, parts);
    return true;
  }
  return false;
}

// An `on*` name becomes a listener only when the component's ViewConfig declares the event,
// so `onTintColor` on a Switch routes to `setProp` and reaches Fabric untouched
function routeEvent(
  node: ISymbioteNode,
  key: string,
  resolved: unknown,
): boolean {
  // A native-driven `Animated.event` needs the native module as well as the listener map and
  // registers under the PROP name, see `bindAnimatedEvent`
  if (hasAnimatedNodes()) bindAnimatedEvent(node, key, resolved);
  const name = listenerName(key);
  const isRegisteredEvent =
    RESPONDER_EVENTS.has(name) || isEventFor(node.component, name);
  // RNS* views derive events from react-native-screens' own codegen ViewConfig, so an unregistered
  // event falls through to `setProp` as a dead prop and looks like "the button did nothing"
  if (node.component.startsWith('RNS')) {
    dlog(
      `routeProp: ${node.component} "${key}" -> listener "${name}" ` +
        `registered=${isRegisteredEvent} at t=${Date.now()}`,
    );
  }
  if (!isRegisteredEvent) return false;
  setEventListener(node, name, resolved);
  return true;
}

export function routeProp(
  node: ISymbioteNode,
  key: string,
  value: unknown,
): void {
  if (REACT_JSX_DEV_PROPS.has(key)) return;
  // Gated on the field, so a node with no slot pays one load and a branch. Single-hop by
  // construction, т.к. a slot has no slot of its own
  if (node.childHost !== undefined && routeToSlot(node, key, value)) return;
  // After the slot redirect on purpose: a composed primitive forwards most of its bag to an
  // internal node, so an `id` on the owner belongs there
  if (key === ID_ALIAS_FROM || key === ID_ALIAS_TO) {
    routeIdAlias(node, key, value);
    return;
  }
  // An AnimatedNode in a prop resolves here to the value to publish, the engine holding the
  // subscription. Returns its input by identity when nothing is animated
  const resolved = hasAnimatedNodes()
    ? bindAnimatedValue(node, key, value)
    : value;
  if (routeStyleSlot(node, key, resolved)) return;
  // RN's snapshot affordance: render the control pressed with no gesture. One string compare on the
  // first commit, where a behavior hook reading it would cost a post-commit crossing per node
  if (key === 'testOnly_pressed') setNodePressed(node, resolved === true);
  if (isOnEventName(key) && routeEvent(node, key, resolved)) return;
  setProp(node, key, resolved);
}
