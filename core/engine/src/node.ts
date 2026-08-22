// The retained shadow-tree. Adapters mutate this cheap in-memory tree through a
// tiny API; the commit engine (commit.ts) later walks it and translates the
// whole thing into Fabric's clone-on-write child sets. Keeping the retained
// tree mutable while the Fabric mirror stays persistent lets every adapter mutate
// freely without touching Fabric's clone-on-write protocol directly, and it
// lives here in shared so no adapter re-implements it.

import { isEventFor } from './view-config';
import { isClassNameValue, resolveClassName } from './style-registry';
import { dlog } from './debug';

const BRAND: unique symbol = Symbol('symbiote.node');

// A node carries the Fabric view name directly, so adding a primitive (Image,
// ScrollView, TextInput) is just a new string from the adapter, no core change.
// The only name resolved at commit time is text: a <Text> nested inside another
// <Text> becomes a virtual span. `isText` marks a text container so its
// descendants pick the virtual variant.
export const RAW_TEXT_COMPONENT = 'RCTRawText';
export const TEXT_COMPONENT = 'RCTText';
export const VIRTUAL_TEXT_COMPONENT = 'RCTVirtualText';

export interface ISymbioteEvent {
  type: string;
  // `target` is the node the gesture started on; `currentTarget` is the node
  // whose listener is running right now as the event bubbles toward the root.
  target: ISymbioteNode;
  currentTarget: ISymbioteNode;
  nativeEvent: Record<string, unknown>;
  stopPropagation: () => void;
}
// Returns `unknown`, not `void`: the responder negotiation reads a boolean back
// from onStartShouldSetResponder / onResponderTerminationRequest. Bubbling/direct
// dispatch ignore the return; only the responder path consults it.
export type IListener = (event: ISymbioteEvent) => unknown;

// Runtime guard narrowing `unknown` to ISymbioteEvent (no `as` cast). Lives with the interface
// it tests, so every adapter checking for a Symbiote event shares one guard instead of writing
// its own copy.
export function isSymbioteEvent(value: unknown): value is ISymbioteEvent {
  if (typeof value !== 'object' || value === null) return false;
  const nativeEvent = Reflect.get(value, 'nativeEvent');
  return typeof nativeEvent === 'object' && nativeEvent !== null;
}

export interface ISymbioteNode {
  readonly [BRAND]: true;
  // Fabric view name passed to createNode (RCTView, RCTImageView, RCTText, ...).
  readonly component: string;
  // A text container: its descendants render as virtual text spans.
  readonly isText: boolean;
  props: Record<string, unknown>;
  listeners: Map<string, IListener> | undefined;
  children: ISymbioteNode[];
  parent: ISymbioteNode | undefined;
  // "This node's own props changed, or something below it did." Read by the commit walk
  // (commit.ts) to skip an untouched subtree wholesale. See markDirty.
  dirty: boolean;
  // "THIS node's own props changed since its last commit" - strictly narrower than `dirty`, which
  // is also set by a descendant's change bubbling up. The pair splits a question the walk used to
  // answer by brute force: `dirty` says whether to DESCEND, `propsDirty` says whether this node's
  // own Fabric payload can possibly differ from what the mirror holds.
  //
  // The case it exists for is every node on the clone-bubble path. A changed leaf forces each
  // ancestor up to the root to re-clone (a persistent parent points at specific child handles), so
  // those ancestors are `dirty` and must be visited - but their OWN props did not change, and
  // reconcile used to prove that by rebuilding the whole Fabric payload with fabricProps() and
  // deep-comparing it against the mirror. That is a fresh object plus a recursive walk per
  // ancestor per commit, to rediscover something the mutation API already knew: nobody wrote a
  // prop here. On an ordinary update the bubble path is MOST of the visited nodes.
  //
  // A stale `true` is harmless (one slow path, same output); a wrongly-cleared `false` is the
  // silent-stale-UI failure mode. So every write path errs toward marking - see markPropsDirty -
  // and skipped nodes are deliberately NOT cleared in renderableChildren the way `dirty` is.
  propsDirty: boolean;
}

export function createElement(
  component: string,
  isText = false,
): ISymbioteNode {
  return {
    [BRAND]: true,
    component,
    isText,
    props: {},
    listeners: undefined,
    children: [],
    parent: undefined,
    dirty: true,
    propsDirty: true,
  };
}

