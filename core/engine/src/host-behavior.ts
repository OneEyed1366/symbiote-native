// Per-TAG behavior on an engine node — the seam that lets a primitive's state machine live BELOW
// the framework instead of inside a framework component.
//
// WHY IT EXISTS. Vue, Svelte, Solid and Angular all optimize element subtrees and stop at a
// component boundary, so a primitive shipped as a component is charged a per-instance price in
// each framework's own currency (an instance, a props Proxy, anchor nodes, an LView). A primitive
// whose state the TEMPLATE never reads does not need to be a component at all — its machine only
// needs a per-node home, and the engine node is one. `.claude/rules/host-primitive-tier.md` has
// the tier model; this module is the tier-2 half of it.
//
// WHY A REGISTRY RATHER THAN A DIRECT IMPORT. `@symbiote-native/components` depends on
// `@symbiote-native/engine`, never the reverse, so the engine cannot import `createPressHandlers`
// and friends. CLAUDE.md's preferred answer to a registration problem — delete the indirection —
// is therefore unavailable here; the inversion is forced, not chosen.
//
// WHICH MEANS THE REGISTRATION ITSELF IS THE HAZARD, and it is the one CLAUDE.md spells out:
// Metro turns on `inlineRequires` for production only, moving a `require` down to the first place
// its binding is used as a VALUE, and a barrel's `export { X } from './x'` compiles to a lazy
// getter. A module whose only job is to call `registerHostBehavior` is never named as a value, so
// re-exporting it from a barrel means it NEVER EVALUATES in a release build — dev is perfect,
// release silently has no behavior. The one shape that works is a bare side-effect import that is
// never re-exported from that barrel, the pattern in
// `packages/slider/src/{react,vue,svelte,angular}/index.ts`:
//
//     import '../register';     // in the adapter entry — NOT `export * from '../register'`
//
// `registerHostBehavior` emits a `dlog` precisely so `DEBUG=1` answers "did my registration run at
// all" before anyone starts debugging the behavior itself.

import { dlog } from './debug';
import type { ISymbioteNode } from './node';

/**
 * A pure props -> props mapping a behavior applies on the way to the Fabric payload.
 *
 * It exists because a lowered element has no component body, and a wrapper's body is where the
 * per-primitive prop FOLDS live — TextInput's W3C aliases (`inputMode` -> `keyboardType`,
 * `readOnly` -> `editable`), Pressable's `disabled` -> `accessibilityState`. Every one of those was
 * silently dropped the moment the primitive lowered: the raw alias reached Fabric as a key no
 * ViewConfig declares, so nothing threw and nothing rendered differently in a headless test —
 * only the device showed a numeric keyboard that never appeared.
 *
 * NOT a hook on `setProp`, for the same reason `afterCommit` is not: `setProp` is the hottest path
 * in the engine. This runs once per node per payload build, and only for a node whose behavior
 * supplied one.
 *
 * MUST be pure and MUST NOT mutate its input — `node.props` is the live bag, and the folds beside
 * this one return their input by identity when there is nothing to do.
 */
export type IPayloadFold = (
  props: Readonly<Record<string, unknown>>,
) => Record<string, unknown>;

// What an owner does with a child it claims. See `IHostBehavior.claimedChildren`.
export type IClaimMode = 'beside' | 'wrap';

