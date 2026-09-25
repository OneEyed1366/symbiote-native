// The mutation API. Adapters call it; every call appends an OPCODE to `mutation-buffer.ts` and
// nothing else. There is no tree here — no parent, no children, no props, no mirror. Turning the
// buffer into a tree is the HOST's job (`tree-host.ts`).

// What a node still legitimately owns is what the framework, not Fabric, put on it: the Fabric view
// name, whether it's a text container, its JS listener map, the declarative class/style halves the
// engine merges, and the bookkeeping flags. An ADDRESS plus the state that never crosses.

import type {
  IMeasureOnSuccess,
  IMeasureInWindowOnSuccess,
  IMeasureLayoutOnSuccess,
} from './fabric';
import {
  recordAppendChild,
  recordCreateAnchor,
  recordCreateVoid,
  noteHostSideChange,
  recordCreateElement,
  recordCreateRawText,
  recordInsertBefore,
  recordRemoveChild,
  recordSetComponent,
  recordSetOwnedListener,
  recordSetUnderlayShown,
  recordSetProp,
  recordSetText,
} from './mutation-buffer';
import { isEventFor } from './view-config';
import {
  canonicalClassName,
  EMPTY_STYLE,
  isClassNameValue,
  resolveActiveClassName,
  resolveClassName,
  type IClassNameValue,
} from './style-registry';
import { dlog, isDebug } from './debug';
import {
  appListenerFor,
  attachHostBehavior,
  claimModeFor,
  hasAttachedBehaviors,
  hasHostBehaviors,
  markDetachCandidate,
  notifyChildInserted,
  notifyOwnedListenerChange,
  noteCommitHookNodeChanged,
  ownsListener,
  reattachHostBehaviors,
  derivedNodesOf,
  slotDerivesFrom,
  slotPropNameFor,
  slotTakesChildren,
  stashAppListener,
  type IHostBehavior,
  type IPayloadFold,
} from './host-behavior';
import { configPayloadFold } from './registry';
import { resolveStructuredStyle } from './structured-style';
import {
  IMAGE_SOURCE_PROPS,
  IMAGE_LOAD_EVENT_NAMES,
  anyImageLoadEventListenerWired,
  resolveImageSourceProp,
} from './image-source-write';
import { Platform } from './platform';
// A cycle, deliberately: `imperative.ts` imports this module; the prototype methods below call
// back into it. Neither touches the other at module-evaluation time, only inside a function body,
// so every loader resolves it (CLAUDE.md's load-time side-effect rule).
import {
  measure as engineMeasure,
  measureInWindow as engineMeasureInWindow,
  measureLayout as engineMeasureLayout,
  setNativeProps as engineSetNativeProps,
  dispatchViewCommand,
} from './imperative';
// The same deliberate cycle, for the same reason: `tree-host.ts` imports `takePropStats` from here
// and `censusRetainedTree` below asks it for the census. Function bodies only, on both sides.
import {
  EMPTY_CENSUS,
  flushOps,
  treeHost,
  type ITreeCensus,
} from './tree-host';
// The same deliberate cycle, for the same reason: `routeProp` resolves an AnimatedNode written
// into a prop, and the module that owns that resolution reaches back here for `setProp`. See
// `animated/host-binding.ts`'s header.
import { hasAnimatedNodes } from './animated/graph';
import {
  bindAnimatedEvent,
  bindAnimatedValue,
  hasAnimatedBindings,
  reattachAnimatedProps,
} from './animated/host-binding';

const BRAND: unique symbol = Symbol('symbiote.node');

// A node carries the Fabric view name directly, so adding a primitive is just a new string from
// the adapter, no core change. The only name resolved at commit time is text: a <Text> nested
// inside another <Text> becomes a virtual span; `isText` marks a container so descendants pick it.
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
  // Fabric view name passed to createNode (RCTView, RCTImageView, RCTText, ...). NOT readonly:
  // only `setNodeComponent` may write it, since a primitive whose native view depends on a prop
  // (TextInput's `multiline`) must change view without changing IDENTITY — ref, behavior, children.
  component: string;
  // A text container: its descendants render as virtual text spans.
  readonly isText: boolean;
  listeners: Map<string, IListener> | undefined;
  // `props`, `children`, `parent`, `tid` and the dirty flags were all here and are all GONE. A node
  // carries an ADDRESS: the host holds the props and the structure, and every question about either
  // is a read through `tree-host.ts`. The buffer is what tells the host; nothing here mirrors it.

  // No `hasAriaAlias` field: the aria fold lives in the device rule (`SymbioteFabricProps.cpp`),
  // which recomputes presence from the bag it already holds — a per-node flag would be write-only.

  // Whether this node's host behavior declared `afterCommit` — read on every prop write, so a field
  // rather than a Set lookup. Gates the post-commit beat to nodes whose props actually moved, which
  // took TextInput's `propOf` off every commit. Set once at `createElement`.
  hasCommitHook: boolean;

  // Whether this node's image-source props are resolved on the way IN (image-source-write.ts).
  // Gated on the NODE, not the key: the resolution normalises to Image's ARRAY shape, which a
  // WebView or third-party video view spelling `source` does not read. Set at `createElement`.
  resolvesImageSources: boolean;
  // Flips `id`/`nativeID` precedence to nativeID-over-id, for the one behavior that needs it
  // (TouchableWithoutFeedback — see `routeIdAlias`). Set once at `createElement`, by
  // `attachHostBehavior`, for the behavior that declares it.
  nativeIdWinsOverId: boolean;
  // The payload fold this node's host behavior supplied, or undefined for the ~all with none. Set
  // once at `createElement`, read by `fabricProps`. Keyed on the BEHAVIOR, not `node.component`:
  // several tags (pressable/touchable-opacity/view) share the Fabric name `RCTView`.
  payloadFold: IPayloadFold | undefined;

  // The behavior attached to this node, or `undefined` for most. A field, not a `WeakMap`: readers
  // run per-node at list scale (teardown sweep, `routeProp`'s per-write questions). Owned by
  // `host-behavior.ts`; `attachHostBehavior` is the only writer.
  hostBehavior: IHostBehavior | undefined;
  // The declarative halves of this node's style (IClassStyleParts, commitClassStyle below).
  // `undefined` until the first class/style write. A field, not a `WeakMap` + spread: the latter
  // put a patch literal, a spread object and two hash ops on every write, GC-heavy at scale.

  // ENGINE-OWNED. An adapter reads and writes style through routeProp, never through this field.
  styleParts: IClassStyleParts | undefined;

  // Where this node's APP children go, when the node owns an internal subtree (a COMPOSITION like
  // ScrollView wrapping a content view). The behavior builds that structure once at attach and
  // points this at the node app children belong under; append/insert/remove redirect transparently.

  // A FIELD, not a WeakMap: read on every structural op, so it must not cost a hash probe to learn
  // that almost no node has a slot. SINGLE HOP by design — a slot needing depth builds its own
  // chain and points this at the innermost node, rather than making every read a walk.
  childHost: ISymbioteNode | undefined;

  // The node standing in THIS node's place in its parent's child list. Set when a behavior claims
  // a child in `wrap` mode — how an Android ScrollView takes a RefreshControl (it holds exactly
  // one child; a sibling would crash `addViewAt`). Only the two structural entry points read this.
  wrapper: ISymbioteNode | undefined;

  // Has this node EVER been named as the parent of a structural op. One bit, deliberately not a
  // child list: JS holds no tree. False means `childrenOf` may answer "empty" without asking the
  // host; true means "ask" (never goes back false, the safe direction).

  // Exists because a READ IS A BATCH BOUNDARY — every read calls `flushOps`, so a question whose
  // answer is empty still cuts the op stream in two. Without this bit, a list with no children read
  // repeatedly still drains the buffer every time instead of crossing once.
  mayHaveChildren: boolean;

  // Whether the teardown sweep has released this node and not seen it come back. A field, not a
  // `WeakSet`: the sweep reads/writes it for EVERY node of a removed subtree, and every insert
  // reads it to decide whether to walk at all. Owned by host-behavior.ts's `detachOne`.
  isTornDown: boolean;

  // This node's index in the CURRENT batch's `handles` table, and the batch that index belongs to.
  // Owned by `mutation-buffer.ts` and meaningless to everyone else — see `slotOf` for why the pair
  // lives on the node instead of in a `Map`.
  slot: number;
  slotBatch: number;

  // RN's ReactFabricHostComponent surface - what a template/function ref hands back and what
  // reanimated/gesture-handler/react-navigation reach through. Each resolves the CURRENT committed
  // handle at call time and degrades to a silent no-op before the first commit.

  // PROTOTYPE methods, not closures grafted per node — grafting six closures per node is GC-heavy
  // at scale (each pins its own context alive), where a shared prototype costs one object total.
  measure(callback: IMeasureOnSuccess): void;
  measureInWindow(callback: IMeasureInWindowOnSuccess): void;
  measureLayout(
    relativeToNativeNode: ISymbioteNode | number,
    onSuccess: IMeasureLayoutOnSuccess,
    onFail?: () => void,
  ): void;
  setNativeProps(nativeProps: Record<string, unknown>): void;
  focus(): void;
  blur(): void;
  // The scroll commands, on every node for the same reason `focus`/`blur` are: a tag hands the app
  // its engine NODE, so a wrapper's imperative handle must stay reachable from here. ON THE SHARED
  // PROTOTYPE, not per-tag — harmless where meaningless, like RN's own host component.
  scrollTo(options?: { x?: number; y?: number; animated?: boolean }): void;
  scrollToEnd(options?: { animated?: boolean }): void;
  flashScrollIndicators(): void;
}