export function createRawText(text: string): ISymbioteNode {
  return {
    [BRAND]: true,
    component: RAW_TEXT_COMPONENT,
    isText: false,
    props: { text },
    listeners: undefined,
    children: [],
    parent: undefined,
    dirty: true,
    // Props assigned at construction rather than through setText, so the flag starts raised for
    // the same reason createElement's does: a node that has never committed must never take a
    // fast path built on "the mirror already agrees with me".
    propsDirty: true,
  };
}

// `instanceHandle` round-trips through Fabric unchanged: the object we pass to
// createNode comes back as the event target. We brand our nodes so the event
// handler can confirm a target is one of ours before dispatching.
export function isSymbioteNode(value: unknown): value is ISymbioteNode {
  return typeof value === 'object' && value !== null && BRAND in value;
}

// Investigation instrumentation (HeaderOptionsScreen search-bar-ref "node not committed" bug):
// a WeakMap can't be logged, so this gives every node a small human-readable id, assigned lazily
// on first call — lets a dlog at ref-attach time and a dlog at commit/dispatch time be compared
// directly to prove whether they're the SAME node object or two different ones. Kept behind
// DEBUG per <keep_logs_gate_behind_DEBUG>, never removed.
const debugIds = new WeakMap<ISymbioteNode, number>();
let nextDebugId = 1;
export function debugNodeId(node: ISymbioteNode): number {
  let id = debugIds.get(node);
  if (id === undefined) {
    id = nextDebugId++;
    debugIds.set(node, id);
  }
  return id;
}

// Vue's runtime-core needs comment/anchor nodes (fragments, v-if, v-for) to track
// sibling order; Fabric has no such concept. An anchor is a real retained node so
// insert/nextSibling/parentNode ordering stays correct, but the commit walk SKIPS it
// (commit.ts): no native view is ever created. Marked by a sentinel component name,
// not a new field, so the hot SymbioteNode shape is untouched.
export const ANCHOR_COMPONENT = '#anchor';

export function createAnchor(): ISymbioteNode {
  return createElement(ANCHOR_COMPONENT);
}

export function isAnchor(node: ISymbioteNode): boolean {
  return node.component === ANCHOR_COMPONENT;
}

// A raw text with no characters must not reach Fabric. Its fragment is dropped by
// AttributedString::appendFragment, but the text walk has already flagged "the last child was raw
// text", so the NEXT raw sibling merges into `fragments.back()` of an empty vector and the process
// aborts. The commit walk skips such a node exactly as it skips an anchor (commit.ts,
// renderableChildren); an empty string paints nothing either way, so nothing is lost. `''` only —
// a whitespace-only string is real content inside a <Text>.
export function isEmptyRawText(node: ISymbioteNode): boolean {
  return node.component === RAW_TEXT_COMPONENT && node.props.text === '';
}

// Dirty-marking: lets reconcile return an untouched subtree by reference instead of rebuilding
// every node's Fabric props and deep-comparing them against the mirror. That walk costs ~13 us per
// node on device (Hermes, iOS Debug, examples/react benchmark screen), so without the flag a
// 1200-node tree burns a whole 16.6 ms frame no matter how small the change - the cost tracks TREE
// SIZE, not change size.
//
// Marking walks up to the first ALREADY-dirty ancestor and stops, so a burst of mutations under one
// subtree pays for one chain walk rather than one per mutation. Reconcile clears every node it
// visits, which keeps the invariant "an ancestor of a dirty node is dirty" across commits.
//
// Listener changes deliberately do NOT mark. `node.listeners` never reaches Fabric (event dispatch
// reads it straight off the retained node) and React hands us a fresh handler closure on nearly
// every render, so marking there would re-dirty the whole tree every commit and hand the win back.
// The one listener that DOES change a Fabric prop, `layout`, raises `onLayout` through setProp
// below and is marked that way.
export function markDirty(node: ISymbioteNode): void {
  let current: ISymbioteNode | undefined = node;
  while (current !== undefined && !current.dirty) {
    current.dirty = true;
    current = current.parent;
  }
}