export interface IHostBehavior {
  // Listener names this behavior OWNS on its tag — engine event names, not `onX` props
  // ('press', 'startShouldSetResponder', ...). `setEventListener` stashes an app listener for an
  // owned name instead of writing it into `node.listeners`, so the behavior's own dispatcher keeps
  // the slot and the app's callback stays reachable beside it.
  //
  // Without this the two collide and the LAST writer wins, silently: `node.listeners` is a
  // single-slot Map, `press`/`pressIn`/`pressOut` are base ViewConfig events, and
  // `RESPONDER_EVENTS` makes `startShouldSetResponder`/`responderMove` listeners on any node at
  // all — so the app's own `onPress` would evict the machine from the very keys the gesture starts
  // on. The component wrapper used to mediate that pair by destructuring the app's callbacks out
  // before they reached the node; lowering removes the mediator, and this replaces it.
  readonly ownedListeners?: readonly string[];
  // Props the app writes on the OWNER that belong to the SLOT, as owner name -> slot name.
  //
  // The prop twin of `childHost`, and needed for the same reason: an adapter writes
  // `contentContainerStyle` on the ScrollView because that is where the app wrote it, while the
  // value styles the content view. A wrapper mediated that by rendering the value onto its inner
  // node; a lowered element has no wrapper, so the engine has to.
  //
  // A RENAME rather than a plain redirect, because the two names differ by design —
  // `contentContainerStyle` on the owner is `style` on the slot. The redirected write goes through
  // the slot's own `routeProp`, so it picks up style merging, class merging and the
  // already-published guard exactly as an authored prop would; nothing here re-implements them.
  //
  // Composing a CONSTANT with the redirected value is not this field's job — that is the slot's own
  // `payloadFold`, which a behavior assigns while building. Keeping the two apart is what lets the
  // rename stay a pure redirect: `flexDirection: 'row'` must win OVER a horizontal ScrollView's
  // `contentContainerStyle` (the wrapper writes `[contentContainerStyle, {flexDirection:'row'}]`),
  // and precedence is a property of the fold, not of the routing.
  readonly slotProps?: Readonly<Record<string, string>>;
  // The COMPLEMENT of `slotProps`: when set, every prop NOT named here routes to the slot under its
  // own name. `slotProps` still wins where both could answer, so an explicit rename stays a rename.
  //
  // WHY A COMPLEMENT AND NOT A LONGER MAP. RN's ActivityIndicator hands the spinner `...restProps`
  // and keeps only `onLayout` and `style` on its wrapper (`ActivityIndicator.js:99,113`), so the set
  // that moves is OPEN — every accessibility prop, every aria alias, `testID`, and whatever an app
  // writes next. A name map cannot express that, and the four adapters that wrote the passthrough
  // onto the wrapper instead had diverged from RN for as long as the component existed.
  //
  // It is a REDIRECT, so nothing has to be marked dirty afterwards: the write lands on the slot and
  // marks the slot. That is the whole reason this is not spelled as a `slotDerived` wildcard.
  readonly slotPropsExcept?: readonly string[];
  // The slot is a built SIBLING, not a container: the app's children stay on the OWNER and land
  // AFTER it.
  //
  // WHY IT EXISTS. `childHost` answers two questions at once — which node an owner prop redirects
  // onto, and which node the app's children go under — and every primitive before ImageBackground
  // gave the same answer to both. RN's ImageBackground gives different ones: the absolutely-filled
  // `<Image>` takes `imageStyle` and the whole `...props` spread (ImageBackground.js:80-101), while
  // `{children}` sit BESIDE it in the View (ImageBackground.js:102) so they paint on top.
  //
  // And it is not a JSX preference upstream could have collapsed. Android's `<Image>` is a
  // `ReactImageView extends ImageView`, which is not a `ViewGroup`, so a child mounted inside it is
  // an `addView` crash — the reason `ImageBackground` exists at all rather than `<Image>` taking
  // children as it did before RN 0.50.
  //
  // Read only where `childHost` already decides placement (`hostFor` / `indexFor` in node.ts), both
  // of which sit behind the slot branch, so a primitive without a slot pays nothing and one with an
  // ordinary slot pays a probe `hostFor` was making anyway.
  readonly slotTakesNoChildren?: boolean;
  // Owner prop names the SLOT's payload is derived from. Writing one marks the slot's props dirty.
  //
  // The third case in the owner/slot family, and the one neither of the other two can express. A
  // slot prop is either a RENAME of an owner prop (`slotProps`) or a CONSTANT (the slot's own
  // `payloadFold`); `collapsableChildren` is neither — it is `maintainVisibleContentPosition !==
  // undefined || snapToAlignment !== undefined`, computed from props that stay on the owner. So the
  // slot's fold reads the owner, and this is what makes it re-run: `markPropsDirty` bubbles UP, so
  // an owner write reaches every ancestor and never the slot, and `reconcile` skips a subtree whose
  // root is not dirty. Without it the derived value is correct at mount and frozen forever after.
  //
  // Names rather than a hook, for the reason `ownedListeners` is names: the fold stays pure and the
  // engine keeps deciding when payloads are built. Read from `setProp`, PAST its identity guard, so
  // a re-render writing the same value dirties nothing — the guard is what keeps this off the hot
  // path in practice, and `node.childHost` turns away every node that has no slot before the
  // registry is touched at all.
  readonly slotDerived?: readonly string[];
  // Children the owner takes out of the ordinary flow, by FABRIC component name, and what it does
  // with each.
  //
  // The child twin of `slotProps`: a ScrollView's RefreshControl is not one of the content view's
  // children, and the two platforms disagree about what it IS instead —
  //
  //   beside   a sibling before the content view      RN iOS,     ScrollView.js:1844
  //   wrap     the scroll view's own PARENT           RN Android, ScrollView.js:1856
  //
  // and the second is a native constraint rather than a JSX one: an Android ScrollView takes
  // exactly one child, so a sibling refresh control is an `addViewAt` crash.
  //
  // BY FABRIC NAME, unlike the registry itself, and the difference is that a claim is per-PARENT.
  // Keying the registry that way would attach the press machine to every plain `View`, because a
  // Pressable resolves to `RCTView` like any other; a claim is only consulted for children of one
  // owner, so `PullToRefreshView` / `AndroidSwipeRefreshLayout` is unambiguous there and the node
  // needs no field carrying its intrinsic tag.
  readonly claimedChildren?: Readonly<Record<string, IClaimMode>>;
  // Runs after an APP child has been placed under this node — the counterpart of `buildStructure`,
  // which owns the structure the behavior builds for itself.
  //
  // WHY IT EXISTS. RN's TouchableNativeFeedback renders no view of its own: it clones its props
  // onto `React.Children.only(children)` (TouchableNativeFeedback.js:289,339). A tag reproducing
  // that has nothing to do at `attach` — the node it must configure does not exist yet, and it is
  // the framework's, not the behavior's. This is the only beat at which it appears.
  //
  // The node is placed by the time this runs, so a behavior may adopt it as `node.childHost`
  // (which is what makes `slotDerived` reach it) and write on it through the ordinary mutation API.
  //
  // Fires for EVERY app child, so a behavior taking only the first says so itself. And it costs one
  // WeakMap probe per append, beside the WeakSet probe `reattachHostBehaviors` already pays there.
  onChildInserted?(node: ISymbioteNode, child: ISymbioteNode): void;
  // Builds the primitive's OWN internal subtree, once, and returns the node the app's children
  // belong under — or undefined when they belong directly on the host.
  //
  // WHY IT EXISTS. `foldPayload` gave a lowered primitive its wrapper's prop mapping; this gives it
  // the wrapper's COMPOSITION. A ScrollView is a scroll view wrapping a content view, an
  // ImageBackground is a view holding an absolutely-filled image; in a component that second node
  // is built by the wrapper's body, and the wrapper's body is exactly the per-instance cost
  // lowering deletes. Until this seam existed a composed primitive could not be lowered at all,
  // whatever its props did — which is why the tier audit reads "state the template never reads" and
  // still leaves the composed primitives out.
  //
  // RUNS BEFORE `attach`, so a machine can see its own slot. It is the node's shape, not its
  // runtime, and `attach`'s "the node has its component and nothing else" is about PROPS.
  //
  // RUNS EXACTLY ONCE, at `attachHostBehavior` — never from `reattachSubtree`. A parked subtree
  // comes back with its internal children intact (they are ordinary `node.children` and travel
  // with it), so rebuilding would duplicate them, and the slot's IDENTITY would change under app
  // children still pointing at the old one. `attach` is re-runnable because a machine must restart;
  // structure is not, because it never stopped.
  //
  // Builds through the ordinary mutation API — `createElement` + `appendChild` — so the internal
  // nodes are engine nodes like any other and the commit walk needs to know nothing about them.
  buildStructure?(node: ISymbioteNode): ISymbioteNode | undefined;
  // Runs at createElement, before any prop is routed — the node has its component and nothing
  // else. Put the per-node runtime here (timers, flags, a listener installed via
  // setEventListener); read props at event time, not now.
  attach(node: ISymbioteNode): void;
  // Runs after the commit that first gives the node a Fabric tag — the half `attach` CANNOT do.
  //
  // WHY IT IS SEPARATE. `Pressable` never needed it: its machine only reacts to events that arrive
  // long after commit, so a tagless node at `attach` is enough. Every other lowering candidate needs
  // a committed tag AT SETUP TIME — TextInput's `autoFocus` dispatches a view command at mount,
  // TouchableOpacity's `useNativeDriver: true` connects an Animated node to a view, ScrollView's
  // sticky path calls `attachNativeEvent`. React commits synchronously, so those would work there by
  // accident; Vue, Solid and Angular commit a tick later, so the same code silently no-ops —
  // lowered on paper, dead on device, with the headless suite green.
  //
  // Optional, and the ENGINE owns its lifecycle: registered by `attachHostBehavior`, dropped by
  // `detachSubtree`, re-armed by `reattachSubtree`. A behavior can equally call `whenCommitted` by
  // hand from `attach` — `animated/event.ts` does — but it then owes its own cancel in `detach`, and
  // forgetting that leaks a waiter pointed at a dead node. This exists to remove that footgun.
  attachAfterCommit?(node: ISymbioteNode): void;
  // Runs when a `wrap` claim puts a node above the owner, and again with `undefined` when it
  // leaves. Only the WRAP mode notifies: `beside` changes nothing a behavior has to answer for,
  // while a wrap moves where the owner's own style belongs.
  //
  // The wrapper is the APP's node, so the behavior cannot have given it a `payloadFold` at
  // creation the way it does for a node its own `buildStructure` built. This is where it can —
  // RN puts the layout half of the scroll view's style on the refresh layout and the visual half
  // on the scroll view, and neither node can work that out alone.
  onWrapChange?(owner: ISymbioteNode, wrapper: ISymbioteNode | undefined): void;
  // Runs when the app WIRES or UNWIRES one of `ownedListeners`, never on a re-render that hands the
  // same name a fresh closure. `wired` is the new state.
  //
  // WHY NOT `afterCommit`, which is where this obviously belongs. A behavior can owe payload work to
  // a listener's mere presence — ScrollView puts `onLayout` on its content view only when the app
  // passed `onContentSizeChange`, exactly as RN and every wrapper do, because `onLayout` is a gated
  // event and wiring it unconditionally buys a native event nobody reads. But a listener flip
  // changes no payload BY ITSELF, so the commit that follows it is a no-op, and `commitContainer`
  // returns above `runPostCommitHooks` on a no-op (`engine-mutations-must-mark-dirty.md`). The hook
  // that would react is precisely the one that never runs.
  //
  // Synchronous, so the write lands before the FIRST commit rather than a commit later — the
  // wrapper it is reproducing has no two-pass mount either.
  onOwnedListenerChange?(
    node: ISymbioteNode,
    name: string,
    wired: boolean,
  ): void;
  // Runs after EVERY commit while the node is attached, not just the first.
  //
  // WHY IT IS NOT `attachAfterCommit` REPEATED. `Pressable`'s machine is driven entirely by events,
  // so it never needs to look at a prop it was not handed. A controlled `TextInput` does: RN's
  // contract is that when the app's `value` diverges from what native last reported, JS commands
  // the text back down — and that comparison is triggered by a PROP CHANGE, not by an event. In a
  // component the render is what re-runs it; a lowered element has no render, so the commit is the
  // only equivalent beat.
  //
  // A prop-write hook on `setProp` was the obvious alternative and is the wrong shape: `setProp` is
  // the hottest path in the engine (32 001 writes on one benchmark create) and would need a per-node
  // registry lookup on every one of them. This costs a Set iteration per commit over ONLY the nodes
  // whose behavior asked for it — zero for every app that registers none.
  //
  // Reads `node.props`, which by here holds the values this commit published.
  //
  // IT DOES RUN WHEN YOUR OWN FOLD MADE THE COMMIT EMPTY, since 2026-09-10 — and until then it did
  // not, which is the opposite of what a behavior needs. A prop a behavior STRIPS from the payload
  // (TouchableOpacity's `disabled`, Button's `title`/`color`) commits byte-identically, and
  // `commitContainer` used to return on that above the drain: the hook that must react to the flip
  // was the one the flip could not wake. The two drains are split now, and only the tag-dependent
  // half (`attachAfterCommit`) is still gated on a commit that reached Fabric. See
  // `runCommittedHooks`.
  afterCommit?(node: ISymbioteNode): void;
  // Runs once the node is known to have left the tree for good. Must release everything `attach`
  // took — a timer left behind outlives the tree that owned it.
  detach(node: ISymbioteNode): void;
  // The wrapper-body prop folds this primitive owes its lowered form. See IPayloadFold.
  readonly foldPayload?: IPayloadFold;
}