const FOCUS_COMMAND = 'focus';
const BLUR_COMMAND = 'blur';
// Names and arg order mirror RN's ScrollViewCommands.
const SCROLL_TO_COMMAND = 'scrollTo';
const SCROLL_TO_END_COMMAND = 'scrollToEnd';
const FLASH_SCROLL_INDICATORS_COMMAND = 'flashScrollIndicators';

// The one shape every retained node has: a class, so the imperative methods share a prototype
// instead of being allocated per node, and both factories below mint the same hidden class. Fields
// are `declare`d and assigned in the constructor, the shape V8/Hermes handle best.
class SymbioteNode implements ISymbioteNode {
  declare readonly [BRAND]: true;
  declare component: string;
  declare readonly isText: boolean;
  declare listeners: Map<string, IListener> | undefined;
  declare hasCommitHook: boolean;
  declare resolvesImageSources: boolean;
  declare nativeIdWinsOverId: boolean;
  declare styleParts: IClassStyleParts | undefined;
  declare payloadFold: IPayloadFold | undefined;
  declare hostBehavior: IHostBehavior | undefined;
  declare childHost: ISymbioteNode | undefined;
  declare wrapper: ISymbioteNode | undefined;
  declare mayHaveChildren: boolean;
  declare isTornDown: boolean;
  declare slot: number;
  declare slotBatch: number;

  constructor(component: string, isText: boolean) {
    // Every field below is assigned here, not lazily: present from the constructor, they all keep
    // ONE hidden class for every node. `attachHostBehavior` raises several of them later for the
    // rare node whose behavior declares that capability.
    this[BRAND] = true;
    this.component = component;
    this.isText = isText;
    this.listeners = undefined;
    this.hasCommitHook = false;
    this.resolvesImageSources = false;
    this.nativeIdWinsOverId = false;
    this.styleParts = undefined;
    this.payloadFold = undefined;
    this.hostBehavior = undefined;
    this.childHost = undefined;
    this.wrapper = undefined;
    this.mayHaveChildren = false;
    this.isTornDown = false;
    // `slotOf` reads this pair on EVERY handle operand of every op, so both must be stable slots.
    // `slotBatch` starts at a value no real batch carries, so an untouched node reads as "not in
    // this batch" with no separate flag.
    this.slot = 0;
    this.slotBatch = 0;
  }

  measure(callback: IMeasureOnSuccess): void {
    engineMeasure(this, callback);
  }

  measureInWindow(callback: IMeasureInWindowOnSuccess): void {
    engineMeasureInWindow(this, callback);
  }

  measureLayout(
    relativeToNativeNode: ISymbioteNode | number,
    onSuccess: IMeasureLayoutOnSuccess,
    onFail?: () => void,
  ): void {
    if (!isSymbioteNode(relativeToNativeNode)) {
      dlog('measureLayout: relative target must be a host ref');
      return;
    }
    engineMeasureLayout(this, relativeToNativeNode, onSuccess, onFail);
  }

  setNativeProps(nativeProps: Record<string, unknown>): void {
    engineSetNativeProps(this, nativeProps);
  }

  focus(): void {
    dispatchViewCommand(this, FOCUS_COMMAND, []);
  }

  blur(): void {
    dispatchViewCommand(this, BLUR_COMMAND, []);
  }

  // The defaults live HERE and nowhere else. `buildScrollViewHandle`
  // (`@symbiote-native/components`) delegates here, so a built handle and a node cannot drift on
  // what `scrollTo()` with no argument means.
  scrollTo(options?: { x?: number; y?: number; animated?: boolean }): void {
    const x = options?.x ?? 0;
    const y = options?.y ?? 0;
    const animated = options?.animated ?? true;
    dlog(`ScrollView.scrollTo x=${x} y=${y} animated=${animated}`);
    dispatchViewCommand(this, SCROLL_TO_COMMAND, [x, y, animated]);
  }

  scrollToEnd(options?: { animated?: boolean }): void {
    const animated = options?.animated ?? true;
    dlog(`ScrollView.scrollToEnd animated=${animated}`);
    dispatchViewCommand(this, SCROLL_TO_END_COMMAND, [animated]);
  }

  flashScrollIndicators(): void {
    dlog('ScrollView.flashScrollIndicators');
    dispatchViewCommand(this, FLASH_SCROLL_INDICATORS_COMMAND, []);
  }
}

// The committed record — handle, tag, rootTag — is the host's; `committedRecordOf` (tree-host.ts)
// answers for it, keyed on the handle OBJECT. A Vue Proxy around a host element misses that key,
// so a wrapped node's calls degrade to "not committed" — hold host nodes with `shallowRef`.

// Mint an element and record its creation. The node object IS the handle: what the ops address,
// what the host attaches its native node to, what Fabric hands back as an event target.
export function createElement(
  component: string,
  isText = false,
  // The intrinsic tag this node came from, when it differs from the Fabric view name above. The
  // behavior registry is keyed by tag, so an adapter creating `<pressable>` must hand it over here
  // or the registration cannot fire. Nothing is stored — the lookup happens once, right below.
  tag: string = component,
): ISymbioteNode {
  const node = new SymbioteNode(component, isText);
  // A primitive that commits NO VIEW resolves to the anchor component through `descriptorFor`
  // (touchable-without-feedback, touchable-native-feedback), reaching this rather than
  // `createAnchor` because the caller only knows it has a descriptor.
  if (component === ANCHOR_COMPONENT) recordCreateAnchor(node);
  // A primitive whose ENTIRE subtree must vanish on this platform (input-accessory-view on
  // Android) resolves to the void component the same way. An anchor hoists its children into
  // Fabric in its place; a void node contributes neither itself nor them.
  else if (component === VOID_COMPONENT) recordCreateVoid(node);
  // `instanceHandle` is the node itself: it round-trips through Fabric unchanged and comes back
  // as the event target, and the BRAND below confirms it is one of ours.
  else recordCreateElement(node, component, isText, node);
  // Gated on the boolean, not on the Map: this runs ~9 000 times per benchmark create, and an app
  // that registers nothing must pay one boolean read rather than a hash lookup per node.
  if (hasHostBehaviors()) attachHostBehavior(node, tag);

  // A third-party view's own ViewConfig processors, as a fold, AFTER the behavior's — the behavior
  // rewrites wrapper-body props, and `validAttributes[*].process` then converts what it produced.
  // Costs one `Set.has` per node for a built-in, where `resolve` bails.
  const configFold = configPayloadFold(component);
  if (configFold !== undefined) {
    const behaviorFold = node.payloadFold;
    node.payloadFold =
      behaviorFold === undefined
        ? configFold
        : props => configFold(behaviorFold(props));
  }
  return node;
}

// `tag` mirrors `createElement`'s: the behavior registry is keyed by tag, and a raw text's CONTENT
// can still be a function of the platform (Button renders its title uppercased on Android), even
// with no props an app can write. Defaulted to the raw-text component for existing callers.
export function createRawText(
  text: string,
  tag: string = RAW_TEXT_COMPONENT,
): ISymbioteNode {
  const node = new SymbioteNode(RAW_TEXT_COMPONENT, false);
  recordCreateRawText(node, text);
  // TAG check first, not `hasHostBehaviors()`: almost no raw text is tagged (thousands are leaves
  // under a `<Text>`), so an untagged one pays a pointer-equality compare against the default,
  // not a registry lookup.
  if (tag !== RAW_TEXT_COMPONENT && hasHostBehaviors())
    attachHostBehavior(node, tag);
  return node;
}

// `instanceHandle` round-trips through Fabric unchanged: the object we pass to
// createNode comes back as the event target. We brand our nodes so the event
// handler can confirm a target is one of ours before dispatching.
export function isSymbioteNode(value: unknown): value is ISymbioteNode {
  return typeof value === 'object' && value !== null && BRAND in value;
}

