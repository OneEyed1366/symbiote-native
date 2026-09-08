// An AnimatedNode written straight into a prop of a HOST NODE — the engine half of what
// `createAnimatedComponent` used to broker.
//
// WHY IT EXISTS. `Animated.View` is `createAnimatedComponent(View)`: a wrapper whose whole job is
// to keep an `AnimatedProps` leaf alive beside a base COMPONENT. Once a primitive is a bare
// intrinsic tag there is no component to wrap, so every `Animated.*` built that way loses its
// base. The two halves the wrapper actually brokered — the value graph and the node's Fabric view
// tag — are both already engine-side (`animated/props.ts`, `commit.ts`'s `getNativeTag`), so the
// wrapper was standing between two things that live in the same room. An app writes
//
//     <view style={{ opacity: someAnimatedValue }} />
//
// and `routeProp` resolves it here: publish the current value so the first paint is concrete,
// subscribe the leaf so every frame lands as one targeted `setNativeProps` commit, and tear the
// subscription down when the node leaves the tree for good.
//
// THE PRECEDENT IT FOLLOWS is `routeProp`'s own `isStyleCallback` branch: a `style` function is
// already a value the engine INTERPRETS rather than forwards, resolved at both values of
// `pressed`. An AnimatedNode is the same shape of problem one step further — the resolution is
// continuous rather than two-valued, so it needs a subscription instead of a second call.
//
// THE CYCLE IS DELIBERATE, and it is the one `node.ts` already carries with `commit.ts`: node.ts
// imports this module for `routeProp`, and this module reaches back into node.ts for `setProp`.
// Neither side touches the other at module-evaluation time — only inside a function body — so
// every loader resolves it. The alternative, a
// `registerAnimatedResolver` installed from elsewhere, is exactly the load-time-side-effect shape
// Metro's `inlineRequires` drops in release builds (CLAUDE.md; and see `graph.ts`'s note on why
// `AnimatedInterpolation` lives next to its base class).

import { AnimatedNode } from './graph';
import { AnimatedStyle } from './style';
import { attachNativeEventHandler, type INativeEventAttachment } from './event';
import {
  createAnimatedLeafLifecycle,
  type IAnimatedLeafLifecycle,
} from './leaf-lifecycle';
import { setProp, type ISymbioteNode } from '../node';

type IBinding = {
  // The animated props by name, RAW — each value still holds its AnimatedNode, because that is
  // what `AnimatedProps` binds. Mutated IN PLACE across writes: the lifecycle keeps its own
  // snapshot, so a stable object here is what lets its no-op guard mean anything.
  raw: Record<string, unknown>;
  lifecycle: IAnimatedLeafLifecycle;
};

const bindings = new WeakMap<ISymbioteNode, IBinding>();

// Nodes the commit sweep tore down, whether or not they carried a binding — the twin of
// host-behavior.ts's `tornDown`, and marked for every node for the same reason: the node a
// framework re-inserts is usually a plain container whose DESCENDANT holds the subscription.
const parked = new WeakSet<ISymbioteNode>();

// The gate, matching `hasHostBehaviors`. `removeChild` and the two inserts read it on every call,
// so an app that animates nothing must pay one boolean read rather than a WeakMap probe.
let anyBinding = false;

export function hasAnimatedBindings(): boolean {
  return anyBinding;
}

// Only what `AnimatedProps` can actually bind: a prop that IS a node, or a `style` holding one.
// Deliberately NOT a general deep walk — an arbitrary prop bag can hold an app object with a
// cycle in it, and a walk that never terminates would be a hang on the engine's hottest path.
function styleHoldsAnimated(style: unknown): boolean {
  if (Array.isArray(style)) return style.some(styleHoldsAnimated);
  if (typeof style !== 'object' || style === null) return false;
  for (const key of Object.keys(style)) {
    const entry = Reflect.get(style, key);
    if (entry instanceof AnimatedNode) return true;
    // `transform: [{ translateX: node }]` — the one nesting `AnimatedTransform` reads.
    if (key !== 'transform' || !Array.isArray(entry)) continue;
    for (const item of entry) {
      if (typeof item !== 'object' || item === null) continue;
      for (const inner of Object.keys(item)) {
        if (Reflect.get(item, inner) instanceof AnimatedNode) return true;
      }
    }
  }
  return false;
}

