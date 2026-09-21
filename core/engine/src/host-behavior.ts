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

import { parentsOf, teardownSubtreesOf } from './host-access';
import { recordSetTag } from './mutation-buffer';
import { dlog } from './debug';
import type { ISymbioteNode } from './node';

/**
 * A pure props -> props mapping a behavior applies on the way to the Fabric payload.
 *
 * It exists because a tag has no component body, and a wrapper's body is where the per-primitive
 * prop FOLDS live — TextInput's W3C aliases (`inputMode` -> `keyboardType`, `readOnly` ->
 * `editable`), Pressable's `disabled` -> `accessibilityState`. Every one of those was silently
 * dropped the moment the wrapper went: the raw alias reached Fabric as a key no ViewConfig
 * declares, so nothing threw and nothing rendered differently in a headless test — only the device
 * showed a numeric keyboard that never appeared.
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
  // before they reached the node; a tag has no mediator, and this replaces it.
  readonly ownedListeners?: readonly string[];
  // Props the app writes on the OWNER that belong to the SLOT, as owner name -> slot name.
  //
  // The prop twin of `childHost`, and needed for the same reason: an adapter writes
  // `contentContainerStyle` on the ScrollView because that is where the app wrote it, while the
  // value styles the content view. A wrapper mediated that by rendering the value onto its inner
  // node; a tag has none, so the engine has to.
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
  //
  // `SLOT_DERIVED_ALL` is the fourth case and the two clone-primitives are why it exists. A
  // `cloneElement` owner does not derive its slot from a LIST of names — it re-clones on every
  // render, whatever changed — so naming the keys is an optimisation, and one that has to stay
  // exactly in step with a rule living in `SymbioteFabricProps.cpp`. Two lists that must agree, with
  // a silent failure mode (the clone goes stale on the one prop a list forgot) is the mirror shape
  // this project deletes on sight, and here the honest spelling is also the cheaper one to keep.
  //
  // It costs a false dirty on an owner prop the clone does not carry. For these two tags that is
  // nearly empty: the owner is an ANCHOR whose props reach Fabric nowhere else, so every name it
  // holds is either cloned or consumed by the press machine, and the machine's four are written once
  // at mount rather than per render.
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
  // WHY IT EXISTS. `foldPayload` gives a tag its wrapper's prop mapping; this gives it the
  // wrapper's COMPOSITION. A ScrollView is a scroll view wrapping a content view, an
  // ImageBackground is a view holding an absolutely-filled image; in a component that second node
  // is built by the wrapper's body, and that body is exactly the per-instance cost a tag deletes.
  // Until this seam existed a composed primitive could not become a tag at all, whatever its props
  // did.
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
  // long after commit, so a tagless node at `attach` is enough. Every other behavior needs a
  // committed tag AT SETUP TIME — TextInput's `autoFocus` dispatches a view command at mount,
  // TouchableOpacity's `useNativeDriver: true` connects an Animated node to a view, ScrollView's
  // sticky path calls `attachNativeEvent`. React commits synchronously, so those would work there by
  // accident; Vue, Solid and Angular commit a tick later, so the same code silently no-ops — dead
  // on device, with the headless suite green.
  //
  // Optional, and the ENGINE owns its lifecycle: registered by `attachHostBehavior`, dropped by
  // `detachSubtree`, re-armed by `reattachSubtree`. A behavior can equally call `whenCommitted` by
  // hand from `attach` — `animated/event.ts` does — but it then owes its own cancel in `detach`, and
  // forgetting that leaks a waiter pointed at a dead node. This exists to remove that footgun.
  attachAfterCommit?(node: ISymbioteNode): void;
  // `onWrapChange` WAS HERE UNTIL 2026-09-18, and what replaced it is worth naming rather than
  // leaving a dead hook to misdirect the next reader. It fired when a `wrap` claim put a node above
  // an owner, so a behavior could install a `payloadFold` on a wrapper it had not built — and its
  // own doc gave the reason: "neither node can work that out alone." That was true of a per-node
  // JS fold and false of the engine. ScrollView's Android split is `foldScrollViewProps` /
  // `foldRefreshWrapperProps` now, reached off the two tags, with the wrapper reading the child it
  // wraps through `IFirstChild` — so both nodes work it out from the tree and nothing needs to be
  // told when the shape changes. Its only implementor went with it; re-add it when something needs
  // a wrap EVENT rather than a wrap-derived payload.
  //
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
  // component the render is what re-runs it; a tag has no render, so the commit is the only
  // equivalent beat.
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
  /**
   * This primitive's own prop folds. See IPayloadFold.
   *
   * NO PRODUCTION BEHAVIOR DECLARES ONE since 2026-09-18 — the sticky header's was the last, and it
   * is `foldStickyHeaderProps` in `SymbioteFabricProps.cpp` now. So this reads as a leftover, and
   * the question this codebase asks of one is what it REACHES rather than who uses it today. Two
   * answers, and either alone would keep it:
   *
   * - It is the JS ARM of every cost measurement in `tag-rule-cost.itest.ts`. That file prices a
   *   rule by running it on both sides of the wire with the payloads asserted equal key by key
   *   first; without a fold there is no second arm, and the ~9-31 us-per-node figures every port in
   *   this migration was justified by could not be taken again.
   * - It is the declared seam a third-party behavior would extend. A tag rule is ours to write in
   *   C++; a package that ships its own primitive has no such option.
   *
   * What it is NOT any more is where a Symbiote primitive puts its platform props. A new one that
   * reaches for this is one whose rule belongs in the engine — read `SymbioteFabricProps.h` first.
   */
  readonly foldPayload?: IPayloadFold;
  /**
   * Resolve `source` / `defaultSource` / `loadingIndicatorSource` on the way IN — Image's, and only
   * Image's. See `image-source-write.ts`.
   *
   * It is declared here rather than inferred from the tag because it is a statement about what the
   * primitive's props MEAN, which is exactly what a behavior is for. And it is a flag rather than a
   * function: `routeProp` is the hottest path in the engine, so what it can afford per write is a
   * boolean read on the node, not a call into a behavior.
   */
  readonly resolvesImageSources?: boolean;
  /**
   * Flips `id`/`nativeID` precedence to nativeID-over-id — TouchableWithoutFeedback's, and only
   * its. See `routeIdAlias` in `node.ts` for why the flip exists and which vendor file demands it.
   */
  readonly nativeIdWinsOverId?: boolean;
}