const behaviors = new Map<string, IHostBehavior>();

// Nodes that `removeChild` unlinked and that may or may not be coming back. See
// `sweepDetachedBehaviors` for why the answer is not known until commit.
const detachCandidates = new Set<ISymbioteNode>();

// Nodes the sweep has torn down. A torn-down node can still be re-inserted — see
// `reattachHostBehaviors` — and this is what tells an insert whether it must walk at all, so the
// common case (building a fresh tree) never walks anything.
const tornDown = new WeakSet<ISymbioteNode>();

// The behavior a node actually got, remembered from its one and only registry lookup.
//
// THE REGISTRY IS KEYED BY INTRINSIC TAG AND THE NODE IS NOT. `node.component` is the FABRIC view
// name: every adapter resolves the tag through `descriptorFor` before calling `createElement`, so
// `view` arrives as `RCTView`. Keying the registry by Fabric name instead is not an
// option — a pressable resolves to `RCTView` like any other view, so the press machine would
// attach to every plain `View` in the app. So the tag alphabet is used EXACTLY ONCE, at
// `attachHostBehavior`, where the caller still holds it; every later lookup reads this map.
//
// Found by a peer session probing the installed shape, not by a unit test: the tests built their
// subject with `createElement(PRESSABLE_TAG)`, which passes the tag AS the Fabric name and makes
// the key match by accident. No adapter constructs a node that way, so the registration could
// never have fired in an app while all six break-tests kept failing correctly on their own axes.
const attached = new WeakMap<ISymbioteNode, IHostBehavior>();

