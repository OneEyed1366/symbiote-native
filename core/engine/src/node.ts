// The mutation API. Adapters call it; every call appends an OPCODE to `mutation-buffer.ts` and
// nothing else. There is no tree here — no parent, no children, no props, no mirror. Turning the
// buffer into a tree is the HOST's job (`tree-host.ts`): native on device, the TypeScript applier in
// `@symbiote-native/test-utils` headlessly.
//
// What a node still legitimately owns is what the framework, not Fabric, put on it: the Fabric view
// name it was created as, whether it is a text container, its JS listener map, the declarative
// class/style halves the engine merges, and the two bookkeeping flags. An ADDRESS plus the state
// that never crosses.

import type {
  IMeasureOnSuccess,
  IMeasureInWindowOnSuccess,
  IMeasureLayoutOnSuccess,
} from './fabric';
import { isAriaAliasKey } from './accessibility-props';
import {
  recordAppendChild,
  recordCreateAnchor,
  recordCreateElement,
  recordCreateRawText,
  recordInsertBefore,
  recordRemoveChild,
  recordSetComponent,
  recordSetProp,
  recordSetText,
} from './mutation-buffer';
import { isEventFor } from './view-config';
import {
  canonicalClassName,
  isClassNameValue,
  resolveActiveClassName,
  resolveClassName,
  type IClassNameValue,
} from './style-registry';
import { dlog } from './debug';
import {
  attachHostBehavior,
  hasHostBehaviors,
  markDetachCandidate,
  ownsListener,
  reattachHostBehaviors,
  stashAppListener,
  type IPayloadFold,
} from './host-behavior';
import { configPayloadFold } from './registry';
import { resolveStructuredStyle } from './structured-style';
// A cycle, deliberately: `imperative.ts` imports this module for the node shape, and the prototype
// methods below call back into it. Neither side touches the other at module-evaluation time - only
// inside a function body - so every loader (tsc, vitest, Metro) resolves it fine. The alternative
// was a load-time `SymbioteNode.prototype.measure = ...` installed from elsewhere, which is exactly
// the registration-side-effect shape Metro's inlineRequires silently drops in release builds (see
// CLAUDE.md, "Never make correctness depend on a module's load-time side effect").
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
  //
  // NOT readonly, and only `setNodeComponent` may write it. A primitive whose native view depends
  // on a prop (`TextInput`'s `multiline`) has to be able to change view without changing IDENTITY —
  // an app's ref, the host behavior and the children all stay attached to this object while the
  // native side is rebuilt underneath. That is the browser's own semantics for `<input type>`:
  // the element survives, its internal representation does not.
  component: string;
  // A text container: its descendants render as virtual text spans.
  readonly isText: boolean;
  listeners: Map<string, IListener> | undefined;
  // `props`, `children`, `parent`, `tid` and the dirty flags were all here and are all GONE. A node
  // carries an ADDRESS: the host holds the props and the structure, and every question about either
  // is a read through `tree-host.ts`. The buffer is what tells the host; nothing here mirrors it.

  // "A `role` or `aria-*` key has been written here at least once." The gate for the aria fold
  // (`accessibility-props.ts`), which `fabricProps` runs on the way to the payload so a LOWERED
  // element gets it too - it has no component wrapper to run it in.
  //
  // A FIELD rather than the fold's own 15-property probe, because the probe is per COMPONENT
  // INSTANCE where this is per NODE PER BUILD: ~9 000 nodes on a create, 135 000 property reads to
  // discover that almost none of them carry an alias. One boolean read instead, written at most
  // once per prop write.
  //
  // STICKY on purpose - never cleared. Deleting the last alias leaves it true, the fold runs and
  // returns its input by identity. Monotone, so no invalidation bug is expressible; the cost of a
  // stale `true` is one identity-returning call on a node that once had an alias.
  hasAriaAlias: boolean;
  // The payload fold this node's host behavior supplied, or undefined for the ~all of them that
  // have none. Set once at `createElement`, never per write, and read by `fabricProps` at the one
  // point where the whole bag is known.
  //
  // WHY IT HANGS OFF THE BEHAVIOR AND NOT OFF `node.component`, which is how the aria and
  // value->text folds next to it are keyed. A wrapper and its lowered twin commit the SAME Fabric
  // view name — `RCTSinglelineTextInputView` for both `symbiote-text-input` and
  // `symbiote-text-input-managed` — so a fold keyed on the component name runs on both, and the
  // wrapper has already folded in its own body. Double-folding is the hazard. A behavior attaches
  // to the LOWERED tag alone, so it is the discriminator that already exists.
  payloadFold: IPayloadFold | undefined;
  // The declarative halves of this node's style — see IClassStyleParts and commitClassStyle below.
  // `undefined` until the node's first class/style write, so a node nobody styles carries a slot
  // and nothing more.
  //
  // Here for the same reason `committed` is, and the second time that move has paid: it was a
  // `WeakMap<ISymbioteNode, IClassStyleParts>` plus a `{ ...prev, ...patch }` spread, so every
  // class or style write cost a patch literal, a spread object, a hash get and a hash set. At
  // 56 000 prop writes on a 4 000-row create that made commitClassStyle the largest non-GC frame
  // in the profile (9.3 ms) and a large share of the 22% spent in GC. Written in place now.
  //
  // ENGINE-OWNED. An adapter reads and writes style through routeProp, never through this field.
  styleParts: IClassStyleParts | undefined;

  // RN's ReactFabricHostComponent surface - what a template/function ref hands back and what
  // reanimated / gesture-handler / react-navigation reach through. Each resolves the node's
  // CURRENT committed handle at call time, so a clone-on-write commit between calls is
  // transparent, and each degrades to a silent no-op (dlog + return) before the first commit.
  //
  // They are PROTOTYPE methods on every node rather than closures grafted per node, and that is a
  // measured decision, not a style one. toPublicInstance used to Object.assign six closures onto
  // each node; on a 1 000-row benchmark press that is 54 000 closures plus 9 000 discarded object
  // literals, each closure pinning its own context alive - and after the Vue lowering landed, GC
  // was 30% of the create window and the single biggest bucket in the profile. A prototype costs
  // one object for the whole process. Vue, Solid and Svelte all grafted eagerly and all pay this;
  // React grafts lazily in getPublicInstance and never did.
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
}