const behaviors = new Map<string, IHostBehavior>();

// Nodes that `removeChild` unlinked and that may or may not be coming back. See
// `sweepDetachedBehaviors` for why the answer is not known until commit.
const detachCandidates = new Set<ISymbioteNode>();

// A node the sweep has torn down carries `node.isTornDown`. It can still be re-inserted — see
// `reattachHostBehaviors` — and the bit is what tells an insert whether it must walk at all, so the
// common case (building a fresh tree) never walks anything.
//
// A FIELD rather than the `WeakSet` it was, for the reason `slotBatch` is one: both of its readers
// are per-node paths at list scale — the sweep touches every node of a removed subtree, and every
// insert asks the question once.

// The behavior a node actually got lives on the NODE, as `node.hostBehavior`, remembered from its
// one and only registry lookup. A field rather than the `WeakMap` it was, for the reason
// `node.payloadFold` — written on the next line of `attachHostBehavior` — already is one: every
// reader here is a per-node path at list scale, and a `WeakMap` probe is the dearest way to ask a
// question whose answer is almost always "none".
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

// The gate. `createElement` and `removeChild` are the two hottest paths in the engine (9 002 and
// ~1 000 calls on one benchmark row set), so neither may pay a Set insert for a feature no app
// uses yet. While this is false both paths cost one boolean read, the same discipline as `isDebug`.
let hasBehaviors = false;
// See `hasAttachedBehaviors`. A behavior TYPE existing and a behavior being ON a node are different
// questions, and the teardown sweep was asking the first one.
let hasAttached = false;

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