// A WeakMap can't be logged, so this gives every node a small human-readable id, assigned lazily
// on first call — lets a dlog at ref-attach time and one at commit/dispatch time be compared to
// prove whether they're the SAME node object. Kept behind DEBUG per <keep_logs_gate_behind_DEBUG>.
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

// Vue's runtime-core needs comment/anchor nodes (fragments, v-if, v-for) to track sibling order;
// Fabric has no such concept. An anchor is a real retained node so insert/nextSibling/parentNode
// ordering stays correct, but the commit walk SKIPS it — no native view is ever created.
export const ANCHOR_COMPONENT = '#anchor';

export function createAnchor(): ISymbioteNode {
  const node = new SymbioteNode(ANCHOR_COMPONENT, false);
  recordCreateAnchor(node);
  return node;
}

// The sentinel a primitive resolves to when its ENTIRE subtree must vanish from Fabric on this
// platform (input-accessory-view on Android). Unlike ANCHOR_COMPONENT, whose node hoists children
// up, a void node's children never reach Fabric either — the commit walk stops there, recursively.
export const VOID_COMPONENT = '#void';

export function createVoid(): ISymbioteNode {
  const node = new SymbioteNode(VOID_COMPONENT, false);
  recordCreateVoid(node);
  return node;
}

// The sentinel a SURFACE's own root node carries, so `parentOf` can stop there. A top-level node
// must answer `undefined` for its parent — Angular reads `null` as "defer, ng-content will place
// this", while Vue/Solid spell `?? surface` and need the exact object to compare against.

// JS-side name only: what goes over the wire is `RCTView`, because this node is real.
export const SURFACE_COMPONENT = '#surface';

// One persistent root view per surface, mirroring RN's own AppContainer: `renderApplication` wraps
// the app in `<View style={{flex:1}} pointerEvents="box-none">`. Not decoration — without flex:1 a
// non-flex root collapses to content height, and without box-none an outside touch has no escape.

// Commits as ONE node rather than hoisting children into the child set, so the host materializes
// the node OP_COMMIT names instead of walking its children (an anchor there still hoists).
export function createSurfaceRoot(): ISymbioteNode {
  const node = new SymbioteNode(SURFACE_COMPONENT, false);
  recordCreateElement(node, 'RCTView', false, node);
  // Recorded straight, not through `routeProp`: these are literal Fabric props, not props an app
  // authored, so they want none of the class merging or event routing that path exists for.
  recordSetProp(node, 'style', { flex: 1 });
  recordSetProp(node, 'pointerEvents', 'box-none');
  return node;
}

export function isAnchor(node: ISymbioteNode): boolean {
  return node.component === ANCHOR_COMPONENT;
}

// A raw text with no characters must not reach Fabric — AttributedString::appendFragment drops the
// fragment while the text walk has already flagged "last child was raw text", so the next raw
// sibling merges into an empty `fragments.back()` and aborts. Enforced by the host, not here.

// No dirty-marking here: an op names the node it changed, so the host marks that node and its
// ancestors. `node.listeners` never reaches Fabric, except `layout`, which raises `onLayout`
// through `setProp` below.

// Change which Fabric view a node commits as, keeping the node's identity. Policy stays out of the
// engine — which prop decides, and between which views, lives in HOST_PRIMITIVES; the engine only
// swaps the name. A no-op when unchanged, so a renderer may call it on every update.

// Both the JS field and the op move: `node.component` is what the aria fold and fabricProps key
// on, the op is what makes the host re-create the node, since no prop write moves it between views.
export function setNodeComponent(node: ISymbioteNode, component: string): void {
  if (node.component === component) return;
  node.component = component;
  recordSetComponent(node, component);
}

// Tree-staleness marking (which ancestor went stale, presence flips, anchor climbs) lives entirely
// on the host now, derived from the ops themselves — nothing here has to answer those questions.

// How many prop writes an adapter pushed at the engine. Read-and-zeroed through
// readCommitProfile() (tree-host.ts), which prices the layer ABOVE the host. No `noops` count: the
// `Object.is` guard lives in the host, which would need the previous value back over the wire.

// Not gated behind isDebug(): an integer increment is noise next to the prop write it counts, and
// the figure is only meaningful from a release build. No per-call dlog either — a log line per
// write would measure the logging rather than the code.
const propStats = { writes: 0 };

export function takePropStats(): { writes: number } {
  const snapshot = { writes: propStats.writes };
  propStats.writes = 0;
  return snapshot;
}

// `<component>.<key>` -> write count, gated behind `isDebug()`: a Map lookup per write is real
// cost on the hottest path, so it only runs when someone asked. Names exactly which (view, key)
// pair an adapter comparison's aggregate delta is hiding.
let propKeyTally: Map<string, number> | undefined;

export function takePropKeyTally(): ReadonlyMap<string, number> {
  const snapshot = propKeyTally ?? new Map();
  propKeyTally = undefined;
  return snapshot;
}

// A pure prop set: no event inference. `onTintColor` is a Switch prop and reaches Fabric like any
// other; the event-vs-prop decision is made by routeProp, never by the key's name.

// `undefined` DELETES the key (`NO_VALUE` on the wire, mutation-buffer.ts). `null` is NOT the same:
// it's a legitimate Fabric value meaning "reset to default", and a merge-on-clone host must tell a
// removed key from one that was never there.

// No `Object.is` DEDUPE HERE: it needs the value the node already holds, which JS doesn't. The
// guard lives in the host's `OP_SET_PROP` instead, where the previous value is a local field.
export function setProp(
  node: ISymbioteNode,
  key: string,
  value: unknown,
): void {
  // A composed primitive's slot — and its wrapper, where it has one — can carry a value DERIVED
  // from an owner prop, so `markPropsDirty` bubbles up or neither ever learns. Here, not in
  // `routeProp`: this is the one choke point every writer passes. See `IHostBehavior.slotDerived`.
  if (node.childHost !== undefined && slotDerivesFrom(node, key)) {
    markPropsDirty(node.childHost);
    // Past the slot: a `buildStructure` that builds a CHAIN registers the deeper nodes here, and
    // each keeps its own pure fold reading the owner. See `addDerivedNode`.
    const derived = derivedNodesOf(node);
    if (derived !== undefined) for (const each of derived) markPropsDirty(each);
    if (node.wrapper !== undefined) markPropsDirty(node.wrapper);
  }
  propStats.writes += 1;
  if (isDebug()) {
    propKeyTally ??= new Map();
    const tallyKey = `${node.component}.${key}`;
    propKeyTally.set(tallyKey, (propKeyTally.get(tallyKey) ?? 0) + 1);
  }
  writeProp(node, key, value);
}

// Function props that never left JS, keyed by node. A function CANNOT cross this wire:
// `jsi::dynamicFromValue` THROWS on a callable, killing the whole batch.

// Two paths reach here past `routeProp`'s registered-`on*` diversion: an unregistered `on*` that's
// an ordinary prop (`onValueChange`), and `setNativeProps`, which bypasses `routeProp` entirely —
// e.g. `Animated.View` spreading `panResponder.panHandlers` copies every key it holds.

// Live here like listeners do; `propOf` looks here first, keeping `onValueChange` readable.
// `fabricProps` drops function props on both hosts, so the payload is byte-identical either way.
const functionProps = new WeakMap<ISymbioteNode, Map<string, unknown>>();

// The one place a prop reaches the wire, and the only place that can keep a function off it.
// `setNativeProps` calls this rather than `recordSetProp` for that reason — the path with no
// `routeProp` in front of it.
export function writeProp(
  node: ISymbioteNode,
  key: string,
  value: unknown,
): void {
  // The same strip `routeProp` does, repeated because THIS is the path with no `routeProp` in
  // front of it: `AnimatedProps` re-sends its whole raw prop bag every frame, so on a JSX adapter
  // `__self` rides straight past the declarative-path filter into the host.
  if (REACT_JSX_DEV_PROPS.has(key)) return;

  // Arms the node's recurring post-commit hook, for the rare node that has one. HERE, not in
  // `setProp`: this is where both the declarative and `setNativeProps` paths meet, so a hook armed
  // only by the former misses the imperative write entirely.
  if (node.hasCommitHook) noteCommitHookNodeChanged(node);

  // `boxShadow`/`filter`/`transform` and Image's source props resolve on the way IN, at this same
  // choke point: the C++ payload builder has no JS to do it headless. `structured-style.ts` hands
  // back the same object when nothing needed resolving, keeping the host's identity guard intact.
  let written: unknown = value;
  if (key === 'style' || key === 'activeStyle') {
    written = resolveStructuredStyle(value);
  } else if (node.resolvesImageSources && IMAGE_SOURCE_PROPS.has(key)) {
    written = resolveImageSourceProp(
      value,
      key === 'source' && Platform.OS === 'android',
    );
  }
  if (typeof written === 'function') {
    let bag = functionProps.get(node);
    if (bag === undefined) {
      bag = new Map();
      functionProps.set(node, bag);
    }
    bag.set(key, value);
    // The host must not be left holding whatever stood under this key before — a stale value read
    // back through `propOf` would beat the function this write just stashed.
    recordSetProp(node, key, undefined);
    return;
  }
  // Written over with a non-function: the stash must let go, or it keeps answering.
  const bag = functionProps.get(node);
  if (bag !== undefined) bag.delete(key);
  recordSetProp(node, key, written);
}