// The gate. `createElement` and `removeChild` are the two hottest paths in the engine (9 002 and
// ~1 000 calls on one benchmark row set), so neither may pay a Set insert for a feature no app
// uses yet. While this is false both paths cost one boolean read, the same discipline as `isDebug`.
let hasBehaviors = false;

export function registerHostBehavior(
  component: string,
  behavior: IHostBehavior,
): void {
  dlog(`registerHostBehavior: ${component}`);
  behaviors.set(component, behavior);
  hasBehaviors = true;
}

// Read access to the registry, so an audit can DERIVE what a behavior owns instead of restating it.
// The one that matters: a name in `ownedListeners` is only reachable if `routeProp` also treats it
// as a registered event — otherwise the app's callback lands in `node.props` and the machine, which
// reads the stash, never sees it. That set difference is a test
// (`core/components/src/behaviors/owned-listeners-are-routable.test.ts`) and it needs this to stay
// derived rather than becoming another hand-written list.
export function hostBehaviorFor(tag: string): IHostBehavior | undefined {
  return behaviors.get(tag);
}

export function hasHostBehaviors(): boolean {
  return hasBehaviors;
}

// What an owner prop is called on the slot, or undefined when it belongs to the owner after all.
//
// Called from `routeProp` only for a node that HAS a slot (`node.childHost !== undefined`), which
// is what keeps a WeakMap probe off the hot path: every other node is turned away by one field
// read, the same gate `payloadFold` uses one layer down.
export function slotPropNameFor(
  node: ISymbioteNode,
  key: string,
): string | undefined {
  const behavior = attached.get(node);
  if (behavior === undefined) return undefined;
  const named = behavior.slotProps?.[key];
  if (named !== undefined) return named;
  const except = behavior.slotPropsExcept;
  if (except !== undefined && !except.includes(key)) return key;
  return undefined;
}