const FOCUS_COMMAND = 'focus';
const BLUR_COMMAND = 'blur';

// The one shape every retained node has. A class, not an object literal, for two reasons: the six
// imperative methods live on the shared prototype instead of being allocated per node (see
// ISymbioteNode above), and both factories below mint the same hidden class.
//
// Fields are `declare`d and assigned in the constructor rather than written as class fields: with
// ES2022 field semantics the two are equivalent in meaning but not in emit, and a plain
// constructor assignment is the shape every engine (V8 and Hermes both) handles without a
// define-per-field.
class SymbioteNode implements ISymbioteNode {
  declare readonly [BRAND]: true;
  declare component: string;
  declare readonly isText: boolean;
  declare listeners: Map<string, IListener> | undefined;
  declare hasAriaAlias: boolean;
  declare styleParts: IClassStyleParts | undefined;
  declare payloadFold: IPayloadFold | undefined;

  constructor(component: string, isText: boolean) {
    this[BRAND] = true;
    this.component = component;
    this.isText = isText;
    this.listeners = undefined;
    // Assigned here, not lazily on first use: every slot present from the constructor keeps one
    // hidden class for every node. Adding it on demand buys a shape transition per aria-bearing
    // node, which is the opposite of what this field is for.
    //
    // Starts false, and that is COMPLETE rather than optimistic: a node is minted with no props at
    // all — `createRawText`'s text is an OP, not a field — so no aria key can arrive here.
    this.hasAriaAlias = false;
    this.styleParts = undefined;
    // Assigned here for the same hidden-class reason as `hasAriaAlias` above; `attachHostBehavior`
    // overwrites it a few lines later for the rare node that has a behavior.
    this.payloadFold = undefined;
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
}

// The committed record — handle, tag, rootTag — is the host's to keep, and `committedRecordOf`
// (tree-host.ts) is how the imperative APIs ask for it. `IMirror` and `IContribution` were the JS
// re-implementations of `ShadowNode` and of the one thing `ShadowNode` cannot hold, an anchor. Both
// are gone with the tree; the host answers about both.
//
// The identity check `committedOf` used to make is gone with them, and it was worth something: a Vue
// `reactive()` / deep-`ref()` Proxy around a host element forwards a field read to its target, so a
// wrapped node used to hand back a real record. It cannot now — the host keys on the handle OBJECT,
// so a Proxy misses and every imperative call degrades to its "node not committed" log, which is
// the WeakMap's old behaviour restored. Hold host nodes with `shallowRef` (vue-adapter-reactivity).

/**
 * Mint an element and record its creation.
 *
 * The node object IS the handle: it is what the ops address, what the host attaches its native node
 * to, and what Fabric hands back as an event target. Nothing else is allocated.
 */
export function createElement(
  component: string,
  isText = false,
  // The intrinsic tag this node came from, when it differs from the Fabric view name above. The
  // behavior registry is keyed by tag and the node only ever carries the resolved name, so an
  // adapter lowering `<Pressable>` has to hand the tag over here or the registration cannot fire
  // (host-behavior.ts, `attached`). Nothing is stored — the lookup happens once, right below.
  tag: string = component,
): ISymbioteNode {
  const node = new SymbioteNode(component, isText);
  // `instanceHandle` is the node itself: it round-trips through Fabric unchanged and comes back as
  // the event target, and the BRAND below is how the event handler confirms it is one of ours.
  recordCreateElement(node, component, isText, node);
  // Gated on the boolean, not on the Map: this runs ~9 000 times per benchmark create, and an app
  // that registers nothing must pay one boolean read rather than a hash lookup per node.
  if (hasHostBehaviors()) attachHostBehavior(node, tag);
  // A third-party view's own ViewConfig processors, as a fold. AFTER the behavior's, because that
  // is the order the reference ran them in — the behavior rewrites the wrapper-body props, and
  // `validAttributes[*].process` then converts what it produced. Composed rather than replaced:
  // one component can legitimately have both.
  //
  // Costs a `Set.has` per node for a built-in, which is where `resolve` bails, and nothing else:
  // the answer is cached per component name, not computed per node.
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

export function createRawText(text: string): ISymbioteNode {
  const node = new SymbioteNode(RAW_TEXT_COMPONENT, false);
  recordCreateRawText(node, text);
  return node;
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
  const node = new SymbioteNode(ANCHOR_COMPONENT, false);
  recordCreateAnchor(node);
  return node;
}

/**
 * The sentinel a SURFACE's own root node carries, so `parentOf` can stop there.
 *
 * A top-level node must answer `undefined` for its parent, and adapters depend on the exact miss:
 * Angular reads `null` as "defer, `<ng-content>` will place this" (answering the surface once
 * mounted every FlatList cell at top level), while Vue and Solid spell `?? surface` at their call
 * sites and would be handed an object that is not the `SymbioteSurface` they compare against. One
 * component name, read in JS, keeps all three right without a second structure.
 *
 * It is a JS-side name only. What goes over the wire is `RCTView`, because this node is REAL.
 */
export const SURFACE_COMPONENT = '#surface';

/**
 * One persistent root view per surface, mirroring RN's own AppContainer — `renderApplication` wraps
 * the app in `<View style={{flex:1}} pointerEvents="box-none">`.
 *
 * It is not decoration. Without `flex: 1` a non-flex root collapses to content height, and without
 * `box-none` a touch landing outside the app's own children has no escape. Living here rather than
 * in each adapter's `mount()` gives every framework a full-screen root for free and keeps layout in
 * the shared layer (`<adapters_stay_thin>`).
 *
 * The surface therefore commits as ONE node rather than hoisting its children into the child set —
 * which is why the host materializes the node `OP_COMMIT` names instead of walking its children. An
 * anchor in that position still hoists, so the host handles both without a special case.
 */
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

// `isEmptyRawText` was here and is GONE: it read `node.props.text`, which JS no longer holds. The
// rule it expressed — a raw text with no characters must not reach Fabric, because
// AttributedString::appendFragment drops the fragment while the text walk has already flagged "the
// last child was raw text", so the NEXT raw sibling merges into `fragments.back()` of an empty
// vector and the process aborts — is now the host's, applied where the child set is built.

// Dirty-marking is GONE, along with the walk it existed to skip. An op names the node it changed,
// so the host marks exactly that node and its own ancestors; nothing on this side has to guess.
// Listener changes still record nothing, for the reason they always did: `node.listeners` never
// reaches Fabric, and the one listener that DOES change a Fabric prop, `layout`, raises `onLayout`
// through `setProp` below.
/**
 * Change which Fabric view a node commits as, keeping the node's identity.
 *
 * The POLICY stays out of the engine: which prop decides, and which view it decides between, lives
 * in `HOST_PRIMITIVES` and is read by `resolveIntrinsicTag` in `@symbiote-native/components`. The
 * engine only knows how to swap the name — the same split every other spec-driven fold has here.
 *
 * A no-op when the name is unchanged, so a renderer may call it on every update without comparing
 * first.
 *
 * The JS field and the op BOTH move, and both are load-bearing. `node.component` is what the aria
 * fold, the behavior registry and `fabricProps` key on; the op is what makes the host re-create the
 * node under the new name, since no prop write moves a node between native views.
 */
export function setNodeComponent(node: ISymbioteNode, component: string): void {
  if (node.component === component) return;
  node.component = component;
  recordSetComponent(node, component);
}

// `isSkippedAtCommit`, `markPresenceIfFlipped`, `markDirty`, `markPropsDirty`, `markStructureDirty`,
// `markRenderableAncestor`, `markChildOp`, `markChildRemoved` and `markChildAppended` all lived here
// and are all GONE. Every one of them answered a question about a tree — which ancestor went stale,
// whether a node's PRESENCE in its parent's renderable list flipped, which anchor to climb past —
// and the host is the only thing that can answer those now. It marks from the ops themselves.

// How many prop writes an adapter pushed at the engine. Read-and-zeroed through
// readCommitProfile() (tree-host.ts), which prices the layer ABOVE the host.
//
// `noops` used to sit beside it and counted the writes the `Object.is` guard turned away — the
// Angular Pressable bag that pushed 104 000 setProp calls for a screen Solid built in 12 000, 90 000
// of them writing `undefined` over a key that was not there. The guard moved into the host, because
// keeping it here would mean reading the previous value BACK over the wire — ~44 001 reads on a
// 1 000-row create, exactly the crossings this design removes. So the number is no longer visible
// from JS, and it is not faked as a zero it would have to keep re-earning.
//
// Not gated behind isDebug(), for the same reason the commit profile is not: an integer increment
// is noise next to the prop write it counts, and the figure is only meaningful from a release
// build. A per-call dlog was the obvious alternative and is deliberately NOT here - a log line per
// write would measure the logging rather than the code (see the `perf-claims-need-numbers` rule).
const propStats = { writes: 0 };

export function takePropStats(): { writes: number } {
  const snapshot = { writes: propStats.writes };
  propStats.writes = 0;
  return snapshot;
}

// A pure prop set: no event inference. `onTintColor` is a Switch prop and reaches
// Fabric like any other; the event-vs-prop decision is made by routeProp, never by
// the key's name.
//
// `undefined` DELETES the key, which is the collapse this function has always performed and which
// the wire now spells (`NO_VALUE`, mutation-buffer.ts). `null` is NOT the same thing: it is a
// legitimate Fabric value meaning "reset to the default", and a merge-on-clone host has to be able
// to tell a removed key from one that was never there.
//
// THE `Object.is` DEDUPE IS NOT HERE ANY MORE, and that is the one behaviour change in this file.
// It needed the value the node already holds, and JS no longer holds it — reading it back would be
// ~44 001 crossings on a 1 000-row create, which is the cost this whole design exists to remove. The
// guard lives in the host's `OP_SET_PROP` instead, where the previous value is a local field: same
// comparison, same `Object.is` reasoning (a style object or a handler closure is a fresh reference
// on nearly every render, so it simply never fires for them, which is correct because an adapter may
// hand back the SAME reference with mutated contents and identity cannot see that).
export function setProp(
  node: ISymbioteNode,
  key: string,
  value: unknown,
): void {
  // The single choke point for the aria gate. `routeProp`'s other branches — class, style,
  // activeStyle, on* — return before reaching here and none of them can carry an alias, so every
  // `role` / `aria-*` write in the engine passes through this line.
  if (!node.hasAriaAlias && isAriaAliasKey(key)) node.hasAriaAlias = true;
  propStats.writes += 1;
  writeProp(node, key, value);
}

// Function props that never left JS, keyed by node.
//
// A function CANNOT cross this wire. The host stores props as a `folly::dynamic` and
// `jsi::dynamicFromValue` THROWS on a callable — "JS Functions are not convertible to dynamic" —
// so a single function prop kills the whole batch, and with it the commit that carried it.
//
// It has always been unsendable and it used to be unreachable, because `routeProp` diverts every
// REGISTERED `on*` name into the listener stash before this point. Two paths get past that and both
// are real: an unregistered `on*` that is an ordinary prop by design (`onValueChange`, which
// `fabricProps` drops on the way to native and a behavior reads back), and `setNativeProps`, which
// bypasses `routeProp` entirely. Device-found 2026-09-08 through the second: an `Animated.View`
// spread with `panResponder.panHandlers` hands `AnimatedProps.__getValue()` a bag of callbacks, and
// it copies every key it holds.
//
// So they live here, exactly as listeners already do — and `propOf` looks here first, which is what
// keeps `onValueChange` readable. Nothing is lost on the native side: `fabricProps` dropped function
// props on both hosts anyway, so the payload is byte-identical either way.
const functionProps = new WeakMap<ISymbioteNode, Map<string, unknown>>();

/**
 * The one place a prop reaches the wire, and the only place that can keep a function off it.
 *
 * `setNativeProps` calls this rather than `recordSetProp` for that reason — it is the path that has
 * no `routeProp` in front of it.
 */
export function writeProp(
  node: ISymbioteNode,
  key: string,
  value: unknown,
): void {
  // The same strip `routeProp` does, repeated because THIS is the path with no `routeProp` in
  // front of it (`imperative.ts` says so). One filter on the declarative path was never enough:
  // `AnimatedProps` is built from a RAW prop bag and re-sends every key it holds on every frame,
  // so on a JSX adapter `__self` rode straight past the strip into the host. See
  // REACT_JSX_DEV_PROPS for what that costs on each platform.
  if (REACT_JSX_DEV_PROPS.has(key)) return;
  // Resolved on the way IN, for the same reason the strip above lives here: this is where both
  // paths meet. `boxShadow` / `filter` / `transform` and the four beside them are parsed in JS,
  // and the C++ payload builder has no JS — so a value resolved at payload-build time is resolved
  // headless only, and the device commits the raw CSS string, which Fabric drops in silence. See
  // `structured-style.ts`; it hands the same object back when nothing needed resolving, which is
  // what keeps the host's identity guard and `pushClassStyle` working.
  const written =
    key === 'style' || key === 'activeStyle'
      ? resolveStructuredStyle(value)
      : value;
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

// Fabric gates a handful of events behind a BOOLEAN prop: unlike scroll / touch / change, which
// the native component emits unconditionally, these fire only when the shadow node carries the
// flag. RN raises them with an `on*: true` validAttribute; we drop function props from the
// payload, so a gated handler attaches on our side and the native event simply never arrives.
// That is silent - a test asserting the listener is present passes, and only a device shows it.
//
// The list is exhaustive as of react-native 0.86: every `bool on*` field in Fabric's C++ props
// (`ReactCommon/react/renderer/components/**`), each read behind an `if` before the emitter runs:
//
//   BaseViewProps.onLayout                         ParagraphShadowNode.cpp / RCTViewComponentView
//   AccessibilityProps.onAccessibilityTap          RCTViewComponentView.mm:1603
//   AccessibilityProps.onAccessibilityMagicTap     RCTViewComponentView.mm:1613
//   AccessibilityProps.onAccessibilityEscape       RCTViewComponentView.mm:1623
//   AccessibilityProps.onAccessibilityAction       RCTViewComponentView.mm:1633
//   BaseParagraphProps.onTextLayout                ParagraphShadowNode.cpp:351
//
// Keyed by the post-`listenerName` event name, valued with the payload key. `magicTap` maps to
// `onMagicTap` and NOT to the C++ member name `onAccessibilityMagicTap`, because `onMagicTap` is
// what RN's own view config declares (BaseViewConfig.ios.js) - the two disagree upstream, and
// matching stock is the only defensible choice until RN resolves it.
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
/**
 * Install a listener the BEHAVIOR owns, bypassing the ownership check.
 *
 * `setEventListener` diverts an owned name into the stash, which is right for an app listener and
 * circular for the behavior's own dispatcher — it would stash itself and never occupy the slot it
 * exists to hold. This is the one writer allowed past that gate.
 */
export function setBehaviorListener(
  node: ISymbioteNode,
  name: string,
  listener: IListener,
): void {
  (node.listeners ??= new Map()).set(name, listener);
  const flagProp = GATED_EVENT_PROPS.get(name);
  if (flagProp !== undefined) setProp(node, flagProp, true);
}

export function setEventListener(
  node: ISymbioteNode,
  name: string,
  value: unknown,
): void {
  const isHandler = typeof value === 'function';
  // A name a host behavior OWNS never reaches `node.listeners` — the behavior's dispatcher holds
  // that slot and the app's callback is stashed beside it. `node.listeners` is single-slot, so
  // without this the two evict each other and the last writer wins with no diagnostic; and the
  // keys at stake are the ones a gesture STARTS on, so the loser is silently pressless. The
  // component wrapper used to mediate this by destructuring the app's callbacks out before they
  // reached the node; lowering removes the mediator. Gated on the boolean first, so an app with no
  // behavior registered pays one read.
  if (hasHostBehaviors() && ownsListener(node, name)) {
    stashAppListener(node, name, isHandler ? value : undefined);
    const flagged = GATED_EVENT_PROPS.get(name);
    if (flagged !== undefined)
      setProp(node, flagged, isHandler ? true : undefined);
    return;
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
// dynamic" (the instance holds functions) and the surface paints black.
//
// "WHILE IOS SILENTLY DROPS IT" IS WHAT THIS COMMENT USED TO SAY, AND IT IS WRONG. iOS converts
// the same value with `jsi::dynamicFromValue`, whose walk keeps no visited set, and `__self` is a
// module `this` — cyclic. That is not a drop, it is an endless walk inside `applyOps` that never
// returns and allocates as it goes: measured 2026-09-09 on examples/solid, one press on an
// Animated control, RAM to 15 GB and a dead JS thread. Android's loud rejection is the FRIENDLIER
// of the two platforms here.
//
// SFC/template authoring never produces them. Strip them here, once, so no adapter leaks React
// JSX dev metadata to the host, mirroring React's host config.
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
export interface IClassStyleParts {
  classStyle: unknown;
  explicitStyle: unknown;
  // The hide-without-unmount slot, LAST so it wins over both halves, and cleared rather than
  // overwritten so unhiding restores exactly what the author wrote. React's `Activity` (and any
  // future adapter equivalent) needs a node to stop painting while its state and its children
  // stay mounted; RN's own renderer does this by writing `style: {display:'none'}` straight onto
  // the instance, which here would clobber the declarative style and leave nothing to restore
  // from. A third part costs one array slot and makes the operation exactly reversible.
  hiddenStyle: unknown;
  // The authored class value, kept so the PRESSED variant can be resolved on demand. Stored
  // rather than resolved up front because `routeProp`'s class branch runs ~14 000 times on one
  // benchmark create and a press happens once per interaction: paying a second cache lookup per
  // WRITE to serve a state almost no node is ever in is the trade this project keeps refusing.
  className: IClassNameValue | undefined;
  isPressed: boolean;
  // The pressed variant of the EXPLICIT style, supplied by a compiler rather than by the class
  // registry. A functional `style={({pressed}) => …}` is the shape every framework's community
  // writes, and it forces the primitive to stay a COMPONENT because the template reads the press
  // state. Specialising that arrow at both values of `pressed` — a build-time AST substitution,
  // not an evaluation — turns it into two plain objects, and this is where the second one lives.
  // So `:active` is one way to deliver a pressed look and this is the other; the engine does the
  // same thing with both.
  activeStyle: unknown;
  // Whether slot 1's pressed variant came from resolving a FUNCTION `style` here, rather than from
  // an explicit `activeStyle` write by a lowering transform. Only the first kind may be cleared
  // when `style` later arrives as a plain value — clearing the second would break the transform's
  // two-write path, where `style` and `activeStyle` are separate props and either may land first.
  activeStyleFromCallback: boolean;
  // The array `pushClassStyle` last published, or `undefined` when nothing has been published or a
  // bypass invalidated it. It used to be read back out of `node.props.style` — the array IS the
  // record of what was published, so there was nothing to keep in sync — and JS no longer holds
  // `node.props`. Kept here rather than asked of the host because `isAlreadyPublished` runs on every
  // class or style write, ~14 000 times on one benchmark create, which is exactly the rate at which
  // a crossing may not sit.
  //
  // `setNativeProps` CLEARS it, and that is what keeps the restore path alive — see there.
  published: readonly unknown[] | undefined;
}

// All slots are present from the start rather than added as they are written: one hidden class for
// every styled node in the app, instead of a shape transition per slot.
// Narrowed rather than cast: `routeProp` takes `unknown`, and a bare `typeof v === 'function'`
// leaves TS with `Function`, which is callable with anything. This states the shape the contract
// actually promises.
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

// What belongs in slot 0 right now. The pressed variant is a complete REPLACEMENT rather than an
// overlay: `resolveActiveClassName` resolves the element's tokens PLUS `:active` through the same
// matcher, so a `.btn:active` rule joins the cascade exactly as its specificity says and the
// result already contains everything `.btn` gave. That is why pressing needs no extra style slot
// and leaves the published array's SHAPE untouched.
//
// Resolved LAZILY, at press time, never beside `classStyle`. Eager would mean two resolutions per
// class WRITE — ~14 000 of them on one benchmark create — and twice the distinct keys in a cache
// that clears whole on overflow, to serve a state almost no node is ever in. A press is one event
// on one node, so the second lookup is invisible there.
//
// `:active` applies only to a class that reaches the engine as a STRING, and the reason it is a
// footnote rather than a gap is that essentially nothing delivers anything else.
//
//   Vue      createVNode normalises class to a string before patchProp ever sees it — in
//            @vue/runtime-core, `if (klass && !isString(klass)) props.class =
//            normalizeClass(klass)`. So `:class="{btn:true}"` arrives as `"btn"`. Cited by the
//            expression, not a line: the package ships several builds of that file and the same
//            statement sits on a different line in each, so two readers comparing notes see a
//            contradiction that is not one.
//   Angular  Ivy compiles every class form to per-token addClass/removeClass, and the renderer
//            joins the accumulated tokens into ONE string before routeProp.
//   React    `className` is a string by convention.
//   Svelte   `normalizeSvelteClass` (adapters/svelte/src/class-value.ts) joins a clsx-shaped
//            value, and hands anything else through UNCHANGED — so Svelte never sends a class
//            MAP, but it does send a non-string class, deliberately, and it is the one live
//            producer of the branch below.
//
// An OBJECT here is not a class map at all — `IClassNameValue` types it as an IResolvedStyle, the
// channel ScrollView / VirtualizedList / FlatList / ImageBackground use to hand a style through
// the class prop, and Svelte's `resolveSvelteClass` exists to feed it. Canonicalising that into
// tokens would not have been a category error only in theory: it would have hit a live producer on
// four components, and they would have silently lost their styling. Do not "simplify" the object
// branch away.
//
// What remains is an ARRAY of plain strings, which no adapter produces today and which reduces
// fresh on every call, so it gets neither a pressed variant nor `isAlreadyPublished`. Narrow, and
// closable by joining an all-string array before the string path — not done here.
//
// The identity reasoning underneath: the registry memoises a class STRING to the same object, and
// `isAlreadyPublished` compares slot 0 with Object.is. A variant built from a value that resolves
// fresh each call could never be turned away by the guard, and 1 000 unpressed rows would
// republish and re-dirty — the storm the guard exists to stop.
// Slot 1's twin of `baseStyleOf`. The variant stands in for the AUTHORED style, so it replaces
// slot 1 and not slot 0 — it must beat the class cascade exactly the way the authored style does,
// and a `:active` class rule must still be able to win slot 0 underneath it.
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

// Republish the merged style after one half changed. The halves are written IN PLACE by the
// callers below - there is no patch object and no spread, because this is the hottest function in
// the mutation API (9.3 ms self time and a large share of GC on a 4 000-row create, when it still
// allocated a patch literal plus a merged copy per write).
//
// The fresh ARRAY is the one allocation that stays, and that is DELIBERATE - do not "finish the
// optimization" by skipping when both halves are unchanged. The parts are a shadow copy of the
// declarative style, and setNativeProps bypasses them (it writes node.props.style directly,
// merging an Animated frame onto whatever is there). An app that hands over a hoisted style
// constant - StyleSheet.create, a module-level object - would then re-push an identity-equal half,
// get skipped by setProp's Object.is guard, and never restore the declarative style the animation
// overwrote. The re-push IS the restore path.
// Would `pushClassStyle` republish an array byte-identical to the one already standing?
//
// Sound because `pushClassStyle` is the ONLY writer of `parts.published` — both routeProp branches
// and setNodeHidden funnel through it — so a node that has published nothing holds `undefined` and
// the first write can never be swallowed.
function isAlreadyPublished(parts: IClassStyleParts): boolean {
  const published = parts.published;
  if (published === undefined) return false;
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
  // The fresh array below can never be turned away by setProp's Object.is guard, so without this
  // an UNCHANGED class still lands as a write AND marks the node dirty. Costs React / Vue / Svelte
  // nothing — each diffs props before calling the engine — but Solid has no diff: a fine-grained
  // effect re-runs whenever any signal it reads changes, so a list-wide signal makes every row
  // re-push its own unchanged class. Measured on device 2026-08-23 (examples/solid, after
  // host-primitive lowering): selecting one row of 1 000 read WRITES 1001 and a 10.3 ms reconcile
  // window against Fabric's unmoved 0/0/10 — a thousand-node dirty walk for two nodes of change.
  // Before lowering, the View component's splitProps/mergeProps memos had been absorbing it.
  //
  // This is NOT the naive skip the paragraph above forbids, and the published marker is the
  // difference. Skipping on "the parts are unchanged" alone would break the restore path, because
  // setNativeProps writes the style slot past this function and a hoisted style constant would then
  // never be restored. But setNativeProps CLEARS `parts.published` — so after any bypass
  // isAlreadyPublished is false, the re-push happens exactly as before, and the restore path is
  // untouched.
  //
  // Exact rather than approximate: resolveClassName memoizes a class STRING to the same object, so
  // an unchanged class yields an identity-equal classStyle. It deliberately does not fire for an
  // object/array class value, which resolves fresh every call — the same place the host's own
  // Object.is guard gives up on a style object, so no new asymmetry appears.
  if (isAlreadyPublished(parts)) return;
  // The third slot is APPENDED ONLY WHILE HIDDEN. Writing a permanent three-element array would
  // change the style payload of every node in every app for a state almost none of them are ever
  // in — and this project spent a day removing per-frame allocations, so a slot that is undefined
  // 99.9% of the time does not get to ride along on every style write.
  const published =
    parts.hiddenStyle === undefined
      ? [baseStyleOf(parts), explicitStyleOf(parts)]
      : [baseStyleOf(parts), explicitStyleOf(parts), parts.hiddenStyle];
  parts.published = published;
  setProp(node, 'style', published);
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
  const parts = stylePartsOf(node);
  parts.hiddenStyle = hidden ? HIDDEN_STYLE : undefined;
  pushClassStyle(node, parts);
}

/**
 * Put a node into (or out of) its pressed state, so `.x:active` rules apply.
 *
 * The engine-owned half of what `:active` is on the web: the press state resolves BELOW the
 * framework and never crosses into it, which is what lets a pressable be an intrinsic tag rather
 * than a component (`.claude/rules/host-primitive-tier.md`, tier 2). A component is forced only
 * when the TEMPLATE must read the state — `v-slot="{ pressed }"` and the function form of `style`
 * — and this exists so the common case does not have to.
 *
 * Costs nothing when no `:active` rule is registered anywhere: `resolveActiveClassName` hands back
 * the very same object the unpressed path returns, so `isAlreadyPublished` turns the re-push away
 * and the node is never dirtied.
 */
export function setNodePressed(node: ISymbioteNode, pressed: boolean): void {
  const parts = stylePartsOf(node);
  parts.isPressed = pressed;
  pushClassStyle(node, parts);
}

/**
 * Forget what was last published, so the next `pushClassStyle` cannot be turned away.
 *
 * The one caller is `setNativeProps` (imperative.ts), which writes the style slot past this file —
 * see the note on `IClassStyleParts.published` for why the restore path depends on this. A no-op for
 * a node nobody has styled, which is why it is not `stylePartsOf(node).published = undefined`: that
 * would allocate the parts on a node that has none.
 */
export function clearPublishedStyle(node: ISymbioteNode): void {
  if (node.styleParts !== undefined) node.styleParts.published = undefined;
}

// The explicit (non-class-derived) style half, for an adapter that builds its style prop up
// key-by-key (Angular's Ivy ɵɵstyleProp/setStyle) instead of handing over one whole object —
// it must merge onto this, not onto node.props.style directly, which may be the
// [classStyle, explicitStyle] array commitClassStyle writes above.
export function getExplicitStyle(node: ISymbioteNode): unknown {
  return node.styleParts?.explicitStyle;
}

/**
 * The `[classStyle, explicitStyle]` pair the node currently PUBLISHES — the same value
 * `commitClassStyle` writes, in the same order, so `flattenStyle` collapses it the way Fabric will.
 *
 * For a caller that wants the merged answer without a host: the pair reaches the payload as an op,
 * and only a host holds ops. A test that has not installed one — `core/css-parser` reaches into the
 * engine by relative path and depends on neither package — can read it here instead of reaching
 * into `styleParts`, which is engine-owned and not a shape anything outside may bind to.
 */
export function getPublishedStyle(node: ISymbioteNode): readonly unknown[] {
  const parts = node.styleParts;
  if (parts === undefined) return [];
  return [parts.classStyle, parts.explicitStyle];
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
    const parts = stylePartsOf(node);
    // Canonicalised HERE so the stored value is what everything downstream keys on: an all-string
    // array becomes one string, and then the pressed variant and isAlreadyPublished work on it
    // exactly as on an authored string. One `typeof` for the common case.
    parts.className = canonicalClassName(
      isClassNameValue(value) ? value : undefined,
    );
    parts.classStyle = resolveClassName(parts.className);
    pushClassStyle(node, parts);
    return;
  }
  if (key === 'style') {
    const parts = stylePartsOf(node);
    // A FUNCTION `style` is `style={({pressed}) => …}`, the idiom this ecosystem actually writes.
    // A lowering transform normally splits it at build time into `style` + `activeStyle`, so the
    // engine never sees the callback — but a PUBLIC primitive tag has no transform in front of it
    // on three adapters, and there the callback arrives here intact. Resolving it makes the
    // compile-time split an OPTIMIZATION rather than the mechanism, the same relationship
    // `foldHostBag` has with the compile-time prop folds.
    //
    // Without this the failure is silent and total: a function is not an `on*` name, so it misses
    // `setEventListener`, lands in `setProp` as a function value, and `fabricProps` drops function
    // props — the node commits with NO style at all. Traced by the Solid session, 2026-09-01.
    //
    // The callback must be PURE in `pressed`: its result is read once per state, here and under
    // every transform's emission (`core/components/src/state-style.ts` carries the same contract).
    if (isStyleCallback(value)) {
      parts.explicitStyle = value({ pressed: false });
      parts.activeStyle = value({ pressed: true });
      parts.activeStyleFromCallback = true;
    } else {
      parts.explicitStyle = value;
      // Only a variant WE derived is stale now. `style` switching from a callback to a plain value
      // must not leave the old pressed look standing, and an `activeStyle` the transform wrote must
      // survive a `style` write, because the two arrive as independent props in an unspecified
      // order.
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
    parts.activeStyle = value;
    // Slot 1 is no longer ours, by definition — whatever a callback derived earlier has just been
    // replaced. Without this the flag outlives the value it describes: a callback sets it, this
    // branch overwrites the slot silently, and a later plain `style` then clears a variant the
    // engine never derived. Not reachable from a lowering transform (it emits either a callback or
    // an explicit pair, never both for one node), but a flat-bag adapter routes a bag key by key
    // and can deliver exactly that sequence.
    parts.activeStyleFromCallback = false;
    pushClassStyle(node, parts);
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

// Counted in the same propStats, because a text write IS a prop write: it reaches Fabric as
// RCTRawText's only prop.
//
// Unguarded, unlike the old version, and for the same reason `setProp` is: comparing against the
// standing text would mean reading it back from the host. The host holds it as a local field and
// dedupes there. Two consequences it also absorbs, both of which used to be spelled here — a write
// to or from `''` takes this node out of its parent's renderable child list or puts it back, and a
// raw text REPARENTED under a `<Text>` commits as RCTVirtualText instead of RCTText.
export function setText(node: ISymbioteNode, text: string): void {
  propStats.writes += 1;
  recordSetText(node, text);
}

// The structural ops. Each is one op and nothing else: the host detaches the child from whatever
// parent it currently has before linking it, which is the truth even when an adapter names a stale
// one — frameworks spell a MOVE as remove-then-insert and can arrive after the insert already
// re-parented the node. That is why there is no `detach` here any more; JS does not know the old
// parent and does not need to.
export function appendChild(parent: ISymbioteNode, child: ISymbioteNode): void {
  // A node the sweep tore down can be put back — Svelte parks live subtrees offscreen across
  // commits. A WeakSet miss for anything freshly built, so the create path pays nothing.
  if (hasHostBehaviors()) reattachHostBehaviors(child);
  recordAppendChild(parent, child);
}

// NO ANCHOR MEANS APPEND, and it is a real call rather than a defensive guard: solid-js/universal
// spells "insert at the end" as `insertNode(parent, node, null)` and Vue's runtime-core passes
// `anchor` straight through as `null`. The old retained tree collapsed it silently — `indexOf(null)`
// is -1, and the insert fell through to a push. On the wire it cannot: a slot has to name a node, so
// an unanchored insert IS an append and is recorded as one.
export function insertBefore(
  parent: ISymbioteNode,
  child: ISymbioteNode,
  beforeChild: ISymbioteNode | null | undefined,
): void {
  if (hasHostBehaviors()) reattachHostBehaviors(child);
  if (beforeChild === null || beforeChild === undefined) {
    recordAppendChild(parent, child);
    return;
  }
  recordInsertBefore(parent, child, beforeChild);
}

// Removal only NOMINATES a behavior for teardown; the commit sweep decides. A framework may spell
// a move as remove-then-reinsert (Solid does), so tearing down here kills the machine of a node
// that comes back alive in the same batch — see host-behavior.ts's markDetachCandidate.
export function removeChild(parent: ISymbioteNode, child: ISymbioteNode): void {
  if (hasHostBehaviors()) markDetachCandidate(child);
  recordRemoveChild(parent, child);
}

// Re-exported from its own module so the census keeps ONE public spelling: it moved to `tree-host.ts`
// with the tree it describes, and every caller has always imported it from here.
export type { ITreeCensus } from './tree-host';

/**
 * A structural census of the tree the HOST holds — see `ITreeCensus` (tree-host.ts) for what each
 * number is for and why the anchor count says more about the adapter than about the app.
 *
 * It walks nothing here: the walk needs `props.text` to tell an empty raw text from a real one, and
 * a child list to measure a flatten width, and JS has neither. `undefined` from `treeHost()` means
 * nothing is installed, and the empty census is the honest answer — every probe that reads this
 * asserts against a mounted tree, so a zero from an uninstalled host cannot be mistaken for one from
 * an empty one.
 */
export function censusRetainedTree(
  roots: readonly ISymbioteNode[],
): ITreeCensus {
  flushOps();
  return treeHost()?.census(roots) ?? EMPTY_CENSUS;
}