/** What `propOf` consults before asking the host. `undefined` when nothing was stashed. */
export function functionPropOf(node: ISymbioteNode, key: string): unknown {
  return functionProps.get(node)?.get(key);
}

// The same stash, whole — what `propsOf` layers over the host's answer. `undefined` rather than an
// empty Map for a node that stashed nothing (nearly every node), so the caller hands back the
// host's own object instead of copying it.
export function functionPropsOf(
  node: ISymbioteNode,
): ReadonlyMap<string, unknown> | undefined {
  return functionProps.get(node);
}

// "Rebuild this node's payload — the fold reads state I just changed." A behavior whose payload is
// DERIVED has no prop to write (the sticky header's debounced translateY lives in its own
// runtime), so this is the one route that dirties it directly. Pair with requestCommitFor.
export function markPropsDirty(node: ISymbioteNode): void {
  flushOps();
  // Announced to the buffer even though it writes no op: this is the one route that dirties a node
  // without one, and a commit that cannot see it would skip itself as idle.
  noteHostSideChange();
  // The other way a node's payload is rebuilt, and the beat's population must cover both or a
  // behavior whose payload is DERIVED — the sticky header's debounced translateY has no prop to
  // write — would be armed by nothing.
  if (node.hasCommitHook) noteCommitHookNodeChanged(node);
  treeHost()?.markPropsDirty(node);
}

// Fabric gates a handful of events behind a BOOLEAN prop: unlike scroll/touch/change, these fire
// only when the shadow node carries the flag. We drop function props from the payload, so a gated
// handler attaches on our side and the native event silently never arrives without this map.

// Exhaustive as of react-native 0.86: every `bool on*` field in Fabric's C++ props
// (ReactCommon/react/renderer/components/**), keyed by the post-`listenerName` event name.

// `magicTap` maps to `onMagicTap`, not the C++ member name `onAccessibilityMagicTap` — RN's own
// view config (BaseViewConfig.ios.js) disagrees with its C++ prop name, and matching stock is the
// only defensible choice until RN resolves it.
const GATED_EVENT_PROPS: ReadonlyMap<string, string> = new Map([
  ['layout', 'onLayout'],
  ['textLayout', 'onTextLayout'],
  ['accessibilityTap', 'onAccessibilityTap'],
  ['magicTap', 'onMagicTap'],
  ['accessibilityEscape', 'onAccessibilityEscape'],
  ['accessibilityAction', 'onAccessibilityAction'],
]);

// The explicit event channel. Structural adapters (Svelte addEventListener, Angular
// Renderer2.listen) call this directly with an already-known event name; flat-bag
// adapters reach it through routeProp. A non-function value clears the listener.

// Install a listener the BEHAVIOR owns, bypassing the ownership check: `setEventListener` diverts
// an owned name into the stash, which would be circular for the behavior's own dispatcher.

// `undefined` removes it, gate flag included — ScrollView takes the owner's `layout` only while
// something wants it, and a one-way installer would leave `onLayout: true` stuck in the payload.
export function setBehaviorListener(
  node: ISymbioteNode,
  name: string,
  listener: IListener | undefined,
): void {
  if (listener === undefined) node.listeners?.delete(name);
  else (node.listeners ??= new Map()).set(name, listener);
  const flagProp = GATED_EVENT_PROPS.get(name);
  if (flagProp !== undefined)
    setProp(node, flagProp, listener === undefined ? undefined : true);
}

// The unowned names whose presence a platform rule reads. See `setEventListener`.
const PRESSABILITY_NAMES: ReadonlySet<string> = new Set([
  'press',
  'longPress',
  'startShouldSetResponder',
]);

export function setEventListener(
  node: ISymbioteNode,
  name: string,
  value: unknown,
): void {
  const isHandler = typeof value === 'function';
  // A name a host behavior OWNS never reaches `node.listeners`: the behavior's dispatcher holds
  // that slot, and `node.listeners` is single-slot, so without this the app's callback would evict
  // it with no diagnostic — on the keys a gesture STARTS on, silently pressless.
  if (hasHostBehaviors() && ownsListener(node, name)) {
    // The PRESENCE only, never the identity: a fresh closure nearly every render must not notify.
    const wasWired = appListenerFor(node, name) !== undefined;
    stashAppListener(node, name, isHandler ? value : undefined);
    if (wasWired !== isHandler) {
      // The BIT, on the flip only, so a platform rule (`focusable` on a touchable) can resolve a
      // key depending on whether the app wired anything, without the closure leaving JS.
      recordSetOwnedListener(node, name, isHandler);
      notifyOwnedListenerChange(node, name, isHandler);
    }
    const flagged = GATED_EVENT_PROPS.get(name);
    if (flagged !== undefined)
      setProp(node, flagged, isHandler ? true : undefined);
    return;
  }
  // A plain `<text>` presses through the engine's own synthesis, with no behavior owning the
  // names, yet its payload depends on whether it is pressable (Android `accessible`, the `link`
  // role). Same bit as the owned path, on the flip only.
  if (PRESSABILITY_NAMES.has(name)) {
    const wasWired = node.listeners?.has(name) === true;
    if (wasWired !== isHandler) recordSetOwnedListener(node, name, isHandler);
  }
  if (isHandler) {
    const handler = value;
    const listeners = (node.listeners ??= new Map());
    listeners.set(name, (event: ISymbioteEvent) => handler(event));
  } else {
    node.listeners?.delete(name);
  }
  const flagProp = GATED_EVENT_PROPS.get(name);
  if (flagProp !== undefined)
    setProp(node, flagProp, isHandler ? true : undefined);
  // `onLoad`/`onLoadStart`/`onLoadEnd`/`onError` are real Fabric events on `RCTImageView`, so they
  // land here, not in `writeProp` — see image-source-write.ts for why Android's
  // `shouldNotifyLoadEvents` is synthesized from the listener map, not a stashed function value.
  if (node.resolvesImageSources && IMAGE_LOAD_EVENT_NAMES.has(name)) {
    setProp(
      node,
      'shouldNotifyLoadEvents',
      anyImageLoadEventListenerWired(node.listeners) ? true : undefined,
    );
  }
}

// `/^on[A-Z]/` spelled out: this runs on EVERY prop write, and a regex costs measurably more than
// the character reads (mutation-api-fill-cost.itest.ts). The boundary is pinned by node.test.ts.

// 111 is 'o', 110 is 'n', 65-90 is A-Z. `charCodeAt` past the end answers NaN, which fails every
// comparison, so a two-character `on` needs no length check.
function isOnEventName(key: string): boolean {
  if (key.charCodeAt(0) !== 111 || key.charCodeAt(1) !== 110) return false;
  const third = key.charCodeAt(2);
  return third >= 65 && third <= 90;
}

// onChange -> change
function listenerName(propName: string): string {
  return propName.charAt(2).toLowerCase() + propName.slice(3);
}

// The responder-negotiation events (PanResponder's panHandlers): a JS-side protocol synthesized
// from raw touches, not Fabric ViewConfig events, so `isEventFor` never reports them. Treated as
// listeners on any node so the handlers attach instead of reaching Fabric as dead props.
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

// React's JSX dev transform annotates every element with __self (the component instance) and
// __source. React's own Fabric host config consumes both and never forwards them; a JSX-based
// adapter (Vue JSX, Solid JSX) instead carries them as ordinary props, reaching Fabric.

// Both platforms reject it, not just Android: iOS's `jsi::dynamicFromValue` keeps no visited set,
// and `__self` is a cyclic module `this` — an endless walk inside `applyOps` that allocates until
// RAM is exhausted, worse than Android's loud `folly::dynamic` rejection.

// SFC/template authoring never produces them. Strip them here, once, mirroring React's host config.
const REACT_JSX_DEV_PROPS: ReadonlySet<string> = new Set([
  '__self',
  '__source',
]);