// The value to PUBLISH now, or undefined when there is nothing animated after all. A false
// positive from the scan above lands here and is turned away, so the raw value still reaches
// `setProp` unchanged and nothing new can break.
function rasterize(key: string, value: unknown): unknown {
  if (value instanceof AnimatedNode) return value.__getValue();
  if (key !== 'style') return undefined;
  return AnimatedStyle.from(value)?.__getValue();
}

function reconcile(node: ISymbioteNode, binding: IBinding): void {
  parked.delete(node);
  if (Object.keys(binding.raw).length > 0) {
    // `wantsNative: false` — nothing here forces the native driver. A leaf becomes native by
    // CASCADE, from the value it is a child of (`AnimatedWithChildren.__addChild` /
    // `__connectNativeChildren`), which is what makes `useNativeDriver` on the animation the only
    // thing that decides. The wrapper's own `wantsNative` was keyed on
    // `passthroughAnimatedPropExplicitValues`, a wrapper-ism with no meaning on a bare tag.
    //
    // And NO `scheduleNativeBind`, though a prop write always precedes the node's first commit:
    // nothing the bind does needs a Fabric tag on the spot. `setNativeView` only stores the
    // target, `connectToView` defers itself through `pendingViewConnects` + the post-commit hook
    // (`props.ts`), and `attachNativeEventHandler` wraps its own `whenCommitted`. A deferral here
    // would be unfalsifiable code, so it is not here.
    binding.lifecycle.reconcile(binding.raw, node, false);
    return;
  }
  binding.lifecycle.teardown();
  bindings.delete(node);
  // Fabric may flatten a view again once nothing animates it.
  setProp(node, 'collapsable', undefined);
}

/**
 * Resolve an animated value in a prop, returning what should be published for it.
 *
 * Returns its input by IDENTITY when the value holds nothing animated, so `routeProp` can call it
 * unconditionally and every downstream branch — class, style, activeStyle, `on*`, `setProp` —
 * keeps seeing a plain value and needs no change.
 */
export function bindAnimatedValue(
  node: ISymbioteNode,
  key: string,
  value: unknown,
): unknown {
  const existing = bindings.get(node);
  const resolved =
    value instanceof AnimatedNode ||
    (key === 'style' && styleHoldsAnimated(value))
      ? rasterize(key, value)
      : undefined;
  if (resolved === undefined) {
    // A prop that USED to be animated and no longer is: drop it, or the leaf keeps writing a
    // stale value over whatever the app just wrote.
    if (existing !== undefined && Object.hasOwn(existing.raw, key)) {
      delete existing.raw[key];
      reconcile(node, existing);
    }
    return value;
  }
  const binding = existing ?? {
    raw: {},
    lifecycle: createAnimatedLeafLifecycle('host'),
  };
  if (existing === undefined) {
    bindings.set(node, binding);
    anyBinding = true;
  }
  binding.raw[key] = value;
  // Fabric flattens a view whose props do not require one, and a flattened view has no tag for
  // the native driver to bind to. RN forces the same flag from `reduceAnimatedProps`.
  setProp(node, 'collapsable', false);
  reconcile(node, binding);
  return resolved;
}