// The prop-write twin of markDirty: raises this node's OWN props flag and then bubbles the subtree
// flag as usual. Every path that writes `node.props` must come through here - setProp and setText
// below, setNativeProps in commit.ts (which writes the record directly and so owes its own mark).
//
// Note the two flags are raised INDEPENDENTLY rather than one implying the other. markDirty stops
// at the first already-dirty ancestor, so a node dirtied a moment ago by a child's change would
// otherwise have its own prop write silently dropped: the walk would exit before setting anything
// here. Setting propsDirty first, unconditionally, is what makes that ordering safe.
export function markPropsDirty(node: ISymbioteNode): void {
  node.propsDirty = true;
  markDirty(node);
}

// How many prop writes actually landed, and how many the no-op guard below turned away.
// Read-and-zeroed through readCommitProfile() (commit.ts), which folds them into the same window
// as the walk numbers so one read prices both halves: `propNoops` is the waste an adapter is
// generating above the engine, `nodesVisited` is what that waste costs below it.
//
// Not gated behind isDebug(), for the same reason the commit profile is not: an integer increment
// is noise next to the prop write it counts, and the figure is only meaningful from a release
// build. A per-call dlog was the obvious alternative and is deliberately NOT here - the Angular
// screen that motivated the guard emitted 90 000 no-op writes on one press, and a log line each
// would measure the logging rather than the code (see the `perf-claims-need-numbers` rule).
const propStats = { writes: 0, noops: 0 };

export function takePropStats(): { writes: number; noops: number } {
  const snapshot = { writes: propStats.writes, noops: propStats.noops };
  propStats.writes = 0;
  propStats.noops = 0;
  return snapshot;
}

// A pure prop set: no event inference. `onTintColor` is a Switch prop and reaches
// Fabric like any other; the event-vs-prop decision is made by routeProp, never by
// the key's name.
//
// Writing a value the node already holds is a NO-OP and returns before markDirty. Fabric never saw
// a difference either way - reconcile rebuilds the node's Fabric props and `propsEqual` finds them
// identical, so no clone is emitted - but the mark itself is not free: it walks to the first
// already-dirty ancestor and strips every one of them of the commit walk's early exit, so an
// otherwise untouched subtree gets re-walked purely to prove it is untouched. The guard makes that
// whole bug class free for every adapter instead of each one having to remember to diff first
// (measured: Angular's Pressable host bag pushed 104 000 setProp calls for a screen Solid built in
// 12 000, 90 000 of them writing `undefined` over a key that was not there).
//
// Three deliberate choices:
//
// - `Object.hasOwn`, not `node.props[key] === undefined`. A key explicitly present holding
//   `undefined` is not an absent key: `delete` genuinely changes the record's shape, and
//   `setNativeProps` writes node.props directly and can leave exactly such a key behind. Fabric
//   itself cannot tell the two apart (fabricProps skips undefined values), but node.props is also
//   read outside the commit path, so the retained tree keeps the shape callers asked for.
// - `Object.is`, not a deep compare. A style object, an array, or a handler closure is a fresh
//   reference on nearly every render, so the guard simply never fires for them - correct, since an
//   adapter is free to hand back the SAME reference with mutated contents and identity cannot see
//   that. A deep compare on every prop write would cost more than the walk it saves.
// - The in-place-mutation hazard that leaves is already instrumented: a node skipped as clean whose
//   props have drifted is exactly what `warnIfStale` reports as DIRTY-MISS under DEBUG (commit.ts).
export function setProp(
  node: ISymbioteNode,
  key: string,
  value: unknown,
): void {
  if (value === undefined) {
    if (!Object.hasOwn(node.props, key)) {
      propStats.noops += 1;
      return;
    }
    delete node.props[key];
  } else {
    if (Object.is(node.props[key], value)) {
      propStats.noops += 1;
      return;
    }
    node.props[key] = value;
  }
  propStats.writes += 1;
  markPropsDirty(node);
}

// Fabric gates layout events behind a boolean prop (BaseViewProps.onLayout): unlike
// scroll / touch / change, which the native component emits unconditionally, a
// layout event fires only when the shadow node is flagged. So a `layout` listener
// must also raise that prop, mirroring RN's `onLayout: true` validAttribute;
// otherwise onLayout never fires and anything measuring its own box (VirtualizedList
// viewport) stays at zero.
const LAYOUT_EVENT = 'layout';
const LAYOUT_FLAG_PROP = 'onLayout';