// `class`/`className` and `style` can each be set independently and out of order across adapters,
// but `setProp` overwrites with no merge, so the later call would clobber the other. Track both
// halves per node so flattenStyle's later-wins collapse resolves with `style` always winning.
export interface IClassStyleParts {
  classStyle: unknown;
  explicitStyle: unknown;

  // The hide-without-unmount slot, LAST so it wins over both halves, cleared rather than
  // overwritten so unhiding restores exactly what the author wrote. Needed because RN's own
  // `style: {display:'none'}` write would otherwise clobber the declarative style irrecoverably.
  hiddenStyle: unknown;

  // The authored class value, kept so the PRESSED variant resolves ON DEMAND. Stored rather than
  // resolved up front: `routeProp`'s class branch runs far more often than a press happens, so
  // paying a second cache lookup per write to serve a state almost no node is ever in is refused.
  className: IClassNameValue | undefined;
  isPressed: boolean;

  // The pressed variant of the EXPLICIT style (vs one the class registry resolves via `:active`).
  // Arrives as its own prop or from resolving `style={({pressed}) => …}` at `pressed: true` —
  // `:active` and this are the two ways to deliver a pressed look; the engine treats them alike.
  activeStyle: unknown;

  // Whether slot 1's pressed variant came from resolving a FUNCTION `style`, not an authored
  // `activeStyle` write. Only the first kind may be cleared when `style` later arrives plain —
  // clearing the second would break the two-write path, where either prop may land first.
  activeStyleFromCallback: boolean;

  // The array `pushClassStyle` last published, or `undefined` when nothing has, kept here rather
  // than asked of the host because `isAlreadyPublished` runs on every class/style write. Cleared
  // by `setNativeProps`, which is what keeps the restore path alive.
  published: readonly unknown[] | undefined;
}

// All slots are present from the start rather than added as they are written: one hidden class
// for every styled node, instead of a shape transition per slot.

// Narrowed rather than cast: `routeProp` takes `unknown`, and a bare `typeof v === 'function'`
// leaves TS with `Function`, callable with anything. This states the shape the contract promises.
function isStyleCallback(
  value: unknown,
): value is (state: { pressed: boolean }) => unknown {
  return typeof value === 'function';
}

function stylePartsOf(node: ISymbioteNode): IClassStyleParts {
  return (node.styleParts ??= {
    classStyle: undefined,
    explicitStyle: undefined,
    hiddenStyle: undefined,
    className: undefined,
    isPressed: false,
    activeStyle: undefined,
    activeStyleFromCallback: false,
    published: undefined,
  });
}

// The pressed variant is a complete REPLACEMENT, not an overlay: `resolveActiveClassName` resolves
// the element's tokens PLUS `:active` through the same matcher, so the result already contains
// everything the base class gave. No extra slot needed; the published array's shape stays put.

// Resolved LAZILY, at press time, never beside `classStyle` — eager would double the resolutions
// on every class WRITE to serve a state almost no node is ever in. A press is one event on one
// node, so the extra lookup there is invisible.

// `:active` applies only to a class reaching the engine as a STRING — true for nearly every
// producer: Vue/Angular/React all normalize `class` to a string before it reaches here, except
// Svelte's `normalizeSvelteClass`, the one live producer of a non-string class below.

// An OBJECT here is not a class map — `IClassNameValue` types it as an IResolvedStyle, the channel
// ScrollView/VirtualizedList/FlatList/ImageBackground use to hand a style through the class prop.
// Canonicalising it into tokens would silently break their styling — do not "simplify" it away.

// An ARRAY of plain strings: no adapter produces this today, and it reduces fresh every call, so
// it gets neither a pressed variant nor `isAlreadyPublished`.

// The registry memoises a class STRING to the same object; `isAlreadyPublished` compares slot 0
// with Object.is. A variant resolving fresh each call could never be turned away by that guard, so
// unpressed rows would republish and re-dirty forever — the storm the guard exists to stop.

// Slot 1's twin of `baseStyleOf`: the variant replaces slot 1, not slot 0, so it beats the class
// cascade the way the authored style does, while a `:active` rule can still win slot 0 underneath.
function explicitStyleOf(parts: IClassStyleParts): unknown {
  return parts.isPressed && parts.activeStyle !== undefined
    ? parts.activeStyle
    : parts.explicitStyle;
}

function baseStyleOf(parts: IClassStyleParts): unknown {
  return parts.isPressed && typeof parts.className === 'string'
    ? resolveActiveClassName(parts.className)
    : parts.classStyle;
}

// Republish the merged style after one half changed. Halves are written IN PLACE by the callers
// below — no patch object, no spread — because this is the hottest function in the mutation API.

// The fresh ARRAY allocation stays, DELIBERATELY: `setNativeProps` bypasses these parts, so an app
// handing over a hoisted style constant would get skipped by the Object.is guard and never
// restore the declarative style an animation overwrote. The re-push IS the restore path.

// Sound because `pushClassStyle` is the ONLY writer of `parts.published` — so a node that has
// published nothing holds `undefined`, and the first write can never be swallowed as "unchanged".

// What a node publishes when NOTHING resolves. Length 0 is the marker, needing no second field:
// `pushClassStyle` never otherwise publishes an empty array, and it's distinct from `undefined`
// ("nothing published yet", which must never be turned away).
const PUBLISHED_NOTHING: readonly unknown[] = Object.freeze([]);

// ── ONE ARRAY PER DISTINCT PAIR, SHARED ACROSS NODES ─────────────────────────────────────────────
// `mutation-buffer.ts` interns values BY IDENTITY, so distinct-but-equal arrays across a list
// styled the same way cost distinct entries and separate JS -> `folly::dynamic` conversions.

// `WeakMap`, both levels, so nothing grows unbounded: a fresh style object per render gets a fresh
// cache entry that dies with the object, and correctly gets no sharing — two structurally equal
// objects are two values to whoever reads them.

// The three-slot (hidden) form is deliberately NOT cached: `display: 'none'` is rare by
// construction, so a third map would be paid for on every write to serve it.
const sharedPairByExplicit = new WeakMap<object, readonly unknown[]>();
const sharedPairByBase = new WeakMap<
  object,
  WeakMap<object, readonly unknown[]> | readonly unknown[]
>();

// The published array for this pair — same object every time the same two parts are handed in.
// `undefined` when the pair can't be keyed (a primitive half, or the hidden form), and the caller
// then builds its own array; every reader compares slots by identity, never the array itself.
function sharedStylePair(
  base: unknown,
  explicit: unknown,
): readonly unknown[] | undefined {
  const baseIsKeyable = typeof base === 'object' && base !== null;
  const explicitIsKeyable = typeof explicit === 'object' && explicit !== null;

  if (base === undefined && explicitIsKeyable) {
    const cached = sharedPairByExplicit.get(explicit);
    if (cached !== undefined) return cached;
    const made: readonly unknown[] = [base, explicit];
    sharedPairByExplicit.set(explicit, made);
    return made;
  }
  if (!baseIsKeyable) return undefined;

  if (explicit === undefined) {
    const cached = sharedPairByBase.get(base);
    if (Array.isArray(cached)) return cached;
    if (cached === undefined) {
      const made: readonly unknown[] = [base, explicit];
      sharedPairByBase.set(base, made);
      return made;
    }
    // A base that has already been seen WITH an explicit half holds the second-level map here, and
    // the base-only array has nowhere to live beside it. Rare enough not to earn a third map.
    return undefined;
  }
  if (!explicitIsKeyable) return undefined;

  const existing = sharedPairByBase.get(base);
  const byExplicit = existing instanceof WeakMap ? existing : new WeakMap();
  if (existing === undefined) sharedPairByBase.set(base, byExplicit);
  // Same clash as above, the other way round: this base is holding its base-only array. Leave it.
  if (Array.isArray(existing)) return undefined;

  const cached = byExplicit.get(explicit);
  if (cached !== undefined) return cached;
  const made: readonly unknown[] = [base, explicit];
  byExplicit.set(explicit, made);
  return made;
}

// A slot that contributes no keys to the payload: absent, or the registry's shared "this class
// styles nothing" object. An IDENTITY compare, not a key count — `Object.keys(x).length` allocates
// an array, and this runs on every class and style write.

// A plain style bag — not an array of styles, not a callback, not null.
function isStyleRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

// Is this rebuilt style the same style, key for key? A component body writing its style inline
// hands over a fresh object every render, equal to the one already standing, which Object.is
// cannot see — without this the write crosses into the host and is only found unchanged there.

// Shallow and conservative, deliberately: a nested value (transform list, shadow, style array)
// reports "not the same" rather than being deep-compared, so being wrong here is slow, never
// incorrect — the host's own diffProps still refuses those exactly as before.