// A handler from `Animated.event(…, { useNativeDriver: true })` written straight onto a tag —
// `<scroll-view onScroll={…} />`. Its JS half already works (`routeProp` -> `setEventListener`);
// this is the half that hands the mapping to the native module, so the event drives its values on
// the UI thread with no JS per frame. `createAnimatedComponent` did it from `AnimatedProps`'s own
// prop bag, which a bare tag does not have.
//
// ITS OWN REGISTRY, not the leaf's `raw` map above: `AnimatedProps.update()` writes every key it
// holds into the payload, so a handler parked there would be a function prop rebuilt every frame.
//
// KEYED ON THE PROP NAME — `onScroll`, never the listener name `scroll`. RN registers under the
// prop name (`createAnimatedPropsHook.js` hands `propName` to `AnimatedEvent.__attach`) and the
// native side keys its drivers on that name with `on` stripped
// (`RCTNormalizeAnimatedEventName`, RCTNativeAnimatedNodesManager.mm:37). `scroll` would register
// under `scroll` while every dispatched event looks up `Scroll`: attached, and never fired.
interface IEventBinding {
  readonly handler: unknown;
  readonly attachment: INativeEventAttachment;
}

const eventBindings = new WeakMap<ISymbioteNode, Map<string, IEventBinding>>();

/**
 * Bind a native-driven `Animated.event` handler written as an `on*` prop. A no-op for every other
 * handler, so `routeProp` calls it for any `on*` name behind the same one-boolean gate.
 */
export function bindAnimatedEvent(
  node: ISymbioteNode,
  propName: string,
  handler: unknown,
): void {
  const bound = eventBindings.get(node);
  if (bound !== undefined) {
    const current = bound.get(propName);
    if (current !== undefined) {
      // A framework hands a fresh closure most renders; only a different handler is worth a
      // detach/attach round trip through the native module.
      if (current.handler === handler) return;
      current.attachment.detach();
      bound.delete(propName);
    }
  }
  // Returns undefined unless this really is a native-driven AnimatedEvent, and defers itself
  // through `whenCommitted` until the node has a Fabric tag — no second deferral invented here.
  const attachment = attachNativeEventHandler(node, propName, handler);
  if (attachment === undefined) return;
  const map = bound ?? new Map<string, IEventBinding>();
  if (bound === undefined) eventBindings.set(node, map);
  map.set(propName, { handler, attachment });
  // The same gate the props half raises: teardown and re-arm are both behind it.
  anyBinding = true;
}

// Re-attach against the tag the node has NOW. The old handles are spent — each detached against
// the tag it attached with, which is the point — so re-arming is a fresh attach, not a resume, and
// it goes back through `bindAnimatedEvent` rather than growing a second attach path. Only a node
// the sweep parked reaches here, and parking always detaches, so clearing without detaching first
// drops nothing live.
function reattachAnimatedEvents(node: ISymbioteNode): void {
  const bound = eventBindings.get(node);
  if (bound === undefined) return;
  const spent = [...bound];
  bound.clear();
  for (const [propName, binding] of spent)
    bindAnimatedEvent(node, propName, binding.handler);
}

/**
 * Release a node's animated subscription. Called per node from the commit sweep, which is where a
 * genuine removal is first distinguishable from a framework spelling a move as remove-then-insert
 * (host-behavior.ts, `markDetachCandidate`).
 */
export function detachAnimatedProps(node: ISymbioteNode): void {
  // The sweep runs for host behaviors too, so an app that animates nothing must not pay a WeakSet
  // insert per removed node to learn it has nothing to release.
  if (!anyBinding) return;
  parked.add(node);
  bindings.get(node)?.lifecycle.teardown();
  const bound = eventBindings.get(node);
  if (bound === undefined) return;
  for (const binding of bound.values()) binding.attachment.detach();
}

/**
 * Re-arm a subtree the sweep tore down and the framework put back — Svelte parks LIVE nodes
 * offscreen across commits and returns them with their props unwritten, so without this the
 * animation stops with nothing red anywhere.
 *
 * A WeakSet miss and no walk at all for every node in a freshly built tree, which is the path that
 * runs ~9 000 times per benchmark create.
 */
export function reattachAnimatedProps(node: ISymbioteNode): void {
  if (!parked.has(node)) return;
  parked.delete(node);
  const binding = bindings.get(node);
  if (binding !== undefined) reconcile(node, binding);
  reattachAnimatedEvents(node);
  for (const child of node.children) reattachAnimatedProps(child);
}