/**
 * Has a behavior ever ATTACHED to a node, as opposed to a behavior TYPE having been registered?
 *
 * `hasBehaviors` answers the second, and it is on from module load in every app: registering
 * `Pressable` arms it whether or not one is ever mounted. It gates `createElement`'s attach probe
 * correctly — a node has to be offered to the registry to find out. It gates the TEARDOWN SWEEP
 * wrongly, and that is expensive: the sweep crosses every removed node into JS, which on a
 * 1 000-row clear is ten thousand handles. Measured on `build-release`
 * (`teardown-sweep-cost.itest.ts`): 1.8 ms with the sweep off against 6.3 ms with it on, i.e. 3.2x,
 * all of it inside the commit. `Clear` is the one row where stock React Native beats every adapter.
 *
 * Nothing the sweep does can matter before the first attach, and the four collections say so:
 * `node.hostBehavior` is written only by `attachHostBehavior`; `awaitingCommit` and `committedEachTime` are
 * written only inside a `behavior.` branch; `parked` only by `detachAnimatedProps`, which has its
 * own gate. The one remaining effect is marking `isTornDown`, which exists so a later re-insert knows
 * to re-arm — and there is nothing to re-arm.
 *
 * MONOTONE, deliberately: it turns on and never off, so it needs no accounting on a `WeakMap` that
 * has no size and no destructor. Being late is the only way it can be wrong, and it cannot be late.
 */
export function hasAttachedBehaviors(): boolean {
  return hasAttached;
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
  const behavior = node.hostBehavior;
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
  return node.hostBehavior?.slotTakesNoChildren !== true;
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
  node.hostBehavior?.onOwnedListenerChange?.(node, name, wired);
}

// Called from the two inserts once the child is in place. See `onChildInserted`.
export function notifyChildInserted(
  node: ISymbioteNode,
  child: ISymbioteNode,
): void {
  node.hostBehavior?.onChildInserted?.(node, child);
}

// What this owner does with a child of that Fabric component, or undefined when it does not claim
// it at all. See `claimedChildren`.
export function claimModeFor(
  node: ISymbioteNode,
  component: string,
): IClaimMode | undefined {
  return node.hostBehavior?.claimedChildren?.[component];
}

/**
 * Every owner key feeds the slot. The spelling for a `cloneElement` primitive, whose slot is not
 * derived from a named set at all — see `IHostBehavior.slotDerived`.
 *
 * A sentinel in the SAME array rather than a second field, so `slotDerivesFrom` stays one lookup and
 * a behavior that wants both spellings cannot express a contradiction.
 */
export const SLOT_DERIVED_ALL = '*';

// Does this owner key feed the slot's payload? See `slotDerived`. Same `node.childHost` gate as
// above keeps the WeakMap probe off every node that has no slot.
export function slotDerivesFrom(node: ISymbioteNode, key: string): boolean {
  const names = node.hostBehavior?.slotDerived;
  if (names === undefined) return false;
  return names.includes(SLOT_DERIVED_ALL) || names.includes(key);
}

// The app's listeners for names a behavior owns, per node. Not on the node: this exists only for
// nodes carrying a behavior, and adding a field for it would pay a shape transition on every node
// in every app for a feature almost none of them use.
const stashed = new WeakMap<ISymbioteNode, Map<string, unknown>>();