// Does this owner's slot host the app's children, or is it a built sibling they land beside? See
// `slotTakesNoChildren`. Same `node.childHost` gate as every other probe here: the two callers ask
// only after the field said there is a slot at all.
export function slotTakesChildren(node: ISymbioteNode): boolean {
  return attached.get(node)?.slotTakesNoChildren !== true;
}

// Nodes a behavior built that are NOT the slot, and whose payloads derive from the owner's props.
//
// `slotDerived` marks `node.childHost` and nothing else, which is one hop — enough for ScrollView,
// whose only derived node IS the slot, and not enough for a primitive whose `buildStructure` builds
// a chain. Button builds view > text > raw text and folds two of them from the same three owner
// props; without this the deeper nodes freeze at their mount values, and the workaround is to write
// them from inside a fold whose contract says it MUST be pure.
//
// A WeakMap rather than a field, for the reason `stashed` is one: this exists only for the handful
// of nodes a composed behavior built, and a field costs a shape transition on every node in every
// app. It is read only inside the `slotDerived` branch, which has already paid a WeakMap probe.
const derived = new WeakMap<ISymbioteNode, ISymbioteNode[]>();

// Called from `buildStructure` for each node past the slot. Not idempotent-checked: structure is
// built exactly once (`attachHostBehavior`, never `reattachSubtree`), so a second call would be a
// bug worth seeing rather than one worth absorbing.
export function addDerivedNode(
  owner: ISymbioteNode,
  node: ISymbioteNode,
): void {
  const existing = derived.get(owner);
  if (existing === undefined) derived.set(owner, [node]);
  else existing.push(node);
}

export function derivedNodesOf(
  owner: ISymbioteNode,
): readonly ISymbioteNode[] | undefined {
  return derived.get(owner);
}

// Called from `setEventListener` on a PRESENCE flip of an owned name, and only there — the caller
// has already established that this node owns the name, so the WeakMap probe is one it just paid.
export function notifyOwnedListenerChange(
  node: ISymbioteNode,
  name: string,
  wired: boolean,
): void {
  attached.get(node)?.onOwnedListenerChange?.(node, name, wired);
}

// Called from the two inserts once the child is in place. See `onChildInserted`.
export function notifyChildInserted(
  node: ISymbioteNode,
  child: ISymbioteNode,
): void {
  attached.get(node)?.onChildInserted?.(node, child);
}