// The explicit event channel. Structural adapters (Svelte addEventListener, Angular
// Renderer2.listen) call this directly with an already-known event name; flat-bag
// adapters reach it through routeProp. A non-function value clears the listener.
export function setEventListener(
  node: ISymbioteNode,
  name: string,
  value: unknown,
): void {
  const isHandler = typeof value === 'function';
  if (isHandler) {
    const handler = value;
    const listeners = (node.listeners ??= new Map());
    listeners.set(name, (event: ISymbioteEvent) => handler(event));
  } else {
    node.listeners?.delete(name);
  }
  if (name === LAYOUT_EVENT)
    setProp(node, LAYOUT_FLAG_PROP, isHandler ? true : undefined);
}

const ON_PREFIX = /^on[A-Z]/;

// onChange -> change
function listenerName(propName: string): string {
  return propName.charAt(2).toLowerCase() + propName.slice(3);
}

// The responder-negotiation events (PanResponder's panHandlers). They are a
// JS-side protocol the event layer synthesizes from raw touches, NOT Fabric
// ViewConfig events, so isEventFor never reports them. Treat them as listeners on
// any node so PanResponder's handlers actually attach (rather than routing to
// setProp and reaching Fabric as dead props). Names are post-listenerName.
const RESPONDER_EVENTS: ReadonlySet<string> = new Set([
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
]);

// React's JSX dev transform (transform-react-jsx-self / -source, injected by RN's babel
// preset whenever dev=true) annotates every element with __self (the component instance)
// and __source ({ fileName, lineNumber, columnNumber }). React's own Fabric host config
// consumes both and never forwards them. A JSX-based adapter (Vue JSX, Solid JSX) instead
// carries them onto the vnode as ordinary props, so they reach setProp and then Fabric,
// where Android's folly::dynamic rejects __self with "JS Functions are not convertible to
// dynamic" (the instance holds functions) and the surface paints black, while iOS silently
// drops it. SFC/template authoring never produces them. Strip them here, once, so no
// adapter leaks React JSX dev metadata to the host, mirroring React's host config.
const REACT_JSX_DEV_PROPS: ReadonlySet<string> = new Set([
  '__self',
  '__source',
]);

// `class`/`className` and `style` can each be set independently and out of order — Vue's
// patchProp fires one call per changed key, Angular's addClass/removeClass and setStyle are
// separate Renderer2 calls, and even React re-invokes routeProp once per changed prop on an
// update — but setProp does a flat overwrite with no merge, so whichever call lands last would
// silently clobber the other. Track both halves per node so either update recomputes the same
// [classStyle, explicitStyle] pair; flattenStyle's later-wins array collapse
// (core/engine/src/style/index.ts) then always resolves with the explicit `style` prop winning
// over the class-derived one, regardless of call order. This lives here, not per-adapter, so
// class="..."/className="..." resolve through the shared style registry identically everywhere:
// React JSX `className`, Vue template `class`, and Angular's addClass/removeClass token
// accumulation (adapters/angular/src/renderer.ts, which joins its tokens into one string and
// hands it to routeProp same as the others) all funnel through the same two branches below.
interface IClassStyleParts {
  classStyle?: unknown;
  explicitStyle?: unknown;
  // The hide-without-unmount slot, LAST so it wins over both halves, and cleared rather than
  // overwritten so unhiding restores exactly what the author wrote. React's `Activity` (and any
  // future adapter equivalent) needs a node to stop painting while its state and its children
  // stay mounted; RN's own renderer does this by writing `style: {display:'none'}` straight onto
  // the instance, which here would clobber the declarative style and leave nothing to restore
  // from. A third part costs one array slot and makes the operation exactly reversible.
  hiddenStyle?: unknown;
}
const classStyleParts = new WeakMap<ISymbioteNode, IClassStyleParts>();