// Takes the NODE, not a component string: the caller (`setEventListener`) has only the Fabric name
// by then, which is not the registry's alphabet. Reads the same map `attachHostBehavior` wrote.
export function ownsListener(node: ISymbioteNode, name: string): boolean {
  return node.hostBehavior?.ownedListeners?.includes(name) === true;
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
  node.hostBehavior = behavior;
  hasAttached = true;
  // The tag itself, over the wire, so the host can resolve this tag's PLATFORM props without a trip
  // back into JS. Here rather than in `createElement` because here is where a tag is known to name
  // something: an app's own `<div>`-equivalent would otherwise pay an intern and an op to tell the
  // host a name it has no rule for.
  recordSetTag(node, tag);
  // BEFORE `attach` and before any prop is routed, which is the whole point: it changes how a
  // WRITE is stored, so a source written to this node must never arrive ahead of it.
  if (behavior.resolvesImageSources === true) node.resolvesImageSources = true;
  if (behavior.nativeIdWinsOverId === true) node.nativeIdWinsOverId = true;
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
  if (behavior.afterCommit !== undefined) {
    committedEachTime.add(node);
    node.hasCommitHook = true;
    // Armed from the start, so the commit that first lands this node gives it a beat. A freshly
    // created node has had no prop written through `setProp` yet — `createRawText`'s text is an OP,
    // not a field — so nothing else would arm it, and its behavior would wait for a write that a
    // purely declarative mount never makes.
    noteCommitHookNodeChanged(node);
  }
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
    // The answer is worth recording, not just acting on. `runCommittedHooks` runs immediately after
    // this and asks the SAME question about the SAME node, and `isCommitted` crosses the host
    // boundary — so a node carrying both hooks paid two crossings for one fact on the commit that
    // landed it. Two per `<text-input>` on a 1 000-row create, measured at the call site.
    everCommitted.add(node);
    node.hostBehavior?.attachAfterCommit?.(node);
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
/**
 * Nodes with a recurring hook whose props were written since the last beat.
 *
 * THE POPULATION THE BEAT RUNS OVER, and narrowing it to this is the second half of F-66. The
 * first half stopped the loop CROSSING to decide whether to run a hook; this stops it running the
 * hook at all for a node that cannot have anything to do — and the hook BODY is where the rest of
 * the cost was. TextInput's asks the host for its `value` to compare against its native mirror,
 * which the work ledger measures at `propOf` × 1 000 per commit, in all four adapters.
 *
 * Sound because both behaviors that document why they need the beat need it for the same event, a
 * prop written on their own node. `switch.ts` says so outright — "a check scheduled only from
 * `onChange` never re-runs for a prop change with no preceding native event … `afterCommit` costs
 * nothing extra (it fires only on a commit that already changed something)" — and TextInput's
 * controlled handshake has two sources, the app moving `value` and the user typing, the second of
 * which writes `mostRecentEventCount`. A fold that STRIPS a prop is covered too: the write
 * happened, and it is the PAYLOAD that comes out byte-identical, which is the case this hook was
 * split from `attachAfterCommit` for.
 */
const commitHookNodesChanged = new Set<ISymbioteNode>();

/**
 * Arm a node's recurring hook for the next commit.
 *
 * Called from `setProp` — gated there on `node.hasCommitHook`, a boolean field beside
 * `hasAriaAlias` on the same hidden class, so a node without a recurring hook pays one load and
 * one branch per write and never reaches this.
 */
export function noteCommitHookNodeChanged(node: ISymbioteNode): void {
  commitHookNodesChanged.add(node);
}

export function runCommittedHooks(
  isCommitted: (node: ISymbioteNode) => boolean,
): void {
  if (commitHookNodesChanged.size === 0) return;
  const changed = [...commitHookNodesChanged];
  commitHookNodesChanged.clear();
  for (const node of changed) {
    // Still in the set, i.e. still mounted with its behavior attached: `detachOne` removes a node
    // from `committedEachTime`, and a write that armed it before it was torn down must not reach a
    // hook whose `detach` has already run.
    if (!committedEachTime.has(node)) continue;
    if (!everCommitted.has(node)) {
      // ARMED BUT NOT YET COMMITTED — put it back. A node is armed when its behavior attaches,
      // which is at `createElement`, before it is in anyone's tree; dropping it here would mean the
      // commit that finally lands it never gives it a beat. This is the one place the narrowed
      // population can lose a node, and it is why the set is cleared by REMOVAL of what ran rather
      // than wholesale.
      if (!isCommitted(node)) {
        commitHookNodesChanged.add(node);
        continue;
      }
      everCommitted.add(node);
    }
    node.hostBehavior?.afterCommit?.(node);
  }
}

// Nodes of `committedEachTime` that have reached Fabric at least once.
//
// ASKED ONCE PER NODE, not once per node per commit. `isCommitted` is `getNativeTag`, which is
// `committedRecordOf` — a `flushOps()` and a CROSSING TO THE HOST. Before this, the loop above ran
// over every mounted node whose behavior declared `afterCommit`, on every commit of ANY surface, so
// a thousand-row list with a `<text-input>` per row paid a thousand crossings to select one row,
// and paid them again on a commit that changed nothing at all. Measured at 550 for a 550-node set
// (`__tests__/post-commit-hooks-are-not-the-tree.test.ts`).
//
// The cached answer is sound because within `committedEachTime` it is monotone: a node enters when
// its behavior attaches, leaves in `detachOne` when it is torn down, and a live node that has been
// committed keeps a Fabric record — a clone keeps the family. So the bit only ever goes TRUE for a
// node still in the set, which is F-18's `mayHaveChildren` shape: a stale FALSE costs one more
// crossing next commit, and a stale TRUE is impossible because leaving the set is what losing the
// record means.
//
// A WeakSet rather than a node field: nothing outside this module has any business reading it, and
// a node that leaves the tree takes its entry with it.
const everCommitted = new WeakSet<ISymbioteNode>();

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
/**
 * Whether the sweep has anything to do — asked BEFORE its arguments are built.
 *
 * The sweep's own first line already returns on an empty candidate set, and that was not enough:
 * its caller passes `surface.children`, which is a GETTER that crosses to the host, allocates the
 * whole top-level list and filters it into a second array. On a surface holding four thousand rows
 * that ran on every commit, including the ones with nothing to sweep, because an argument is
 * evaluated before the guard inside the callee can decline. Same shape as the `dlog` arguments that
 * cost Angular 5-10% while emitting nothing.
 */
export function hasDetachCandidates(): boolean {
  return detachCandidates.size > 0;
}

export function sweepDetachedBehaviors(
  topLevel: readonly ISymbioteNode[],
  onDetached: (node: ISymbioteNode) => void,
): void {
  if (detachCandidates.size === 0) return;
  // TWO crossings for the whole sweep, whatever it is sweeping — one for the parents, one for the
  // subtrees. Asked per node instead, a Clear of a thousand rows spent eleven thousand
  // (`ITreeHost.parentsOf` carries the measurement).
  const candidates = [...detachCandidates];
  const parents = parentsOf(candidates);
  // A surface's top-level nodes carry `parent === undefined` by design (surface.ts), and
  // `commitChildren` re-lists them without going through appendChild — so for those the parent
  // check alone would report a live node as gone.
  const left = candidates.filter(
    (node, at) => parents[at] === undefined && !topLevel.includes(node),
  );
  // NARROWED, and it is the sweep's whole cost: what crosses is a handle per node, and on the
  // benchmark row eight of every ten are plain views the sweep would mark and do nothing else
  // with. See `ITreeHost.teardownSubtreesOf` for which nodes come back and why an ancestor must.
  for (const node of teardownSubtreesOf(left)) detachOne(node, onDetached);
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
  // Narrowed for the same reason the sweep is, and with more to gain: this path tears down a whole
  // SURFACE, so the subtree is the screen.
  for (const each of teardownSubtreesOf([node])) detachOne(each, onDetached);
}

// `isTornDown` guards BOTH overlaps, and it used to be helped by a per-call `seen` Set that guarded
// only the first of them:
//
//   within one call    a removed parent and a removed descendant are both nominated, so the
//                      descendant arrives twice
//   across calls       a node the sweep released and that `disposeRoot` then walks again, the
//                      ordinary shape of an unmount after the framework emptied the tree
//
// `seen` was redundant for the first: the mark is raised unconditionally two lines below the
// guard, in the same call, so a second arrival takes the same early return. The only behaviour it
// changed was after a THROWING `onDetached`, where the node would be retried — and a sweep that
// threw half way has already left the tree in a state no retry repairs.
//
// It cost a Set allocation and two hash operations per node, against a teardown that visits every
// removed node: 10 000 of them on a 1 000-row clear. Removing it is a simplification and NOT a
// speed-up — measured on `build-release`, the sweep stayed at 4.4-4.6 ms either way
// (`teardown-sweep-cost.itest.ts`). Whatever holds that time is not the bookkeeping per node.
//
// The subtree arrives FLAT, in one host read, instead of a `childrenOf` recursion. The recursion
// stopped descending at an already-torn-down node where this skips it and carries on; the two agree
// because both marks are whole-subtree — the sweep adds every descendant and `reattachSubtree`
// removes every descendant — so a marked node has its descendants marked too, and each of them
// takes the same early return below.
function detachOne(
  node: ISymbioteNode,
  onDetached: (node: ISymbioteNode) => void,
): void {
  if (node.isTornDown) return;
  onDetached(node);
  // Marked whether or not THIS node carries a behavior: the mark is what tells a later insert to
  // walk, and the node re-inserted is usually a plain container whose DESCENDANT holds the
  // machine. Gating the mark on `behaviors.has` made the row wrapper unmarked and the whole walk
  // skip — the first version of the parked-node test caught exactly that.
  node.isTornDown = true;
  // AND THE REST OF THE BODY IS THE BEHAVIOUR'S, so a node without one leaves here. Nine of every
  // ten nodes in a removed subtree are plain views: the mark above is the whole of what they owe,
  // and the three collection probes below were being paid for them anyway. All three are written
  // only inside `attachHostBehavior`, so an absent behavior means an absent entry in each.
  const behavior = node.hostBehavior;
  if (behavior === undefined) return;
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
  behavior.detach(node);
}

// Re-arms a node the sweep tore down but that the framework put back. Called from appendChild and
// insertBefore, and it is a WeakSet miss — no walk at all — for every node in a freshly built
// tree, which is the path that runs ~9 000 times per benchmark create.
export function reattachHostBehaviors(node: ISymbioteNode): void {
  if (!node.isTornDown) return;
  reattachSubtree(node);
}

// Flat for the same reason the detach walk is, and with nothing to reconcile: this one always
// descended into every child, whatever the node's own mark said.
function reattachSubtree(root: ISymbioteNode): void {
  // Narrowed like the teardown that marked them: `reattachOne` acts only on a node the sweep
  // marked, and the sweep marked exactly what this walk returns.
  for (const node of teardownSubtreesOf([root])) reattachOne(node);
}

function reattachOne(node: ISymbioteNode): void {
  if (node.isTornDown) {
    node.isTornDown = false;
    const behavior = node.hostBehavior;
    behavior?.attach(node);
    // Re-arm the deferred half too. A parked node usually returns with its tag intact, so this
    // fires on the next drain — but re-arming is what keeps `attach` and `attachAfterCommit` a
    // PAIR. Restore only one and a behavior that splits its setup across the two comes back
    // half-initialised, which is the failure this seam exists to prevent.
    if (behavior?.attachAfterCommit !== undefined) awaitingCommit.add(node);
    if (behavior?.afterCommit !== undefined) {
      committedEachTime.add(node);
      node.hasCommitHook = true;
      // A node coming back out of the park has not necessarily had a prop written since, and its
      // mirror may have moved while it was away. Arm it once so the next commit gives it a beat —
      // the narrowed population must not turn a RETURNING node into a silently skipped one.
      noteCommitHookNodeChanged(node);
    }
  }
}

// Test-only. A registry is module state, so a suite that registers a behavior leaks it into every
// later test in the same file unless it is cleared.
export function clearHostBehaviors(): void {
  behaviors.clear();
  detachCandidates.clear();
  awaitingCommit.clear();
  committedEachTime.clear();
  hasBehaviors = false;
  hasAttached = false;
}
