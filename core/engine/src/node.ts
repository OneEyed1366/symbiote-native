// The retained shadow-tree. Adapters mutate this cheap in-memory tree through a
// tiny API; the commit engine (commit.ts) later walks it and translates the
// whole thing into Fabric's clone-on-write child sets. Keeping the retained
// tree mutable while the Fabric mirror stays persistent lets every adapter mutate
// freely without touching Fabric's clone-on-write protocol directly, and it
// lives here in shared so no adapter re-implements it.

import type {
  IFabricNode,
  IFabricProps,
  IRootTag,
  IMeasureOnSuccess,
  IMeasureInWindowOnSuccess,
  IMeasureLayoutOnSuccess,
} from './fabric';
import { isAriaAliasKey } from './accessibility-props';
import { childrenOf, linkAppend, linkBefore, parentOf, unlink } from './tree';
import {
  nominateDroppedEdits,
  recordNewNode,
  recordPropEdit,
  recordStructureEdit,
  recordSubtreeEdit,
} from './edit-buffer';
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
// A cycle, deliberately: commit.ts imports this module for the node shape, and the imperative
// methods below call back into it. Neither side touches the other at module-evaluation time -
// only inside a function body - so every loader (tsc, vitest, Metro) resolves it fine. The
// alternative was a load-time `SymbioteNode.prototype.measure = ...` installed from elsewhere,
// which is exactly the registration-side-effect shape Metro's inlineRequires silently drops in
// release builds (see CLAUDE.md, "Never make correctness depend on a module's load-time side
// effect").
import {
  measure as engineMeasure,
  measureInWindow as engineMeasureInWindow,
  measureLayout as engineMeasureLayout,
  setNativeProps as engineSetNativeProps,
  dispatchViewCommand,
} from './commit';

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
  props: Record<string, unknown>;
  listeners: Map<string, IListener> | undefined;
  children: ISymbioteNode[];
  parent: ISymbioteNode | undefined;
  // The three questions a commit asks about a node — "descend?", "did its own payload change?",
  // "did its child list change?" — used to be three boolean FIELDS here. They now live in the
  // pending-edit buffer (`edit-buffer.ts`), which is the whole point rather than a refactor: a node
  // is meant to carry an ADDRESS and nothing the framework did not already allocate, and a walk
  // over flags cannot be handed to a native module where a drained buffer can
  // (`symbiote-fabric-cxx-surface` §9). Read them with hasPendingWork / hasPendingProps /
  // hasPendingStructure; the rationale for each moved to the buffer beside its set.

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
  // What Fabric currently holds for this node - `undefined` until its first commit. The retained
  // node carries the DESIRED state (props/children); this carries the COMMITTED state the reconcile
  // walk diffs against and the handle every imperative call is aimed at.
  //
  // It lives HERE, on the node, and that placement is the point. It used to be a
  // `WeakMap<ISymbioteNode, IMirror>` kept in commit.ts, which read - fairly - as "the engine
  // builds its own second tree beside the framework's". It never did: `ISymbioteNode` IS the host
  // node the framework's renderer creates and mutates (React's createInstance, Vue's nodeOps
  // createElement, Angular's Renderer2.createElement all return one), exactly as `HTMLElement` is
  // in a browser. A node carrying its own native binding is what React does too - `fiber.stateNode`
  // holds the same {node, canonical} pair, minted by the same createNode call - and what a DOM node
  // does when it carries its layout box. Collapsing the side table into a field makes the code say
  // that: there is one tree, the framework's, and each of its nodes remembers what it committed.
  committed: IMirror | undefined;
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
  declare props: Record<string, unknown>;
  declare listeners: Map<string, IListener> | undefined;
  declare children: ISymbioteNode[];
  declare parent: ISymbioteNode | undefined;
  declare hasAriaAlias: boolean;
  declare committed: IMirror | undefined;
  declare styleParts: IClassStyleParts | undefined;
  declare payloadFold: IPayloadFold | undefined;

  constructor(
    component: string,
    isText: boolean,
    props: Record<string, unknown>,
  ) {
    this[BRAND] = true;
    this.component = component;
    this.isText = isText;
    this.props = props;
    this.listeners = undefined;
    this.children = [];
    this.parent = undefined;
    // Assigned here, not lazily on first use: every slot present from the constructor keeps one
    // hidden class for every node. Adding it on demand buys a shape transition per aria-bearing
    // node, which is the opposite of what this field is for.
    //
    // Starts false, and that is COMPLETE rather than optimistic: the only two constructions are
    // `createElement`'s `{}` and `createRawText`'s `{ text }`, so no aria key can arrive here. It
    // was first written as `hasAriaAliases(props)` — a probe that reads as a safeguard and can
    // never fire, which the break-test caught by staying green with it removed. If a construction
    // path is ever added that passes real props, this line owes that probe back.
    this.hasAriaAlias = false;
    this.committed = undefined;
    this.styleParts = undefined;
    // Assigned here for the same hidden-class reason as `hasAriaAlias` above; `attachHostBehavior`
    // overwrites it a few lines later for the rare node that has a behavior.
    this.payloadFold = undefined;
    // A node that has never committed must never take a fast path built on "the mirror already
    // agrees with me", so all three questions start answered YES — including for createRawText,
    // whose props are assigned here rather than through setText.
    //
    // LAST in the constructor, not beside the field assignments it replaces: `recordSubtreeEdit`
    // walks `parent` and `recordStructureEdit` reads `committed`, so both need this object fully
    // shaped. Recording earlier reads slots that are still holes.
    recordNewNode(this);
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

// The committed-state record. `tag` is the reactTag minted at first create, stable across
// clone-on-write (a clone keeps the family), kept so the native-driven Animated path can bind to it
// directly. `rootTag` lets a targeted re-commit (setNativeProps) find the surface.
export interface IMirror {
  handle: IFabricNode;
  tag: number;
  rootTag: IRootTag;
  props: IFabricProps;
  children: readonly ISymbioteNode[];
  viewName: string;
  parent: ISymbioteNode | undefined;
  // Back-reference to the node this record was written on, read by committedOf below and by
  // nothing else. See there for why a plain property read needs it and a WeakMap did not.
  owner: ISymbioteNode;
}

/**
 * The committed record for `node`, or `undefined` if it has never been committed - or if `node` is
 * not the raw retained node at all.
 *
 * That second case is the reason this is a function rather than a bare `node.committed` read. The
 * engine identifies a node BY IDENTITY, and the classic way to break that is to hand the engine a
 * wrapper instead of the node: a Vue `reactive()`/deep-`ref()` Proxy around a host element is the
 * one that actually happens (see the vue-adapter-reactivity skill; `shallowRef` is the fix).
 *
 * The old WeakMap caught this for free - a Proxy is a different object, so `mirror.get(proxy)` missed
 * and every imperative API bailed with a clear "node not committed". A plain property read does NOT:
 * a Proxy forwards `proxy.committed` straight to the target and hands back a real record, whose
 * `handle` Vue would then deep-wrap on the way out. That handle is a JSI host object; a Proxy around
 * it reaches `cloneNodeWithNewProps` and fails somewhere deep in native, far from the cause.
 *
 * So the identity check that was implicit in the WeakMap is explicit here: a record written on the
 * raw node names it, and `record.owner !== node` means whatever we were handed is not that node.
 * One reference comparison, and the wrap now fails LOUDER than it used to rather than quieter.
 */
export function committedOf(node: ISymbioteNode): IMirror | undefined {
  const record = node.committed;
  if (record === undefined) return undefined;
  if (record.owner !== node) {
    dlog(
      `node identity mismatch: committed record belongs to node=${debugNodeId(record.owner)}, ` +
        `not to the object handed in. A wrapped/proxied node (Vue reactive() or deep ref() around ` +
        `a host element) is the usual cause - hold host nodes with shallowRef.`,
    );
    return undefined;
  }
  return record;
}

export function createElement(
  component: string,
  isText = false,
  // The intrinsic tag this node came from, when it differs from the Fabric view name above. The
  // behavior registry is keyed by tag and the node only ever carries the resolved name, so an
  // adapter lowering `<Pressable>` has to hand the tag over here or the registration cannot fire
  // (host-behavior.ts, `attached`). Nothing is stored — the lookup happens once, right below.
  tag: string = component,
): ISymbioteNode {
  const node = new SymbioteNode(component, isText, {});
  // Gated on the boolean, not on the Map: this runs ~9 000 times per benchmark create, and an app
  // that registers nothing must pay one boolean read rather than a hash lookup per node.
  if (hasHostBehaviors()) attachHostBehavior(node, tag);
  return node;
}

export function createRawText(text: string): ISymbioteNode {
  return new SymbioteNode(RAW_TEXT_COMPONENT, false, { text });
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
/**
 * Change which Fabric view a node commits as, keeping the node's identity.
 *
 * The commit walk already re-creates a node whose `viewName` no longer matches its committed one —
 * that is how a `<Text>` moving in or out of another `<Text>` flips between RCTText and
 * RCTVirtualText (`commit.ts`, reason `view-kind`). This exposes the same door for a prop-driven
 * view choice, so `intrinsicWhen` is honoured on UPDATE and not only at create.
 *
 * The POLICY stays out of the engine: which prop decides, and which view it decides between, lives
 * in `HOST_PRIMITIVES` and is read by `resolveIntrinsicTag` in `@symbiote-native/components`. The
 * engine only knows how to swap the name — the same split every other spec-driven fold has here.
 *
 * A no-op when the name is unchanged, so a renderer may call it on every update without comparing
 * first.
 */
export function setNodeComponent(node: ISymbioteNode, component: string): void {
  if (node.component === component) return;
  node.component = component;
  // `dirty` alone is not enough: the walk's reuse test also requires the node be visited at all,
  // and a node whose own props did not change this tick is exactly the case that would be skipped.
  markDirty(node);
  markPropsDirty(node);
}

// The three mark* names are the MUTATION-SIDE vocabulary and they stay: every adapter-facing write
// path in this file calls them, and the rules that govern those paths are written in their terms
// (`.claude/rules/engine-mutations-must-mark-dirty.md`). What changed underneath is only WHERE the
// record lands — a set in `edit-buffer.ts` rather than a boolean on the node. Behaviour is
// identical, deliberately: the bubble, its early exit, and the ordering constraints below are
// preserved verbatim there, so this could not be the source of a behaviour change.
export function markDirty(node: ISymbioteNode): void {
  recordSubtreeEdit(node);
}

// The prop-write twin of markDirty: records this node's OWN prop edit and then bubbles the subtree
// question as usual. Every path that writes `node.props` must come through here - setProp and
// setText below, setNativeProps in commit.ts (which writes the record directly and so owes its own
// mark). Why the two are recorded independently rather than one implying the other: see
// `recordPropEdit`.
export function markPropsDirty(node: ISymbioteNode): void {
  recordPropEdit(node);
}

// The structural twin. Recorded against the PARENT whose child list changed - never against the
// moved child, for the same reason markDirty is not (see the structural ops below).
//
// Every caller must reach here BEFORE mutating `parent.children`. That ordering is load-bearing
// rather than stylistic, and `recordStructureEdit` is where the copy-on-write it protects lives.
//
// AND against the nearest RENDERABLE ancestor, when the parent is an anchor. An anchor never
// becomes a Fabric view: `renderableChildren` (commit.ts) flattens it away and its children take
// its place in the child list of the first non-anchor ancestor above it. So an append under an
// anchor changes THAT node's committed child list, and recording only against the anchor leaves the
// one node whose snapshot actually went stale looking untouched.
//
// The walk is a loop rather than one step because anchors nest — Angular mounts one per composed
// component, so an anchor's parent is very often another anchor.
//
// What it costs to omit, measured 2026-09-05 on the path that READS this record: `commitTargeted`
// bails on `hasPendingStructure`, so without this it rebuilt the ancestor's child set from a
// snapshot missing the new node and committed a tree the retained tree does not describe. The node
// reached Fabric only if some later commit happened to walk the tree, and never at all if nothing
// else asked for one. Predates the edit buffer — `markStructureDirty` has always been called on the
// direct parent — and is guarded by `anchor-structure-attribution.test.ts`.
export function markStructureDirty(parent: ISymbioteNode): void {
  recordStructureEdit(parent);
  let ancestor: ISymbioteNode | undefined = parent;
  while (ancestor !== undefined && isAnchor(ancestor)) {
    ancestor = parentOf(ancestor);
    if (ancestor !== undefined) recordStructureEdit(ancestor);
  }
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
  // The single choke point for the aria gate. `routeProp`'s other branches — class, style,
  // activeStyle, on* — return before reaching here and none of them can carry an alias, so every
  // `role` / `aria-*` write in the engine passes through this line.
  if (!node.hasAriaAlias && isAriaAliasKey(key)) node.hasAriaAlias = true;
  propStats.writes += 1;
  markPropsDirty(node);
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
// Would `pushClassStyle` republish an array byte-identical to the one already standing? Reads the
// last published array back out of `node.props.style` rather than remembering it in a field: that
// array IS the record of what was published, so there is nothing to keep in sync, and no shape
// change to the node or to IClassStyleParts.
//
// Sound because `pushClassStyle` is the ONLY writer of an array into that slot — both routeProp
// branches and setNodeHidden funnel through it — so a foreign array cannot be mistaken for ours,
// and a node whose props are still empty holds `undefined`, which is not an array, so the first
// write can never be swallowed.
function isAlreadyPublished(
  node: ISymbioteNode,
  parts: IClassStyleParts,
): boolean {
  const published = node.props.style;
  if (!Array.isArray(published)) return false;
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
  // This is NOT the naive skip the paragraph above forbids, and the array check is the difference.
  // Skipping on "the parts are unchanged" alone would break the restore path, because
  // setNativeProps writes node.props.style directly and a hoisted style constant would then never
  // be restored. But setNativeProps writes an OBJECT (commit.ts: `{...flattenStyle(prev),
  // ...flattenStyle(value)}`), never an array — so after any bypass isAlreadyPublished is false,
  // the re-push happens exactly as before, and the restore path is untouched.
  //
  // Exact rather than approximate: resolveClassName memoizes a class STRING to the same object, so
  // an unchanged class yields an identity-equal classStyle. It deliberately does not fire for an
  // object/array class value, which resolves fresh every call — the same place setProp's Object.is
  // already gives up on a style object, so no new asymmetry appears.
  if (isAlreadyPublished(node, parts)) return;
  // The third slot is APPENDED ONLY WHILE HIDDEN. Writing a permanent three-element array would
  // change the style payload of every node in every app for a state almost none of them are ever
  // in — and this project spent a day removing per-frame allocations, so a slot that is undefined
  // 99.9% of the time does not get to ride along on every style write.
  setProp(
    node,
    'style',
    parts.hiddenStyle === undefined
      ? [baseStyleOf(parts), explicitStyleOf(parts)]
      : [baseStyleOf(parts), explicitStyleOf(parts), parts.hiddenStyle],
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

// The explicit (non-class-derived) style half, for an adapter that builds its style prop up
// key-by-key (Angular's Ivy ɵɵstyleProp/setStyle) instead of handing over one whole object —
// it must merge onto this, not onto node.props.style directly, which may be the
// [classStyle, explicitStyle] array commitClassStyle writes above.
export function getExplicitStyle(node: ISymbioteNode): unknown {
  return node.styleParts?.explicitStyle;
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
//
// Each marks BEFORE touching `parent.children`, never after: the committed record may be aliasing
// that array, and markStructureDirty is what copies it out of the way. See there.
function detach(child: ISymbioteNode): void {
  const parent = parentOf(child);
  if (!parent) return;
  // Nominate, do not drop: this is reached from appendChild/insertBefore, so the node is about to
  // be re-parented and its pending entries must survive. `sweepDroppedEdits` decides at commit.
  nominateDroppedEdits(child);
  markStructureDirty(parent);
  unlink(parent, child);
}

export function appendChild(parent: ISymbioteNode, child: ISymbioteNode): void {
  // A node the sweep tore down can be put back — Svelte parks live subtrees offscreen across
  // commits. A WeakSet miss for anything freshly built, so the create path pays nothing.
  if (hasHostBehaviors()) reattachHostBehaviors(child);
  detach(child);
  markStructureDirty(parent);
  linkAppend(parent, child);
}

export function insertBefore(
  parent: ISymbioteNode,
  child: ISymbioteNode,
  beforeChild: ISymbioteNode,
): void {
  if (hasHostBehaviors()) reattachHostBehaviors(child);
  detach(child);
  markStructureDirty(parent);
  linkBefore(parent, child, beforeChild);
}

// Removal only NOMINATES a behavior for teardown; the commit sweep decides. A framework may spell
// a move as remove-then-reinsert (Solid does), so tearing down here kills the machine of a node
// that comes back alive in the same batch — see host-behavior.ts's markDetachCandidate.
export function removeChild(parent: ISymbioteNode, child: ISymbioteNode): void {
  if (hasHostBehaviors()) markDetachCandidate(child);
  // Unconditional, unlike the behavior nomination one line above: a behavior is rare and its sweep
  // is gated on any existing at all, while EVERY removed node holds buffer entries (`recordNewNode`
  // seeds all three) and every one of them is a leak if nothing sweeps.
  nominateDroppedEdits(child);
  markStructureDirty(parent);
  unlink(parent, child);
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
    const kids = childrenOf(node);
    if (kids.some(child => isAnchor(child) || isEmptyRawText(child)))
      census.flattenWidths.push(kids.length);
    for (const child of kids) stack.push(child);
  }
  census.flattenWidths.sort((left, right) => right - left);
  return census;
}
