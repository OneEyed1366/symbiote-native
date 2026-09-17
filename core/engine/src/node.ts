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
  noteHostSideChange,
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
  hasHostBehaviors,
  markDetachCandidate,
  notifyChildInserted,
  notifyOwnedListenerChange,
  notifyWrapChange,
  noteCommitHookNodeChanged,
  ownsListener,
  reattachHostBehaviors,
  derivedNodesOf,
  slotDerivesFrom,
  slotPropNameFor,
  slotTakesChildren,
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
  // (`accessibility-props.ts`), which `fabricProps` runs on the way to the payload because a tag
  // has no component wrapper to run it in.
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
  /**
   * Whether this node's host behavior declared `afterCommit`.
   *
   * Read on every prop write, exactly as `hasAriaAlias` beside it is and for the same reason: the
   * alternative is a Set lookup per write, on the hottest path in the engine. What it gates is the
   * NARROWING of the post-commit beat — the hook runs for nodes whose props moved rather than for
   * every mounted behavior, which is what took TextInput's `propOf` off every commit (F-67).
   *
   * Set once at `createElement`, by `attachHostBehavior`. Not sticky in the `hasAriaAlias` sense:
   * it describes the behavior's shape, and a behavior is attached once and detached whole.
   */
  hasCommitHook: boolean;
  // The payload fold this node's host behavior supplied, or undefined for the ~all of them that
  // have none. Set once at `createElement`, never per write, and read by `fabricProps` at the one
  // point where the whole bag is known.
  //
  // WHY IT HANGS OFF THE BEHAVIOR AND NOT OFF `node.component`, which is how the aria and
  // value->text folds next to it are keyed. Several tags commit the SAME Fabric view name —
  // `pressable`, `touchable-opacity` and a plain `view` are all `RCTView` — so a fold keyed on the
  // component name would run on every one of them. A behavior attaches per TAG, which is the
  // discriminator that already exists.
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

  // Where this node's APP children go, when the node owns an internal subtree of its own.
  //
  // A host primitive that is a COMPOSITION — ScrollView is a scroll view wrapping a content view —
  // has structure the app never wrote and must never see. In a component that structure lives in
  // a wrapper's body, which is exactly the per-instance cost a tag exists to delete; here the
  // behavior builds it once at attach (`IHostBehavior.buildStructure`) and points
  // this at the node the app's own children belong under. `appendChild` / `insertBefore` /
  // `removeChild` then redirect, so the adapter keeps calling them with the OWNER and never learns
  // that a slot exists. The browser's twin is a UA shadow tree: `<video>`'s controls are real nodes
  // the page cannot address, and an author's `<track>` still lands where the element decides.
  //
  // NOT a serialization of children, and that alternative is worth naming because it is the one
  // that gets proposed: app children stay ordinary engine nodes, owned by the engine, and only
  // their PARENT differs from the one the framework named. Nothing is copied, flattened or
  // replayed.
  //
  // A FIELD rather than a WeakMap, for the reason `payloadFold` is one: the redirect is read on
  // every structural op (~9 000 appends on one benchmark create), so it must not cost a hash probe
  // to discover that almost no node has a slot. `undefined` on every node that does not.
  //
  // SINGLE HOP by design. A slot that itself carried a slot would make "where does this child go"
  // a walk, on the hottest path in the engine, to express a structure no primitive has. A behavior
  // that needs depth builds the chain and points this at the innermost node directly.
  childHost: ISymbioteNode | undefined;

  // The node that stands in THIS node's place in its parent's child list. Set when a behavior
  // claims a child in `wrap` mode, which is how an Android ScrollView takes a RefreshControl: the
  // refresh layout becomes the scroll view's parent, because an Android ScrollView holds exactly
  // one child and a sibling refresh control is an `addViewAt` crash.
  //
  // The inversion is confined to the two structural entry points, and only they read this: the
  // adapter still names the scroll view for every insert, prop write and command, because that is
  // the node it holds. Nothing above `appendChild` learns the wrapper exists.
  //
  // A FIELD for the same reason `childHost` is one, and beside it in the constructor so the pair
  // costs no extra shape transition.
  wrapper: ISymbioteNode | undefined;

  // Has this node EVER been named as the parent of a structural op.
  //
  // One bit, and deliberately not a child list: JS holds no tree, and this does not become one —
  // it can say "certainly empty" and nothing else. False means no `appendChild` or `insertBefore`
  // ever named this node, so its child list cannot be anything but empty and `childrenOf` may
  // answer without asking the host. True means "ask", including after every child has been removed
  // again; the bit never goes back down, which is the safe direction.
  //
  // It exists because a READ IS A BATCH BOUNDARY. Every read calls `flushOps`, so a question whose
  // answer is empty still cuts the op stream into two crossings. Measured on solid's 1 000-row
  // create: 2 000 child-list reads, every one of them returning ZERO handles, and 2 002 drains of a
  // buffer that should have crossed once.
  mayHaveChildren: boolean;

  // RN's ReactFabricHostComponent surface - what a template/function ref hands back and what
  // reanimated / gesture-handler / react-navigation reach through. Each resolves the node's
  // CURRENT committed handle at call time, so a clone-on-write commit between calls is
  // transparent, and each degrades to a silent no-op (dlog + return) before the first commit.
  //
  // They are PROTOTYPE methods on every node rather than closures grafted per node, and that is a
  // measured decision, not a style one. toPublicInstance used to Object.assign six closures onto
  // each node; on a 1 000-row benchmark press that is 54 000 closures plus 9 000 discarded object
  // literals, each closure pinning its own context alive - and once Vue's primitives became tags, GC
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
  // The scroll commands, on every node for the same reason `focus`/`blur` are: a tag hands the app
  // its engine NODE, so anything a wrapper's imperative handle offered has to be reachable from
  // here or the surface silently shrinks.
  //
  // ON THE SHARED PROTOTYPE, not per-tag, and that is a trade rather than an oversight. The
  // browser's shape is per-tag — `HTMLVideoElement.play` is not on `HTMLElement` — and it is
  // reachable here too, by registering one subclass per tag so `createElement` can construct with
  // the right prototype. It was not taken: that gives the commit walk N node shapes where it has
  // one today, and every call site in `reconcile`/`fabricProps` that is monomorphic on
  // `SymbioteNode` becomes polymorphic. The cost is unmeasured, the benefit is type hygiene, and
  // this file's own history says the prototype question is decided by measurement (see the
  // toPublicInstance note above). Revisit with numbers, not with taste.
  //
  // Harmless where meaningless: `focus()` on a View already dispatches a command native ignores,
  // and RN's own host component carries the same universal surface.
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
  declare hasCommitHook: boolean;
  declare styleParts: IClassStyleParts | undefined;
  declare payloadFold: IPayloadFold | undefined;
  declare childHost: ISymbioteNode | undefined;
  declare wrapper: ISymbioteNode | undefined;
  declare mayHaveChildren: boolean;

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
    // Same hidden-class reason; `attachHostBehavior` raises it a few lines later for the rare node
    // whose behavior declares the recurring hook.
    this.hasCommitHook = false;
    this.styleParts = undefined;
    // Assigned here for the same hidden-class reason as `hasAriaAlias` above; `attachHostBehavior`
    // overwrites it a few lines later for the rare node that has a behavior.
    this.payloadFold = undefined;
    // Same reason again, and here it is load-bearing rather than tidy: the redirect below is read
    // on every append, so the slot must be a stable slot on one hidden class, not a property added
    // to a few nodes after the fact.
    this.childHost = undefined;
    this.wrapper = undefined;
    // Same hidden-class reason as the two above, and here it is the whole point: the fast path it
    // guards is read on every `childrenOf`, so it must be a stable slot rather than a property that
    // appears on some nodes later.
    this.mayHaveChildren = false;
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
  // adapter creating a `<pressable>` has to hand the tag over here or the registration cannot fire
  // (host-behavior.ts, `attached`). Nothing is stored — the lookup happens once, right below.
  tag: string = component,
): ISymbioteNode {
  const node = new SymbioteNode(component, isText);
  // A primitive that commits NO VIEW resolves to the anchor component through `descriptorFor`
  // (`touchable-without-feedback`, `touchable-native-feedback`), and reaches this function rather
  // than `createAnchor` because the caller only knows it has a descriptor. The kind is an OPCODE
  // now, not a name the commit walk reads, so the name alone would give the host an ordinary
  // element called `#anchor` — one that really paints.
  if (component === ANCHOR_COMPONENT) recordCreateAnchor(node);
  // `instanceHandle` is the node itself: it round-trips through Fabric unchanged and comes back as
  // the event target, and the BRAND below is how the event handler confirms it is one of ours.
  else recordCreateElement(node, component, isText, node);
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

// `<component>.<key>` -> write count, gated behind `isDebug()` (a Map lookup per write is not the
// "log line per write" the comment above rules out, but it is still real cost on the hottest path,
// so it only runs when someone asked). Answers F-79's own recommended next step — "instrument
// recordSetProp call sites directly, not just before/after counts" — by naming exactly which
// (view, key) pair an adapter comparison's aggregate delta is hiding, the same ledger shape F-75's
// payload census already uses (`RCTView.accessible 2000`).
let propKeyTally: Map<string, number> | undefined;

export function takePropKeyTally(): ReadonlyMap<string, number> {
  const snapshot = propKeyTally ?? new Map();
  propKeyTally = undefined;
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
  // A composed primitive's slot — and its wrapper, where it has one — can carry a value DERIVED
  // from an owner prop, and `markPropsDirty` bubbles up, so neither ever learns. Here rather than
  // in `routeProp` because this is the one choke point every writer passes (a structural adapter's
  // `setProperty` does not go through routeProp), and past the identity guard so a re-render
  // writing an unchanged value costs them nothing. See `IHostBehavior.slotDerived`.
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
  // Arms the node's recurring post-commit hook, for the rare node that has one. HERE rather than in
  // `setProp`, because this is where both paths meet: `setNativeProps` reaches the wire through
  // this function and not through that one, and a hook armed only by the declarative path missed
  // the imperative write entirely (`__tests__/after-commit-lifecycle.test.ts` said so). The field
  // read is the same shape as `hasAriaAlias` and for the same reason — this is the hottest path in
  // the engine, and a Set lookup per write is not something it can carry.
  if (node.hasCommitHook) noteCommitHookNodeChanged(node);
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

/**
 * The same stash, whole — what `propsOf` layers over the host's answer.
 *
 * `undefined` rather than an empty Map for a node that stashed nothing, which is nearly every node:
 * the caller then hands back the host's own object instead of copying it.
 */
export function functionPropsOf(
  node: ISymbioteNode,
): ReadonlyMap<string, unknown> | undefined {
  return functionProps.get(node);
}

/**
 * "Rebuild this node's payload — the fold reads state I just changed."
 *
 * A behavior whose payload is DERIVED has no prop to write: the sticky header's debounced
 * translateY lives in its own runtime, not on the node, so nothing names the node and the host
 * never marks it. This is the one route that says so directly.
 *
 * Dirtying is not publishing — pair it with `requestCommitFor` (imperative.ts).
 */
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
 *
 * `undefined` removes it, gate flag included. A behavior whose dispatcher is conditional needs
 * that as much as it needs the install: ScrollView takes the owner's `layout` only while the app
 * or an inverted sticky header wants it, and a one-way installer leaves `onLayout: true` standing
 * in the payload of a ScrollView that no longer reads the event.
 */
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
  // reached the node; a tag has no mediator. Gated on the boolean first, so an app with no behavior
  // registered pays one read.
  if (hasHostBehaviors() && ownsListener(node, name)) {
    // The PRESENCE only, never the identity: listeners deliberately do not notify (a framework
    // hands a fresh closure nearly every render — see `markDirty`'s note on why that must stay
    // free). A flip is a mount-time event, not a per-render one.
    const wasWired = appListenerFor(node, name) !== undefined;
    stashAppListener(node, name, isHandler ? value : undefined);
    if (wasWired !== isHandler)
      notifyOwnedListenerChange(node, name, isHandler);
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

// `/^on[A-Z]/` spelled out, because this runs on EVERY prop write and a regex is the one guard in
// that sequence that is not obviously cheap. Priced on `build-release`
// (`mutation-api-fill-cost.itest.ts`): 0.09 us for the regex against 0.03 for the character reads,
// on a prop write that costs 0.88 us end to end — so ~7% of a write, ~1% of a create. Small, and it
// is free: the boundary is pinned by its own tests in `node.test.ts`.
//
// 111 is 'o', 110 is 'n', and 65-90 is A-Z. `charCodeAt` past the end answers NaN, which fails every
// comparison — so a two-character `on` needs no length check.
function isOnEventName(key: string): boolean {
  if (key.charCodeAt(0) !== 111 || key.charCodeAt(1) !== 110) return false;
  const third = key.charCodeAt(2);
  return third >= 65 && third <= 90;
}

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
  // The pressed variant of the EXPLICIT style, as opposed to one the class registry resolves from
  // an `:active` rule. It arrives either as its own prop or from resolving a functional
  // `style={({pressed}) => …}` at `pressed: true` (`routeProp`'s `style` branch). So `:active` is
  // one way to deliver a pressed look and this is the other; the engine does the same with both.
  activeStyle: unknown;
  // Whether slot 1's pressed variant came from resolving a FUNCTION `style` here, rather than from
  // an authored `activeStyle` write. Only the first kind may be cleared when `style` later arrives
  // as a plain value — clearing the second would break the two-write path, where `style` and
  // `activeStyle` are separate props and either may land first.
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
// What a node publishes when NOTHING resolves — an unstyled node, or the benchmark row's
// `style={isSelected ? {…} : undefined}` on the 999 rows that are not selected. Length 0 is the
// marker and needs no second field: `pushClassStyle` never publishes an empty array otherwise, so
// the state is unambiguous, and it is distinct from `undefined`, which means "nothing published
// yet" and must never be turned away.
const PUBLISHED_NOTHING: readonly unknown[] = Object.freeze([]);

// ── ONE ARRAY PER DISTINCT PAIR, SHARED ACROSS NODES ─────────────────────────────────────────────
//
// The array above is per-node and identical for every node styled the same way, which is the normal
// case for a list: one `StyleSheet.create` object, or one resolved CSS class, across a thousand rows.
// `mutation-buffer.ts` interns the values it is handed BY IDENTITY, so a thousand distinct-but-equal
// arrays are a thousand entries and a thousand JS -> `folly::dynamic` conversions on the far side.
// Measured on `build-release`: 4 000 of 12 005 `setProp` ops refused to fold, and they were exactly
// these.
//
// `WeakMap`, and both levels of it, so nothing here can grow without bound: a caller that builds a
// fresh style object per render gets a fresh cache entry that dies with the object. That caller also
// gets no sharing, which is correct — two structurally equal objects are two values to whoever reads
// them, and a deep compare would make every prop write cost the size of the style.
//
// The three-slot (hidden) form is deliberately NOT cached. `display: 'none'` is a state almost no
// node is ever in, so a third map would be paid for on every write to serve a case that is rare by
// construction.
const sharedPairByExplicit = new WeakMap<object, readonly unknown[]>();
const sharedPairByBase = new WeakMap<
  object,
  WeakMap<object, readonly unknown[]> | readonly unknown[]
>();

/**
 * The published array for this pair — the same object every time the same two parts are handed in.
 *
 * `undefined` when the pair cannot be keyed (a primitive half, or the hidden form), and the caller
 * then builds its own array exactly as before. Sharing is an optimization here, never a requirement:
 * every reader of `published` compares its SLOTS by identity, never the array itself.
 */
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
// styles nothing" object. An IDENTITY compare rather than a key count — `Object.keys(x).length`
// allocates an array, and this runs on every class and style write, ~14 000 times on one benchmark
// create. That is the F-12 shape: an expensive guard in front of cheap work.
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
  // The fresh array below can never be turned away by setProp's Object.is guard, so without this
  // an UNCHANGED class still lands as a write AND marks the node dirty. Costs React / Vue / Svelte
  // nothing — each diffs props before calling the engine — but Solid has no diff: a fine-grained
  // effect re-runs whenever any signal it reads changes, so a list-wide signal makes every row
  // re-push its own unchanged class. Measured on device 2026-08-23 (examples/solid, once its
  // primitives were tags): selecting one row of 1 000 read WRITES 1001 and a 10.3 ms reconcile
  // window against Fabric's unmoved 0/0/10 — a thousand-node dirty walk for two nodes of change.
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
  // NOTHING RESOLVED, so say nothing. The buffer spells an absent prop as `NO_VALUE` and the host
  // then takes a path that costs it literally one branch — `if (props.get_ptr(key) == nullptr)
  // break` — while `[undefined, undefined]` is a real value it must convert into a `folly::dynamic`
  // array, store, and re-compare on every later commit. Both are behaviourally "no style": the
  // payload builder flattens the pair of undefineds into no keys at all.
  //
  // This is NOT the naive skip the note above forbids, and the distinction is the same one the
  // published marker makes. A restore after `setNativeProps` arrives here with `published` cleared
  // to `undefined`, so it is never turned away — and when the authored style is nothing, restoring
  // it means DELETING the slot the imperative write put there, which is what this emits.
  if (hasNothingToPublish(parts)) {
    parts.published = PUBLISHED_NOTHING;
    setProp(node, 'style', undefined);
    return;
  }
  // The third slot is APPENDED ONLY WHILE HIDDEN. Writing a permanent three-element array would
  // change the style payload of every node in every app for a state almost none of them are ever
  // in — and this project spent a day removing per-frame allocations, so a slot that is undefined
  // 99.9% of the time does not get to ride along on every style write.
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
  // The prop twin of the child redirect in `appendChild`. A composed primitive's owner is written
  // with props that belong to its internal slot — `contentContainerStyle` on a ScrollView styles
  // the content view — and the adapter names the OWNER for a prop for the same reason it names the
  // owner for a child: that is where the app wrote it.
  //
  // Gated on the FIELD, so a node with no slot pays one load and one branch and never touches the
  // registry. The redirected write recurses into the slot's own `routeProp`, which is single-hop
  // by construction: a slot has no slot of its own (`childHost` is documented single-hop, and
  // `buildStructure` is what would have to nest one).
  if (node.childHost !== undefined) {
    const slotKey = slotPropNameFor(node, key);
    if (slotKey !== undefined) {
      // A class NAME is a legal spelling of `contentContainerStyle` — every canary writes
      // `contentContainerStyle="scroll-content"` — so a string has to land on the slot as a
      // CLASS. Only the class branch consults the registry; renaming it verbatim would publish a
      // `style` holding a string, which is not a style and is dropped with nothing red. React's
      // wrapper resolves the name itself (components/scroll-view/shared.ts), so this gap could
      // only ever show on the tag path.
      routeProp(
        node.childHost,
        slotKey === 'style' && typeof value === 'string' ? 'class' : slotKey,
        value,
      );
      return;
    }
  }
  // An AnimatedNode written straight into a prop — `<view style={{opacity: value}}/>` — is
  // resolved here into the value to PUBLISH, with the engine holding the subscription. Same
  // shape as the `style` callback below: a value the engine interprets rather than forwards.
  // Returns its input by identity when nothing is animated, so every branch under this line is
  // unchanged. See `animated/host-binding.ts`; the gate is one boolean for an app that animates
  // nothing.
  //
  // AFTER the slot redirect, so an animated `contentContainerStyle` binds on the node that
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
    // A FUNCTION `style` is `style={({pressed}) => …}`, the idiom this ecosystem actually writes.
    // Nothing stands between an app and the tag, so the callback arrives here intact and is
    // resolved at both states — writing `style` + `activeStyle` as an explicit pair is the same
    // thing said by hand, and cheaper by one call per recompute.
    //
    // Without this the failure is silent and total: a function is not an `on*` name, so it misses
    // `setEventListener`, lands in `setProp` as a function value, and `fabricProps` drops function
    // props — the node commits with NO style at all. Traced by the Solid session, 2026-09-01.
    //
    // The callback must be PURE in `pressed`: its result is read once per state, here and under
    // every transform's emission (`core/components/src/state-style.ts` carries the same contract).
    if (isStyleCallback(resolved)) {
      parts.explicitStyle = resolved({ pressed: false });
      parts.activeStyle = resolved({ pressed: true });
      parts.activeStyleFromCallback = true;
    } else {
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
    // Slot 1 is no longer ours, by definition — whatever a callback derived earlier has just been
    // replaced. Without this the flag outlives the value it describes: a callback sets it, this
    // branch overwrites the slot silently, and a later plain `style` then clears a variant the
    // engine never derived. An author writes either a callback or an explicit pair, never both for
    // one node — but a flat-bag adapter routes a bag key by key and can deliver that sequence.
    parts.activeStyleFromCallback = false;
    pushClassStyle(node, parts);
    return;
  }
  if (isOnEventName(key)) {
    // A native-driven `Animated.event` needs the native module as well as the listener map, and
    // registers under the PROP name — see `bindAnimatedEvent`, which no-ops for anything else.
    if (hasAnimatedNodes()) bindAnimatedEvent(node, key, resolved);
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
      setEventListener(node, name, resolved);
      return;
    }
  }
  setProp(node, key, resolved);
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
//
// What they DO still decide in JS is which node an op names, and there are two such redirects — a
// composed primitive's slot and a wrap claim. Both are read off a field on the node, so a tree with
// neither pays one load and one branch per op.

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
//
// SINGLE HOP, not a loop, and the field's own comment says why — a chain would put a walk on the
// engine's hottest path to express a depth no primitive has. A behavior needing depth points
// `childHost` at the innermost node itself.
//
// Reads a field that is `undefined` on every node in every app that registers no composed
// primitive, so the cost is one load and one branch — deliberately NOT behind `hasHostBehaviors()`,
// which would be a second read to save nothing. The claim check sits BEHIND that branch, so only a
// slot-bearing node ever pays the registry probe.
function hostFor(parent: ISymbioteNode, child: ISymbioteNode): ISymbioteNode {
  const slot = parent.childHost;
  if (slot === undefined) return parent;
  // A slot that is a built SIBLING rather than a container — ImageBackground's absolutely-filled
  // image — keeps the app's children on the owner. See `IHostBehavior.slotTakesNoChildren`.
  if (!slotTakesChildren(parent)) return parent;
  return claimModeFor(parent, child.component) === undefined ? slot : parent;
}

// The node a child must be inserted BEFORE, or `undefined` for an ordinary append.
//
// A host that STILL has a slot at this point is an owner taking a CLAIMED child, and that child
// goes before the slot whatever the framework asked for. RN renders `{refreshControl}{content}` in
// that order, and the node a framework names as `beforeChild` lives inside the slot, so the host
// could not place against it here anyway.
//
// A SIBLING slot is the opposite placement: RN paints the background image first and the app's
// children over it (ImageBackground.js:80-102), so they append past it rather than in front of it —
// which is what `undefined` here leaves alone.
function slotAnchorOf(host: ISymbioteNode): ISymbioteNode | undefined {
  const slot = host.childHost;
  if (slot === undefined || !slotTakesChildren(host)) return undefined;
  return slot;
}

// ── the two structural recorders, and why nothing here calls the raw ones ───────────────────────
//
// `mayHaveChildren` is only sound if EVERY op that gives a node a child raises it. There are five
// such call sites in this file and a sixth is a plausible future edit, so the bit is raised here
// rather than at each of them: a site that forgets would make `childrenOf` answer "empty" for a node
// that has children, which is a wrong ANSWER rather than a slow one. `node.ts` is the only module
// that records a structural op, so these two are a complete funnel.

/**
 * Arm a parent's recurring post-commit hook for a STRUCTURAL change.
 *
 * A prop write is not the only thing a behavior can be waiting for, and the ScrollView sticky-header
 * machine is the case that proves it: it drops a wrapper when the framework takes the wrapped child
 * away, which writes no prop on the wrapper's owner at all. Narrowing the beat to prop writes alone
 * left it holding a wrapper around nothing, and its own test said so — the third behavior needing
 * the beat, and the only one whose source comment does not say why.
 */
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
//
// The owner being UNATTACHED is the normal case rather than the edge one: every adapter fills a
// node's children before appending it to its own parent, so the wrap usually happens while the
// owner has no holder and only the second op runs. The later `appendChild(root, owner)` then
// inserts the wrapper instead, because `placedNode` says so.
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
  notifyWrapChange(owner, child);
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
  notifyWrapChange(owner, undefined);
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

// NO ANCHOR MEANS APPEND, and it is a real call rather than a defensive guard: solid-js/universal
// spells "insert at the end" as `insertNode(parent, node, null)` and Vue's runtime-core passes
// `anchor` straight through as `null`. The old retained tree collapsed it silently — `indexOf(null)`
// is -1, and the insert fell through to a push. On the wire it cannot: a slot has to name a node, so
// an unanchored insert IS an append and is recorded as one.
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
    if (hasHostBehaviors() || hasAnimatedBindings()) markDetachCandidate(child);
    return;
  }
  // A slot that IS the child being removed stops being one. Only a behavior that adopts an APP
  // child as its slot can reach this (`onChildInserted`); a `buildStructure` slot is internal and
  // no framework removes it. Without the clear, `hostFor` below redirects the removal INTO the very
  // node being removed, and the child stays committed under a parent the framework believes it
  // left — and the NEXT child appended nests inside the orphan.
  if (requestedParent.childHost === child)
    requestedParent.childHost = undefined;
  // Redirected for the same reason the two inserts are: the adapter removes from the node it
  // appended to, which is the OWNER, while the child actually lives in the slot.
  const parent = hostFor(requestedParent, child);
  if (hasHostBehaviors() || hasAnimatedBindings()) markDetachCandidate(child);
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