// `undefined` on either side also reports "not the same", which lets the key COUNT stand in for a
// key-set comparison: equal counts plus every key of `next` matching a defined value in `standing`
// cannot leave a key unaccounted for.
export function isSameShallowStyle(next: unknown, standing: unknown): boolean {
  // THE SAME OBJECT IS THE SAME STYLE, checked first: without it, a re-push of a hoisted constant
  // (what Solid does on every signal change, having no diff) allocates two key arrays and walks
  // them to reach the same answer the identity check gives for free.

  // Changes nothing OBSERVABLE — break-tested, not assumed: inverting this line (identical object
  // reporting "changed") leaves the full test suite green, because `pushClassStyle`'s own
  // `isAlreadyPublished` catches the republish downstream via `sharedStylePair`'s memoization.
  if (next === standing) return isStyleRecord(next);
  if (!isStyleRecord(next) || !isStyleRecord(standing)) return false;
  const keys = Object.keys(next);
  if (keys.length !== Object.keys(standing).length) return false;
  for (const key of keys) {
    const value = next[key];
    if (value === undefined || isStyleRecord(value) || Array.isArray(value)) {
      return false;
    }
    if (!Object.is(value, standing[key])) return false;
  }
  return true;
}

function contributesNothing(slot: unknown): boolean {
  return slot === undefined || slot === EMPTY_STYLE;
}

// Does this node have a style at all? Read through the same two resolvers as the publication, for
// the reason the guard below states: guard and publication disagreeing is a silent wrong screen.
function hasNothingToPublish(parts: IClassStyleParts): boolean {
  return (
    parts.hiddenStyle === undefined &&
    contributesNothing(baseStyleOf(parts)) &&
    contributesNothing(explicitStyleOf(parts))
  );
}

function isAlreadyPublished(parts: IClassStyleParts): boolean {
  const published = parts.published;
  if (published === undefined) return false;
  // The delete is already standing. Asked before the slot comparisons because an empty array would
  // otherwise pass both of them on `undefined` and then fail the length check, republishing a
  // delete the host already performed.
  if (published.length === 0) return hasNothingToPublish(parts);
  // `baseStyleOf`, not `parts.classStyle` — the guard and the publication must read slot 0 the
  // same way or a press is turned away as already-published and silently does nothing on device
  // while the behavior fires correctly and nothing goes red.
  if (!Object.is(published[0], baseStyleOf(parts))) return false;
  // Through the resolver for the same reason as slot 0 above: guard and publication must agree, or
  // a press is turned away as already-published and does nothing on device with nothing red.
  if (!Object.is(published[1], explicitStyleOf(parts))) return false;
  return parts.hiddenStyle === undefined
    ? published.length === 2
    : published.length === 3 && Object.is(published[2], parts.hiddenStyle);
}

function pushClassStyle(node: ISymbioteNode, parts: IClassStyleParts): void {
  // An unchanged class still reaches this write — Solid has no diff, so a list-wide signal
  // re-pushes every row's class and dirties the whole tree. Guard keys off `published`, which
  // setNativeProps clears, so an imperative restore still re-publishes correctly.
  if (isAlreadyPublished(parts)) return;
  // Emits NO_VALUE rather than `[undefined, undefined]` — the host skips a real array with one
  // pointer check instead of building and diffing a `folly::dynamic`. Same published-marker guard
  // as above keeps the restore path working after setNativeProps clears it.
  if (hasNothingToPublish(parts)) {
    parts.published = PUBLISHED_NOTHING;
    setProp(node, 'style', undefined);
    return;
  }
  // Third slot only appended while hidden — a permanent 3-element array would add an allocation
  // to every style write for a state most nodes never enter.
  const base = baseStyleOf(parts);
  const explicit = explicitStyleOf(parts);
  const published =
    parts.hiddenStyle === undefined
      ? (sharedStylePair(base, explicit) ?? [base, explicit])
      : [base, explicit, parts.hiddenStyle];
  parts.published = published;
  setProp(node, 'style', published);
}

// `display: 'none'` is a real RN style value (Yoga's DisplayNone), so a hidden node keeps its
// place in the tree, its state and its children — it just stops laying out and painting.
const HIDDEN_STYLE = { display: 'none' } as const;

// Stop a node painting without unmounting it, or let it paint again — the seam React's
// Activity/Suspense reach for through hideInstance/unhideInstance. Lives in the engine, not an
// adapter, since restoring the author's style byte belongs to whoever owns the style merge.
export function setNodeHidden(node: ISymbioteNode, hidden: boolean): void {
  const parts = stylePartsOf(node);
  parts.hiddenStyle = hidden ? HIDDEN_STYLE : undefined;
  pushClassStyle(node, parts);
}

// Put a node into (or out of) its pressed state, so `:active` rules apply. The engine-owned half:
// press state resolves below the framework, which is what lets a pressable stay an intrinsic tag
// instead of a component — a component is forced only when the template must read the state.

// Costs nothing when no `:active` rule is registered: resolveActiveClassName hands back the same
// object the unpressed path returns, so isAlreadyPublished turns the re-push away.
export function setNodePressed(node: ISymbioteNode, pressed: boolean): void {
  const parts = stylePartsOf(node);
  parts.isPressed = pressed;
  pushClassStyle(node, parts);
}

// Tell the host a behavior's FEEDBACK is showing — TouchableHighlight's underlay, and only that.
// Deliberately not the same bit as setNodePressed: this drives a rule living in C++
// (foldTouchableHighlightUnderlay), crossing as one op, since `shown` lags `pressed` by a timer.

// No style computed here at all: the two props the rule reads (underlayColor, activeOpacity) are
// ones the engine already strips from the payload, so their defaults live in one place.
export function setNodeUnderlayShown(
  node: ISymbioteNode,
  shown: boolean,
): void {
  recordSetUnderlayShown(node, shown);
}

// Forget what was last published, so the next pushClassStyle cannot be turned away. The one
// caller is setNativeProps, which writes the style slot past this file. A no-op for a node nobody
// has styled — that's why this isn't `stylePartsOf(node).published = undefined`.
export function clearPublishedStyle(node: ISymbioteNode): void {
  if (node.styleParts !== undefined) node.styleParts.published = undefined;
}

// The explicit (non-class) style half — an adapter that builds style key-by-key (Angular's
// ɵɵstyleProp/setStyle) merges onto this, not node.props.style directly, which may hold the
// [classStyle, explicitStyle] pair pushClassStyle publishes.
export function getExplicitStyle(node: ISymbioteNode): unknown {
  return node.styleParts?.explicitStyle;
}

// The `[classStyle, explicitStyle]` pair the node currently publishes, same order pushClassStyle
// writes, so flattenStyle collapses it the way Fabric will.

// For a caller that wants the merged answer without a host: the pair reaches the payload as an op,
// and only a host holds ops — core/css-parser reads it here instead of reaching into styleParts.
export function getPublishedStyle(node: ISymbioteNode): readonly unknown[] {
  const parts = node.styleParts;
  if (parts === undefined) return [];
  return [parts.classStyle, parts.explicitStyle];
}

const CLASS_PROP_KEYS: ReadonlySet<string> = new Set(['class', 'className']);

// Flat-bag split (React/Vue/Solid): `onX` becomes a listener only when the component's ViewConfig
// declares `x` as an event — otherwise it's a plain prop, so `onTintColor` on a Switch (whose only
// event is `change`) routes to setProp and reaches Fabric untouched.

// `id` is RN's alias for `nativeID` and wins when both are set (View.js: `nativeID = id`). No
// ViewConfig declares raw `id`, so Fabric drops it — a half-working rename loses nativeID with
// nothing red anywhere.
const ID_ALIAS_FROM = 'id';
const ID_ALIAS_TO = 'nativeID';

// The ONE place this rename happens: HERE because every adapter's prop write ends at routeProp,
// whatever shape it starts in — a bag fold can't serve the per-key renderers and a per-key fold
// can't serve the bag ones, but the seam they share can serve both.

// Precedence needs state because upstream decides `id ?? nativeID` in one expression; a per-key
// writer never sees both, so unmemoized precedence would fall out of write order instead. The
// authored nativeID is remembered, so clearing `id` hands the slot back rather than latching.

// Precedence is per-component: View.js's `id ?? nativeID` is the default, but
// TouchableWithoutFeedback's clone unconditionally overwrites nativeID with the authored value
// when set. `node.nativeIdWinsOverId`, set for the one behavior that declares it, flips the winner.
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