// Called from the two structural entry points when a wrap claim lands or leaves. See
// `onWrapChange`.
export function notifyWrapChange(
  owner: ISymbioteNode,
  wrapper: ISymbioteNode | undefined,
): void {
  attached.get(owner)?.onWrapChange?.(owner, wrapper);
}

// What this owner does with a child of that Fabric component, or undefined when it does not claim
// it at all. See `claimedChildren`.
export function claimModeFor(
  node: ISymbioteNode,
  component: string,
): IClaimMode | undefined {
  return attached.get(node)?.claimedChildren?.[component];
}

// Does this owner key feed the slot's payload? See `slotDerived`. Same `node.childHost` gate as
// above keeps the WeakMap probe off every node that has no slot.
export function slotDerivesFrom(node: ISymbioteNode, key: string): boolean {
  return attached.get(node)?.slotDerived?.includes(key) === true;
}

// The app's listeners for names a behavior owns, per node. Not on the node: this exists only for
// nodes carrying a behavior, and adding a field for it would pay a shape transition on every node
// in every app for a feature almost none of them use.
const stashed = new WeakMap<ISymbioteNode, Map<string, unknown>>();

// Takes the NODE, not a component string: the caller (`setEventListener`) has only the Fabric name
// by then, which is not the registry's alphabet. Reads the same map `attachHostBehavior` wrote.
export function ownsListener(node: ISymbioteNode, name: string): boolean {
  return attached.get(node)?.ownedListeners?.includes(name) === true;
}

export function stashAppListener(
  node: ISymbioteNode,
  name: string,
  listener: unknown,
): void {
  let bag = stashed.get(node);
  if (bag === undefined) {
    bag = new Map();
    stashed.set(node, bag);
  }
  if (listener === undefined) bag.delete(name);
  else bag.set(name, listener);
}

// What the app wrote for an owned event name — the behavior's OUTPUT target. Undefined when the
// app wired nothing, which is an ordinary case, not an error.
export function appListenerFor(node: ISymbioteNode, name: string): unknown {
  return stashed.get(node)?.get(name);
}

// `tag` is the INTRINSIC tag the adapter started from, not the resolved Fabric name it put on the
// node. Defaulted to `node.component` so an adapter that has not been taught to pass it keeps
// working for a behavior registered under a Fabric name — no adapter registers one, so in practice
// the default simply never matches and costs one failed lookup.
export function attachHostBehavior(node: ISymbioteNode, tag: string): void {
  const behavior = behaviors.get(tag);
  if (behavior === undefined) return;
  attached.set(node, behavior);
  // A field rather than a lookup at payload-build time: `fabricProps` runs per node per commit and
  // must not pay a Map probe to discover that almost nothing has a fold.
  node.payloadFold = behavior.foldPayload;
  // Shape before runtime: `attach` may want to read `node.childHost`, and nothing in `attach`'s
  // contract depends on the node being childless. Deliberately NOT repeated in `reattachSubtree` —
  // see `buildStructure`.
  if (behavior.buildStructure !== undefined) {
    node.childHost = behavior.buildStructure(node);
  }
  behavior.attach(node);
  if (behavior.attachAfterCommit !== undefined) awaitingCommit.add(node);
  if (behavior.afterCommit !== undefined) committedEachTime.add(node);
}

// Nodes whose behavior declared `afterCommit`. Separate from `awaitingCommit` because the two have
// opposite lifetimes: one empties as its nodes commit, this one holds until teardown.
const committedEachTime = new Set<ISymbioteNode>();

// Nodes whose behavior declared `attachAfterCommit` and whose first commit has not happened yet.
//
// A plain Set rather than a call into `whenCommitted`: `commit.ts` already imports this module, so
// reaching back for it would close an import cycle. Metro's `inlineRequires` has made module
// evaluation order a real hazard here rather than a theoretical one (see this file's own
// registration comment), so the dependency stays one-directional and commit DRAINS this instead.
const awaitingCommit = new Set<ISymbioteNode>();

/**
 * Run the deferred half of every behavior whose node has now been committed. Called from the commit
 * path immediately after `completeRoot`, where fresh Fabric tags have just been assigned.
 *
 * `isCommitted` is passed in for the same no-cycle reason — `committedOf` lives in `commit.ts`. A
 * still-uncommitted node stays in the set: a create superseded before it ever reached Fabric waits
 * for the commit that lands it, and `detachSubtree` drops it if that commit never comes.
 */