// The fresh array below means setProp's no-op guard never fires for `style`, and that is
// DELIBERATE - do not "finish the optimization" by skipping when both halves are unchanged.
// `classStyleParts` is a shadow copy of the declarative style, and setNativeProps bypasses it
// (it writes node.props.style directly, merging an Animated frame onto whatever is there). An
// app that hands over a hoisted style constant - StyleSheet.create, a module-level object - would
// then re-push an identity-equal half, get skipped, and never restore the declarative style the
// animation overwrote. The re-push IS the restore path.
function commitClassStyle(
  node: ISymbioteNode,
  patch: Partial<IClassStyleParts>,
): void {
  const entry = { ...classStyleParts.get(node), ...patch };
  classStyleParts.set(node, entry);
  // The third slot is APPENDED ONLY WHILE HIDDEN. Writing a permanent three-element array would
  // change the style payload of every node in every app for a state almost none of them are ever
  // in — and this project spent a day removing per-frame allocations, so a slot that is undefined
  // 99.9% of the time does not get to ride along on every style write.
  setProp(
    node,
    'style',
    entry.hiddenStyle === undefined
      ? [entry.classStyle, entry.explicitStyle]
      : [entry.classStyle, entry.explicitStyle, entry.hiddenStyle],
  );
}

// `display: 'none'` is a real RN style value (Yoga's DisplayNone), so a hidden node keeps its
// place in the tree, its state and its children — it just stops laying out and painting.
const HIDDEN_STYLE = { display: 'none' } as const;

/**
 * Stop a node painting without unmounting it, or let it paint again.
 *
 * The seam React's `Activity`/`Suspense` reach for through `hideInstance`/`unhideInstance`. It
 * lives in the engine rather than an adapter because the reversibility problem — restoring the
 * author's style byte for byte — belongs to whoever owns the style merge, and that is here.
 */
export function setNodeHidden(node: ISymbioteNode, hidden: boolean): void {
  commitClassStyle(node, { hiddenStyle: hidden ? HIDDEN_STYLE : undefined });
}

// The explicit (non-class-derived) style half, for an adapter that builds its style prop up
// key-by-key (Angular's Ivy ɵɵstyleProp/setStyle) instead of handing over one whole object —
// it must merge onto this, not onto node.props.style directly, which may be the
// [classStyle, explicitStyle] array commitClassStyle writes above.
export function getExplicitStyle(node: ISymbioteNode): unknown {
  return classStyleParts.get(node)?.explicitStyle;
}

const CLASS_PROP_KEYS: ReadonlySet<string> = new Set(['class', 'className']);

// The flat-bag split (React / Vue / Solid): an `onX` prop becomes an event listener
// ONLY when the node's component actually declares `x` as an event (per the shared
// ViewConfig). Otherwise it is a plain prop, so `onTintColor` on a Switch, whose
// only event is `change`, routes to setProp and reaches Fabric.
export function routeProp(
  node: ISymbioteNode,
  key: string,
  value: unknown,
): void {
  if (REACT_JSX_DEV_PROPS.has(key)) return;
  if (CLASS_PROP_KEYS.has(key)) {
    commitClassStyle(node, {
      classStyle: resolveClassName(isClassNameValue(value) ? value : undefined),
    });
    return;
  }
  if (key === 'style') {
    commitClassStyle(node, { explicitStyle: value });
    return;
  }
  if (ON_PREFIX.test(key)) {
    const name = listenerName(key);
    const isRegisteredEvent =
      RESPONDER_EVENTS.has(name) || isEventFor(node.component, name);
    // Investigation instrumentation (HeaderOptionsScreen unresponsive-buttons bug): RNS* views
    // derive their events from react-native-screens' own codegen ViewConfig (registry.ts), so an
    // unregistered event silently falls through to setProp below — a dead prop Fabric ignores,
    // indistinguishable from "the button did nothing" at the UI. Scoped to RNS* to avoid noise
    // from the rest of the app. Kept behind DEBUG per <keep_logs_gate_behind_DEBUG>, never removed.
    if (node.component.startsWith('RNS')) {
      dlog(
        `routeProp: ${node.component} "${key}" -> listener "${name}" ` +
          `registered=${isRegisteredEvent} at t=${Date.now()}`,
      );
    }
    if (isRegisteredEvent) {
      setEventListener(node, name, value);
      return;
    }
  }
  setProp(node, key, value);
}