export function routeProp(
  node: ISymbioteNode,
  key: string,
  value: unknown,
): void {
  if (REACT_JSX_DEV_PROPS.has(key)) return;
  // Prop twin of the child redirect in `appendChild` — a composed primitive's owner receives props
  // that belong to its internal slot (`contentContainerStyle` on ScrollView styles the content
  // view), same reason the owner is named for a child: that's where the app wrote it.

  // Gated on the field, so a node with no slot pays one load+branch and never touches the registry.
  // The redirect recurses into the slot's own routeProp, single-hop by construction — a slot has no
  // slot of its own (`childHost` is documented single-hop).
  if (node.childHost !== undefined) {
    const slotKey = slotPropNameFor(node, key);
    if (slotKey !== undefined) {
      // A class name is a legal spelling of `contentContainerStyle`, so a string must land on the
      // slot as `class`, not `style` — renamed verbatim it would publish a style holding a string,
      // dropped with nothing red. React's wrapper resolves the name itself; this only matters here.
      const slotValueFor = node.hostBehavior?.slotValueFor;
      routeProp(
        node.childHost,
        slotKey === 'style' && typeof value === 'string' ? 'class' : slotKey,
        slotValueFor === undefined ? value : slotValueFor(slotKey, value),
      );
      return;
    }
  }
  // After the slot redirect on purpose: a composed primitive forwards most of its bag to an
  // internal node (ImageBackground spreads everything but `style` onto its image), so an `id` on
  // the owner belongs there. Resolved earlier, nativeID would land on the wrapper unseen.
  if (key === ID_ALIAS_FROM || key === ID_ALIAS_TO) {
    routeIdAlias(node, key, value);
    return;
  }
  // An AnimatedNode in a prop (`style={{opacity: value}}`) resolves here to the value to publish,
  // the engine holding the subscription. Returns its input by identity when nothing is animated,
  // so every branch below is unchanged (animated/host-binding.ts).

  // After the slot redirect, so an animated `contentContainerStyle` binds on the node that
  // actually carries the style.
  const resolved = hasAnimatedNodes()
    ? bindAnimatedValue(node, key, value)
    : value;
  if (CLASS_PROP_KEYS.has(key)) {
    const parts = stylePartsOf(node);
    // Canonicalised HERE so the stored value is what everything downstream keys on: an all-string
    // array becomes one string, and then the pressed variant and isAlreadyPublished work on it
    // exactly as on an authored string. One `typeof` for the common case.
    parts.className = canonicalClassName(
      isClassNameValue(resolved) ? resolved : undefined,
    );
    parts.classStyle = resolveClassName(parts.className);
    pushClassStyle(node, parts);
    return;
  }
  if (key === 'style') {
    const parts = stylePartsOf(node);
    // A function `style` (`style={({pressed}) => …}`) arrives here intact and is resolved at both
    // states — writing `style` + `activeStyle` as an explicit pair, cheaper by one call per
    // recompute than the app doing it by hand.

    // Without this the failure is silent: a function isn't an `on*` name, misses setEventListener,
    // lands in setProp as a function value, and fabricProps drops function props — the node commits
    // with no style at all.

    // The callback must be pure in `pressed` — read once per state, here and under every
    // transform's emission (core/components/src/state-style.ts carries the same contract).
    if (isStyleCallback(resolved)) {
      parts.explicitStyle = resolved({ pressed: false });
      parts.activeStyle = resolved({ pressed: true });
      parts.activeStyleFromCallback = true;
    } else {
      // A rebuilt literal equal to what is standing is not a change — see `isSameShallowStyle`.

      // Gated on something being published, which keeps the restore path intact: a setNativeProps
      // write clears `parts.published`, and after that this must never turn a write away — the
      // re-push IS the restore, same mechanism isAlreadyPublished relies on.

      // Gated on the previous write not coming from a callback, since that one owns
      // `parts.activeStyle` and this branch must clear it — returning early would leave the old
      // pressed look standing under a plain style.
      if (
        parts.published !== undefined &&
        !parts.activeStyleFromCallback &&
        isSameShallowStyle(resolved, parts.explicitStyle)
      ) {
        return;
      }
      parts.explicitStyle = resolved;
      // Only a variant WE derived is stale now. `style` switching from a callback to a plain value
      // must not leave the old pressed look standing, and an AUTHORED `activeStyle` must survive a
      // `style` write, because the two arrive as independent props in an unspecified order.
      if (parts.activeStyleFromCallback) {
        parts.activeStyle = undefined;
        parts.activeStyleFromCallback = false;
      }
    }
    pushClassStyle(node, parts);
    return;
  }
  // Ours, never Fabric's — it is consumed here and must not reach the payload, or every pressable
  // in the app carries an unknown key to native.
  if (key === 'activeStyle') {
    const parts = stylePartsOf(node);
    parts.activeStyle = resolved;
    // Slot 1 is no longer ours — whatever a callback derived has just been replaced. Without this
    // the flag outlives its value: this branch overwrites the slot silently and a later plain
    // `style` clears a variant the engine never derived, a sequence a flat-bag adapter can deliver.
    parts.activeStyleFromCallback = false;
    pushClassStyle(node, parts);
    return;
  }
  // RN's snapshot affordance (Pressable.js seeds usePressState with it): render the control
  // pressed with no gesture. Selects activeStyle and any `:active` class — exactly what isPressed
  // already decides, so it belongs beside activeStyle rather than in a behavior.

  // Here rather than in attachAfterCommit: a behavior hook reading this prop costs a post-commit
  // crossing per pressable node (budgeted in crossing-and-payload-census.probe.test.tsx). This
  // branch is one string compare on the first commit — no crossing at all.

  // TouchableHighlight's half of the same prop paints an underlay, so it's a separate rule in
  // SymbioteFabricProps.cpp — a side effect AND a passthrough. Returning early here left that rule
  // blind; keeping it out of the payload is kPressableMachineKeys's job, done separately.

  // Same shape GATED_EVENT_PROPS uses above: act, then let the write continue.
  if (key === 'testOnly_pressed') setNodePressed(node, resolved === true);
  if (isOnEventName(key)) {
    // A native-driven `Animated.event` needs the native module as well as the listener map, and
    // registers under the PROP name — see `bindAnimatedEvent`, which no-ops for anything else.
    if (hasAnimatedNodes()) bindAnimatedEvent(node, key, resolved);
    const name = listenerName(key);
    const isRegisteredEvent =
      RESPONDER_EVENTS.has(name) || isEventFor(node.component, name);
    // RNS* views derive events from react-native-screens' own codegen ViewConfig, so an
    // unregistered event falls through to setProp as a dead prop Fabric ignores — indistinguishable
    // from "the button did nothing" at the UI. Scoped to RNS* to avoid noise; gated behind DEBUG.
    if (node.component.startsWith('RNS')) {
      dlog(
        `routeProp: ${node.component} "${key}" -> listener "${name}" ` +
          `registered=${isRegisteredEvent} at t=${Date.now()}`,
      );
    }
    if (isRegisteredEvent) {
      setEventListener(node, name, resolved);
      return;
    }
  }
  setProp(node, key, resolved);
}

// Counted in propStats — a text write IS a prop write, reaching Fabric as RCTRawText's only prop.

// Unguarded, same reason setProp is: comparing against the standing text means reading it back
// from the host, which holds it locally and dedupes there — including empty-string child-list
// transitions and reparenting under `<Text>` (RCTVirtualText vs RCTText).
export function setText(node: ISymbioteNode, text: string): void {
  propStats.writes += 1;
  recordSetText(node, text);
}

// Structural ops: each is one op and nothing else — the host detaches a child from whatever
// parent it currently has before linking it, true even when an adapter names a stale one (a MOVE
// spells as remove-then-insert). JS doesn't track the old parent and doesn't need to.

// What JS still decides is which node an op names — two redirects, a composed primitive's slot and
// a wrap claim, both read off a field so a plain node pays one load and one branch per op.

// The host's raw answer, surface INCLUDED — unlike `parentOf` (host-access.ts), which reports a
// top-level node as parentless by design. The two swaps below have to NAME the holder in an op, and
// for a wrapped node sitting directly under a surface that holder is the surface node.
function holderOf(node: ISymbioteNode): ISymbioteNode | undefined {
  flushOps();
  const parent = treeHost()?.parentOf(node);
  return isSymbioteNode(parent) ? parent : undefined;
}

// Which node a child actually lands on. See `ISymbioteNode.childHost`: the adapter always names the
// OWNER, and a node whose behavior built an internal subtree redirects the app's children into it —
// unless the behavior CLAIMS this particular child, which keeps it on the owner (`claimedChildren`).

// SINGLE HOP, not a loop, and the field's own comment says why — a chain would put a walk on the
// engine's hottest path to express a depth no primitive has. A behavior needing depth points
// `childHost` at the innermost node itself.