export function runDeferredAttaches(
  isCommitted: (node: ISymbioteNode) => boolean,
): void {
  // The gate: an app registering no behavior pays one Set-size read per commit, matching the
  // discipline `hasBehaviors` sets for `createElement`.
  if (awaitingCommit.size === 0) return;
  for (const node of awaitingCommit) {
    if (!isCommitted(node)) continue;
    awaitingCommit.delete(node);
    attached.get(node)?.attachAfterCommit?.(node);
  }
}

/**
 * The recurring beat. Split from `runDeferredAttaches` because the two answer different questions:
 * `attachAfterCommit` needs a FRESH FABRIC TAG, so it belongs below `completeRoot` and must not run
 * on a commit that made no native call; `afterCommit` needs only "props were published", which a
 * no-op commit satisfies just as well.
 *
 * Keeping them together made `afterCommit` unreachable for exactly the props a behavior owns: a fold
 * that STRIPS a prop makes its own commit byte-identical, `commitContainer` returns above the drain,
 * and the hook never sees the flip. TouchableOpacity's re-settle on `disabled` is the case
 * (`disabled` is a MACHINE_ONLY key), Button's `title`/`color` the other.
 *
 * SETUP STILL RUNS BEFORE THE BEAT on the first commit, and the order is load-bearing: a node
 * carrying both hooks has `attachAfterCommit` seed the mirrors `afterCommit` compares against. The
 * caller preserves it by calling this AFTER `runDeferredAttaches` on the changed path — the no-op
 * path has no setup to run, since a node with no Fabric tag has not committed at all.
 */
export function runCommittedHooks(
  isCommitted: (node: ISymbioteNode) => boolean,
): void {
  if (committedEachTime.size === 0) return;
  for (const node of committedEachTime) {
    if (!isCommitted(node)) continue;
    attached.get(node)?.afterCommit?.(node);
  }
}

// `removeChild` is NOT the destroy signal, and reading it as one is the bug this indirection
// exists to avoid. Engine-side it looks like one — a reorder goes through `detach` inside
// appendChild/insertBefore and never lands in removeChild — but a FRAMEWORK can spell a move as
// remove-then-reinsert. Solid does, in `solid-js/universal`: `replaceNode` (universal.cjs:186) is
// `insertNode` + `removeNode`, and `reconcileArrays` calls it at :157 for a node that IS in the
// new array and is needed at a later index. Its sibling call at :130 is guarded by
// `if (!map || !map.has(a[aStart]))` and removes only genuinely absent nodes — one guarded call
// and one not, which is why a quick read of that file says "removeChild means gone".
//
// Tearing down there would kill the machine of a node that returns alive a few operations later,
// in the same batch: long-press silently stops working after certain list reorders, on device
// only, with nothing red. So removal only nominates.
export function markDetachCandidate(node: ISymbioteNode): void {
  detachCandidates.add(node);
}

// Commit is where a removal is CHEAPEST to distinguish from a move — a node unlinked and
// reinserted before the commit is back in the tree by now, which covers Solid's replaceNode. It is
// NOT a proof of death, and the earlier version of this comment claimed it was. Svelte parks LIVE
// nodes offscreen across commits and sometimes across seconds: `detachFromParent`
// (adapters/svelte/src/dom-shim/shim-node.ts) moves a node into a DocumentFragment that has no
// engine node, calls engineRemoveChild AND requestCommit, and Svelte fully intends to bring it
// back — from a parked `{#if}` branch, from `each.js`'s destroy_effects, and worst, from
// boundary.js's move_effect while a pending snippet shows, which returns when async work resolves.
// So a sweep can and does tear down a node that comes back, which is why `attach` is re-runnable
// (reattachHostBehaviors) rather than why the sweep tries to be cleverer. The machine RESTARTS on
// re-insert instead of surviving an arbitrary absence; a parked subtree is offscreen, so nobody is
// mid-gesture in it, and teardown staying unconditional means there is no leak mode.
//
// The subtree walk lives here rather than at removal, and is cheaper for it: only the nodes that
// actually left are walked.
//
// `onDetached` runs for EVERY node of a genuinely-removed subtree, whether or not it carries a
// behavior — it is how the engine's other per-node lifetime state (an Animated subscription, see
// `animated/host-binding.ts`) gets the same "did it really leave" answer this sweep exists to
// compute. Passed in for the no-cycle reason `runDeferredAttaches`' predicate is: this module must
// keep pointing one way, and Metro's `inlineRequires` makes that a live hazard rather than taste.
export function sweepDetachedBehaviors(
  topLevel: readonly ISymbioteNode[],
  onDetached: (node: ISymbioteNode) => void,
): void {
  if (detachCandidates.size === 0) return;
  // A surface's top-level nodes carry `parent === undefined` by design (surface.ts), and
  // `commitChildren` re-lists them without going through appendChild — so for those the parent
  // check alone would report a live node as gone.
  const seen = new Set<ISymbioteNode>();
  for (const node of detachCandidates) {
    if (node.parent !== undefined || topLevel.includes(node)) continue;
    detachSubtree(node, seen, onDetached);
  }
  detachCandidates.clear();
}