// The same no-op guard as setProp, and here it is strictly stronger: `text` is a string, so
// `Object.is` is a real value comparison rather than the reference check it degrades to for a style
// object or a handler. A framework that re-renders a subtree and hands back an unchanged label -
// every list row whose text did not move, on every update - stops stripping its ancestors of the
// commit walk's early exit. Counted in the same propStats, because a text write IS a prop write:
// it lands in node.props.text and reaches Fabric as RCTRawText's only prop.
//
// Safe against the one ordering hazard worth naming: a raw-text node REPARENTED under a <Text>
// commits as RCTVirtualText instead of RCTText (viewNameFor, commit.ts). That flip is not driven
// from here - a structural op marks the parent chain, and reconcile re-checks `committed.parent` on
// its early-exit path - so a same-text write not marking cannot hide it.
export function setText(node: ISymbioteNode, text: string): void {
  if (Object.is(node.props.text, text)) {
    propStats.noops += 1;
    return;
  }
  node.props.text = text;
  propStats.writes += 1;
  markPropsDirty(node);
}

// Structural ops mark the PARENT chain (both the old and the new one), never the moved child:
// a child that only changed position may legitimately still be clean, and reconcile re-checks
// `committed.parent` on its early-exit path, so a reparent is caught there rather than by a flag.
function detach(child: ISymbioteNode): void {
  const parent = child.parent;
  if (!parent) return;
  const index = parent.children.indexOf(child);
  if (index >= 0) parent.children.splice(index, 1);
  child.parent = undefined;
  markDirty(parent);
}

export function appendChild(parent: ISymbioteNode, child: ISymbioteNode): void {
  detach(child);
  child.parent = parent;
  parent.children.push(child);
  markDirty(parent);
}

export function insertBefore(
  parent: ISymbioteNode,
  child: ISymbioteNode,
  beforeChild: ISymbioteNode,
): void {
  detach(child);
  child.parent = parent;
  const index = parent.children.indexOf(beforeChild);
  parent.children.splice(index < 0 ? parent.children.length : index, 0, child);
  markDirty(parent);
}

export function removeChild(parent: ISymbioteNode, child: ISymbioteNode): void {
  const index = parent.children.indexOf(child);
  if (index >= 0) parent.children.splice(index, 1);
  child.parent = undefined;
  markDirty(parent);
}

// A structural census of a retained tree: how many nodes it holds, how many of those the commit
// walk skips, and — the number this exists for — the WIDTH of every parent whose child list
// contains a skipped node, because that width is exactly what `renderableChildren` (commit.ts)
// re-scans and re-allocates every time such a parent reconciles.
//
// Anchor count is an ADAPTER property, not an app one. A React/Vue/Svelte/Solid component is a
// function that returns children and allocates no node; an Angular component is bound to a host
// ELEMENT and therefore always has one, kept from painting by anchor-host-registry.ts. So the same
// screen is anchor-free under four adapters and carries one anchor per composed component instance
// under the fifth, and nothing short of counting the live tree shows it — grepping adapter sources
// for "anchor" measures how much they talk about anchors, not how many they build.
//
// Pairs with readCommitProfile()'s childScans/childFlattens (commit.ts): the profile says how often
// a scan was defeated over a window, this says over how many children each defeat could range.
export interface ITreeCensus {
  nodes: number;
  anchors: number;
  emptyRawTexts: number;
  /** Nodes the commit walk actually reconciles: `nodes` minus everything it skips. */
  renderable: number;
  /** children.length of every parent holding at least one skipped child, widest first. */
  flattenWidths: number[];
}

export function censusRetainedTree(
  roots: readonly ISymbioteNode[],
): ITreeCensus {
  const census: ITreeCensus = {
    nodes: 0,
    anchors: 0,
    emptyRawTexts: 0,
    renderable: 0,
    flattenWidths: [],
  };
  // Explicit stack, not recursion: a deep list under a benchmark screen would blow the JS stack
  // on the very tree this is meant to measure.
  const stack: ISymbioteNode[] = [...roots];
  while (stack.length > 0) {
    const node = stack.pop();
    if (node === undefined) break;
    census.nodes += 1;
    if (isAnchor(node)) census.anchors += 1;
    else if (isEmptyRawText(node)) census.emptyRawTexts += 1;
    else census.renderable += 1;
    if (node.children.some(child => isAnchor(child) || isEmptyRawText(child)))
      census.flattenWidths.push(node.children.length);
    for (const child of node.children) stack.push(child);
  }
  census.flattenWidths.sort((left, right) => right - left);
  return census;
}