// Reads a field undefined on every node with no composed primitive — one load, one branch.
// Deliberately not behind hasHostBehaviors() (a second read for nothing); the claim check sits
// behind that branch, so only a slot-bearing node pays the registry probe.
function hostFor(parent: ISymbioteNode, child: ISymbioteNode): ISymbioteNode {
  const slot = parent.childHost;
  if (slot === undefined) return parent;
  // A slot that is a built SIBLING rather than a container — ImageBackground's absolutely-filled
  // image — keeps the app's children on the owner. See `IHostBehavior.slotTakesNoChildren`.
  if (!slotTakesChildren(parent)) return parent;
  return claimModeFor(parent, child.component) === undefined ? slot : parent;
}

// The node a child must be inserted before, or `undefined` for an ordinary append.

// A host that still has a slot is an owner taking a claimed child, which goes before the slot
// whatever the framework asked — RN renders `{refreshControl}{content}` in that order, and
// `beforeChild` lives inside the slot anyway.

// A sibling slot is the opposite: RN paints the background image first and children over it
// (ImageBackground.js), so they append past it rather than in front — what `undefined` leaves
// alone.
function slotAnchorOf(host: ISymbioteNode): ISymbioteNode | undefined {
  const slot = host.childHost;
  if (slot === undefined || !slotTakesChildren(host)) return undefined;
  return slot;
}

// ── the two structural recorders, and why nothing here calls the raw ones ───────────────────────

// `mayHaveChildren` is only sound if every op that gives a node a child raises it — raised here
// rather than at each of the five call sites, since a forgotten one would make childrenOf answer
// "empty" for a node that has children: a wrong answer, not a slow one.

// Arm a parent's recurring post-commit hook for a STRUCTURAL change, not just a prop write: the
// ScrollView sticky-header machine drops a wrapper when the framework takes the wrapped child
// away, writing no prop on the wrapper's owner at all — narrowing the beat to props left it stuck.
function armCommitHookForChildChange(parent: ISymbioteNode): void {
  if (parent.hasCommitHook) noteCommitHookNodeChanged(parent);
}

function recordAppendInto(parent: ISymbioteNode, child: ISymbioteNode): void {
  parent.mayHaveChildren = true;
  armCommitHookForChildChange(parent);
  recordAppendChild(parent, child);
}

function recordInsertInto(
  parent: ISymbioteNode,
  child: ISymbioteNode,
  beforeChild: ISymbioteNode,
): void {
  parent.mayHaveChildren = true;
  armCommitHookForChildChange(parent);
  recordInsertBefore(parent, child, beforeChild);
}

// What actually occupies this node's place in its parent's child list. See `ISymbioteNode.wrapper`:
// a wrapped owner is what the adapter names and the wrapper is what the tree holds, so every
// structural op takes the owner and moves the wrapper.
function placedNode(node: ISymbioteNode): ISymbioteNode {
  return node.wrapper ?? node;
}

// Make `child` the owner's parent, in place. Returns false when this is not a wrap claim, so the
// two inserts fall through to the ordinary path on one call.

// The owner being unattached is the normal case: every adapter fills a node's children before
// appending it to its own parent, so the wrap usually happens with no holder yet and only the
// second op runs — the later appendChild(root, owner) inserts the wrapper via placedNode.
function wrapsOwner(owner: ISymbioteNode, child: ISymbioteNode): boolean {
  if (owner.childHost === undefined) return false;
  if (claimModeFor(owner, child.component) !== 'wrap') return false;
  if (hasHostBehaviors()) reattachHostBehaviors(child);
  if (hasAnimatedBindings()) reattachAnimatedProps(child);
  const holder = holderOf(owner);
  // Wrapper takes the owner's place first, then the owner moves under it — the host's own detach
  // on link is what unlinks the owner from `holder`, so no removal op is needed.
  if (holder !== undefined) recordInsertInto(holder, child, owner);
  owner.wrapper = child;
  recordAppendInto(child, owner);
  return true;
}

// Put the owner back where its wrapper stood — the mirror of `wrapsOwner`. It must leave the owner
// ATTACHED: the framework is removing the RefreshControl, not the ScrollView.
function unwrapsOwner(owner: ISymbioteNode, child: ISymbioteNode): boolean {
  if (owner.wrapper !== child) return false;
  owner.wrapper = undefined;
  const holder = holderOf(child);
  if (holder === undefined) {
    // The wrapper never reached a parent, so there is no place to take back — the owner simply
    // stops hanging off it.
    recordRemoveChild(child, owner);
  } else {
    recordInsertInto(holder, owner, child);
    recordRemoveChild(holder, child);
  }
  return true;
}

export function appendChild(
  requestedParent: ISymbioteNode,
  child: ISymbioteNode,
): void {
  if (wrapsOwner(requestedParent, child)) return;
  const parent = hostFor(requestedParent, child);
  // A node the sweep tore down can be put back — Svelte parks live subtrees offscreen across
  // commits. A WeakSet miss for anything freshly built, so the create path pays nothing.
  if (hasHostBehaviors()) reattachHostBehaviors(child);
  if (hasAnimatedBindings()) reattachAnimatedProps(child);
  const placed = placedNode(child);
  const anchor = slotAnchorOf(parent);
  if (anchor === undefined) recordAppendInto(parent, placed);
  else recordInsertInto(parent, placed, anchor);
  if (hasHostBehaviors()) notifyChildInserted(parent, placed);
}

// No anchor means append, and it's a real case, not a defensive guard: solid-js/universal spells
// "insert at end" as `insertNode(parent, node, null)`, and Vue passes `anchor` through as `null`.
// A slot has to name a node, so an unanchored insert IS an append and is recorded as one.
export function insertBefore(
  requestedParent: ISymbioteNode,
  child: ISymbioteNode,
  beforeChild: ISymbioteNode | null | undefined,
): void {
  if (wrapsOwner(requestedParent, child)) return;
  const parent = hostFor(requestedParent, child);
  if (hasHostBehaviors()) reattachHostBehaviors(child);
  if (hasAnimatedBindings()) reattachAnimatedProps(child);
  const placed = placedNode(child);
  const anchor =
    slotAnchorOf(parent) ??
    (beforeChild === null || beforeChild === undefined
      ? undefined
      : placedNode(beforeChild));
  if (anchor === undefined) recordAppendInto(parent, placed);
  else recordInsertInto(parent, placed, anchor);
  if (hasHostBehaviors()) notifyChildInserted(parent, placed);
}

// Removal only NOMINATES a behavior for teardown; the commit sweep decides. A framework may spell
// a move as remove-then-reinsert (Solid does), so tearing down here kills the machine of a node
// that comes back alive in the same batch — see host-behavior.ts's markDetachCandidate.
export function removeChild(
  requestedParent: ISymbioteNode,
  child: ISymbioteNode,
): void {
  // A wrap claim leaving: the owner takes its own place back and stays in the tree. Nominated for
  // teardown like any other removed node, because the wrapper IS leaving.
  if (unwrapsOwner(requestedParent, child)) {
    if (hasAttachedBehaviors() || hasAnimatedBindings())
      markDetachCandidate(child);
    return;
  }
  // A slot that IS the child being removed stops being one. Only a behavior that adopts an app
  // child as its slot reaches this; without the clear, hostFor below redirects the removal into
  // the node being removed, and the next child appended nests inside the orphan.
  if (requestedParent.childHost === child)
    requestedParent.childHost = undefined;
  // Redirected for the same reason the two inserts are: the adapter removes from the node it
  // appended to, which is the OWNER, while the child actually lives in the slot.
  const parent = hostFor(requestedParent, child);
  // hasAttachedBehaviors, not hasHostBehaviors: the latter is on from module load in every app just
  // from registering Pressable as a type. Nominating a candidate crosses every removed node into JS
  // on the commit sweep, which can't matter before a behavior has actually attached to anything.
  if (hasAttachedBehaviors() || hasAnimatedBindings())
    markDetachCandidate(child);
  // BOTH, and the owner is the one that matters: a composed primitive's behavior lives on the node
  // the adapter named, while `hostFor` redirects the mutation into its internal slot. Arming only
  // the slot arms a node that has no behavior at all.
  armCommitHookForChildChange(requestedParent);
  armCommitHookForChildChange(parent);
  recordRemoveChild(parent, placedNode(child));
}

// Re-exported from its own module so the census keeps ONE public spelling: it moved to `tree-host.ts`
// with the tree it describes, and every caller has always imported it from here.
export type { ITreeCensus } from './tree-host';

// A structural census of the tree the HOST holds — see ITreeCensus (tree-host.ts). Walks nothing
// here: the walk needs props.text and a child list, which JS has neither. `undefined` from
// treeHost() means nothing installed, so the empty census can't be mistaken for a real zero.
export function censusRetainedTree(
  roots: readonly ISymbioteNode[],
): ITreeCensus {
  flushOps();
  return treeHost()?.census(roots) ?? EMPTY_CENSUS;
}