// Tear a subtree down unconditionally — the SURFACE teardown path, where there is nothing to
// decide: `disposeRoot` drops the root container, so every node under it has left for good whatever
// any framework intended.
//
// It exists because the sweep above cannot answer this. The sweep only sees nodes a `removeChild`
// NOMINATED, and an unmount removes nothing — the adapter drops the whole surface. So before this,
// `disposeRoot` touched no node at all: `committedOf` reads `node.committed`, a field on the node,
// so every node of a dead surface still answered `isCommitted` and stayed in `committedEachTime`,
// drained on every later commit anywhere in the process, with its timers still armed.
export function teardownSubtree(
  node: ISymbioteNode,
  onDetached: (node: ISymbioteNode) => void,
): void {
  detachSubtree(node, new Set(), onDetached);
}

// `seen` guards the one overlap the candidate set can contain: a removed parent and a removed
// descendant of it are both nominated, and without it the descendant is detached twice. `tornDown`
// guards the same overlap ACROSS calls — a node the sweep already released and that `disposeRoot`
// then walks again, which is the ordinary shape of an unmount after the framework emptied the tree.
function detachSubtree(
  node: ISymbioteNode,
  seen: Set<ISymbioteNode>,
  onDetached: (node: ISymbioteNode) => void,
): void {
  if (seen.has(node) || tornDown.has(node)) return;
  seen.add(node);
  onDetached(node);
  // Marked whether or not THIS node carries a behavior: the mark is what tells a later insert to
  // walk, and the node re-inserted is usually a plain container whose DESCENDANT holds the
  // machine. Gating the mark on `behaviors.has` made the row wrapper unmarked and the whole walk
  // skip — the first version of the parked-node test caught exactly that.
  tornDown.add(node);
  // Drop a deferral the node never got to run. NO TEST CAN SEE THIS, and it is kept anyway —
  // stated rather than left as apparent coverage. The `isCommitted` predicate in the drain already
  // stops such a node from firing, so removing this line changes no observable behaviour; what it
  // changes is that a node created and torn down inside one tick stays in the Set forever, holding
  // a strong reference to a dead subtree. A leak, not a wrong result, and this file's break-test
  // discipline correctly reports it as unfalsifiable.
  awaitingCommit.delete(node);
  // The recurring hook stops with the node, and unlike the deferral above this one has a visible
  // consequence if forgotten: a torn-down node would keep being asked to reconcile props against a
  // subtree that has left the tree, on every commit, forever.
  committedEachTime.delete(node);
  // The map, not the registry: by here only the Fabric name is left on the node.
  attached.get(node)?.detach(node);
  for (const child of node.children) detachSubtree(child, seen, onDetached);
}

// Re-arms a node the sweep tore down but that the framework put back. Called from appendChild and
// insertBefore, and it is a WeakSet miss — no walk at all — for every node in a freshly built
// tree, which is the path that runs ~9 000 times per benchmark create.
export function reattachHostBehaviors(node: ISymbioteNode): void {
  if (!tornDown.has(node)) return;
  reattachSubtree(node);
}

function reattachSubtree(node: ISymbioteNode): void {
  if (tornDown.has(node)) {
    tornDown.delete(node);
    const behavior = attached.get(node);
    behavior?.attach(node);
    // Re-arm the deferred half too. A parked node usually returns with its tag intact, so this
    // fires on the next drain — but re-arming is what keeps `attach` and `attachAfterCommit` a
    // PAIR. Restore only one and a behavior that splits its setup across the two comes back
    // half-initialised, which is the failure this seam exists to prevent.
    if (behavior?.attachAfterCommit !== undefined) awaitingCommit.add(node);
    if (behavior?.afterCommit !== undefined) committedEachTime.add(node);
  }
  for (const child of node.children) reattachSubtree(child);
}

// Test-only. A registry is module state, so a suite that registers a behavior leaks it into every
// later test in the same file unless it is cleared.
export function clearHostBehaviors(): void {
  behaviors.clear();
  detachCandidates.clear();
  awaitingCommit.clear();
  committedEachTime.clear();
  hasBehaviors = false;
}
