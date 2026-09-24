// The TREE HOST seam — the one place JS asks about a tree it does not hold.
//
// `@symbiote-native/engine` keeps NO tree. Every adapter mutation appends an opcode to
// `mutation-buffer.ts`, and turning that buffer into a tree is the HOST's job: native on device, and
// headlessly the TypeScript applier in `@symbiote-native/test-utils`, installed by `installFabric()`.
// That applier lives there for the same reason the fake `nativeFabricUIManager` does — it is a JS
// stand-in for a native thing, and `core/test-utils` is a devDependency of the adapters rather than a
// runtime one, so nothing an app loads contains a JS tree.
//
// Shaped after `fabric.ts`'s slot seam on purpose: a resolver plus a test-time installer.
//
// `undefined` / empty is an ORDINARY answer from every read here, not an error — the same contract
// `committedRecordOf` already carried. A runtime with no host, a node the host has not seen, and a
// genuinely absent value are indistinguishable to a caller, and all three degrade.

import type {
  IMeasureInWindowOnSuccess,
  IMeasureLayoutOnSuccess,
  IMeasureOnSuccess,
  IRootTag,
} from './fabric';
import {
  hasChangedSinceCommit,
  hasPendingOps,
  noteCommitDrained,
  recordCommit,
  takeBatch,
  type IMutationBatch,
  type IMutationHandle,
} from './mutation-buffer';
import { nativeEngine } from './native-engine';
import { takePropStats } from './node';

/** What Fabric currently holds for one node — the three fields every imperative call is aimed at. */
export type ICommittedRecord = {
  /**
   * OPAQUE, and typed that way because it is: each host puts its own thing here — the native host a
   * `ShadowNode`, a headless one whatever it committed — and the field's only contract is identity.
   * It used to say `IFabricNode`, which promised a Fabric node from every host and was true of one.
   * `IFabricNode` is a brand with no members, so nothing a caller could do with it is lost.
   */
  handle: object;
  tag: number;
  rootTag: IRootTag;
};

// A structural census of the host's tree: how many nodes it holds, how many of those the commit
// skips, and — the number this exists for — the WIDTH of every parent whose child list contains a
// skipped node, because that width is exactly what the child-set build re-scans every time such a
// parent reconciles.
//
// Anchor count is an ADAPTER property, not an app one. A React/Vue/Svelte/Solid component is a
// function that returns children and allocates no node; an Angular component is bound to a host
// ELEMENT and therefore always has one. So the same screen is anchor-free under four adapters and
// carries one anchor per composed component instance under the fifth, and nothing short of counting
// the live tree shows it — grepping adapter sources for "anchor" measures how much they talk about
// anchors, not how many they build.
export interface ITreeCensus {
  nodes: number;
  anchors: number;
  emptyRawTexts: number;
  /** Nodes that actually become a Fabric view: `nodes` minus everything the commit skips. */
  renderable: number;
  /** children.length of every parent holding at least one skipped child, widest first. */
  flattenWidths: number[];
}

/**
 * The census of a tree nobody counted — what a host with no walk of its own answers, and what
 * `censusRetainedTree` answers when no host is installed at all.
 *
 * Not exported from the package barrel: it is a HOST-author constant, and an app reading a census
 * asserts against a mounted tree, where a zero from here cannot be mistaken for a zero from a real
 * empty tree.
 */
export const EMPTY_CENSUS: ITreeCensus = {
  nodes: 0,
  anchors: 0,
  emptyRawTexts: 0,
  renderable: 0,
  flattenWidths: [],
};

/**
 * Everything JS asks of the tree it no longer owns.
 *
 * No read here is on a commit path — they run at GESTURE or lifecycle rate (a host behavior seeing
 * the props it reacts to, an app measuring a ref, a framework seam navigating what it just built).
 * This comment used to conclude from that that the crossing cost was irrelevant, at "~10 reads per
 * touch". Counted, it was 18 per EVENT and 19 per drag FRAME — 60 times a second for as long as a
 * finger is down — because a gesture is not one touch and a walk that asks per level pays per
 * level. Both are 1 now.
 *
 * `parentsOf`, `subtreesOf` and `ancestorsOf` are what that cost: each answers exactly what its
 * singular twin answers, in ONE crossing, for the three walks whose size is the TREE's rather than
 * a node's — teardown down, dispatch and responder negotiation up.
 */
export type ITreeHost = {
  applyOps: (batch: IMutationBatch) => void;
  propOf: (handle: object, key: string) => unknown;
  // The whole bag, for the callers that fold over it rather than ask for one name — every host
  // behavior's payload fold. Kept beside `propOf` rather than derived from it: the host holds the
  // map, and rebuilding one key at a time from JS would need the key list first.
  propsOf: (handle: object) => Readonly<Record<string, unknown>>;
  // "Rebuild this node's payload even though no op named it." The one dirtying route a behavior
  // with a DERIVED payload has; see `markPropsDirty` (node.ts).
  markPropsDirty: (handle: object) => void;
  committedRecordOf: (handle: object) => ICommittedRecord | undefined;
  /**
   * A TEST read: the PAYLOAD the last commit handed Fabric for this node, `undefined` before one.
   *
   * It exists because the alternative reads are both blind. `Props::getDebugProps()` is a
   * hand-written selection per component — `RCTSinglelineTextInputView` reports `testID` and nothing
   * else — and RN's complete `Props::rawProps` needs `RN_SERIALIZABLE_STATE`, which pulls fbjni into
   * `State` and does not compile on a host build. So the rules in `SymbioteFabricProps.cpp` were
   * verifiable only through their TypeScript twins, which is the drift this read closes.
   *
   * Not on any commit path, and it adds no bookkeeping: the bag is already retained per node as the
   * next commit's diff baseline.
   *
   * It answers what we SENT, not what Fabric parsed — a key no ViewConfig declares is still in here.
   */
  committedPayloadOf: (
    handle: object,
  ) => Readonly<Record<string, unknown>> | undefined;
  parentOf: (handle: object) => object | undefined;
  childrenOf: (handle: object) => readonly object[];
  // The FIRST entry of the child list — not `childrenOf(handle)[0]`.
  //
  // Its own member for the same reason `nextSiblingOf` below is, and it is the same bug one door
  // along. `solid-js/universal`'s `cleanChildren` empties a parent with
  // `while (removed = getFirstChild(parent)) removeNode(parent, removed)`, so reading the whole list
  // to take its head means reading a list of N, then N-1, then N-2 — quadratic in the width, with
  // every handle a host object built, returned, filtered and thrown away. Measured on a 2 000-row
  // Solid `Clear`: **2 001 001 handles** crossed to remove two thousand children, N(N+1)/2 exactly,
  // and the step cost 435 ms against stock's 14.
  //
  // Anchors INCLUDED and a dead handle SKIPPED, both matching `childrenOf` element for element: a
  // caller that switches between the two must see one tree, and `cleanChildren`'s loop ends on
  // `undefined`, so answering it early would orphan every child behind a dead one.
  firstChildOf: (handle: object) => object | undefined;
  // The next entry in the parent's child list — NOT `parentOf` plus `childrenOf` spelled in JS.
  //
  // It is its own member because the JS spelling is quadratic on the path that uses it. Vue's
  // renderer names `nextSibling` once per row while patching a keyed list, and reading the whole
  // sibling list to find one entry crossed 1 002 001 handles on a 1 000-row append — every one of
  // them a host object built, filtered and thrown away. Here the host scans its own vector and one
  // handle crosses.
  //
  // A SURFACE parent answers like any other: the surface is an ordinary node in the host's tree, so
  // a top-level node's siblings are its children.
  nextSiblingOf: (handle: object) => object | undefined;
  // ── THE TWO BATCHED READS, AND WHY THEY TAKE A LIST ────────────────────────────────────────────
  //
  // Each answers exactly what its singular twin above answers, for many nodes in ONE crossing. They
  // exist because the teardown sweep is the one read that is not at gesture rate: its size is the
  // TREE's. Clearing a thousand rows asked `parentOf` a thousand times and then walked ten thousand
  // nodes through `childrenOf`, so eleven thousand crossings and as many intermediate arrays landed
  // inside the timed step. Measured on `examples/svelte`, iOS 26.5 Release, 1 000 rows: Clear
  // 12.6 -> 74.5 ms and Replace 214.0 -> 282.2, while Remove of ONE row — ten nodes — did not move
  // at all. The cost is per node WALKED, not per node removed, which is what named the sweep.
  //
  // Per-element semantics are the twins' unchanged, deliberately: this is a cost fix, and a sweep
  // that tore down a different set of nodes than before would be a behaviour change wearing one.
  parentsOf: (handles: readonly object[]) => readonly (object | undefined)[];
  /** Each root and every descendant, PRE-ORDER, concatenated in root order. */
  subtreesOf: (roots: readonly object[]) => readonly object[];
  /**
   * The same walk, narrowed to the nodes a TEARDOWN has work for — each root, every node carrying
   * an intrinsic tag, and every node between the two.
   *
   * It exists because the sweep's whole cost is how WIDE this walk is: a thousand-row clear crossed
   * ten thousand handles to release a thousand machines, and eight in ten of those nodes were plain
   * views the sweep marked and did nothing else with. An ancestor of a tagged node has to come back
   * too, or a framework that returns an interior node on its own would never re-arm what hangs
   * beneath it (`host-behavior.test.ts` guards exactly that shape).
   *
   * Not a replacement for `subtreesOf`: an animated binding is per node and carries no tag, so
   * `host-access.ts` asks for the full walk whenever one exists.
   */
  teardownSubtreesOf: (roots: readonly object[]) => readonly object[];
  /**
   * The node itself and every ancestor above it, DEEPEST FIRST.
   *
   * The upward twin of `subtreesOf`, and it exists for the same reason: a walk that asks per LEVEL
   * pays a crossing per level. Event dispatch needs this chain for every event — capture reads it
   * reversed, bubble reads it forward — and the responder negotiation needs it again on every frame
   * of every drag. Measured before it existed: 18 crossings per event on a depth-8 chain, then 9
   * once the two phases shared one walk, against the 1 an answer from here costs.
   *
   * A SURFACE is included, exactly as `parentOf`'s answer is — stopping at one is
   * `host-access.ts`'s job, and it does it by reading the answer's `component`.
   */
  ancestorsOf: (handle: object) => readonly object[];
  census: (roots: readonly object[]) => ITreeCensus;

  // ── THE IMPERATIVE SIX ─────────────────────────────────────────────────────────────────────────
  //
  // They belong to the HOST, not to the Fabric slot, and the reason is the one this whole seam rests
  // on: a JSI handle carries exactly ONE `NativeState`. Under the native host that state is our
  // `Node`, so `nativeFabricUIManager.measure` — which expects a `ShadowNode` reference — throws
  // `Value state is nullptr` the moment an app measures a ref. Device-found 2026-09-08, on the first
  // `measure()` of the session; every earlier screen only read props.
  //
  // Each takes the PLACEHOLDER, the same object every other member here takes, and each host maps it
  // to whatever its own side needs — the applier to its fake Fabric node, native to the `ShadowNode`
  // the last commit left on the `Node`. That is why `ICommittedRecord.handle` is not what an
  // imperative call passes: the two hosts legitimately put different things in that field.
  dispatchCommand: (
    handle: object,
    commandName: string,
    args: readonly unknown[],
  ) => void;
  sendAccessibilityEvent: (handle: object, eventType: string) => void;
  measure: (handle: object, callback: IMeasureOnSuccess) => void;
  measureInWindow: (
    handle: object,
    callback: IMeasureInWindowOnSuccess,
  ) => void;
  measureLayout: (
    handle: object,
    relativeTo: object,
    onFail: () => void,
    onSuccess: IMeasureLayoutOnSuccess,
  ) => void;
  // Claim or release the gesture with native. Through the host, not the Fabric slot: the handover
  // is reached by any touch on a scrollable subtree, so a placeholder handed to the slot redboxes
  // with `Value state is nullptr` on the first scroll rather than on some rare ref.
  setIsJSResponder: (
    handle: object,
    isResponder: boolean,
    blockNativeResponder: boolean,
  ) => void;
};

let host: ITreeHost | undefined;

/**
 * Install the tree host. `installFabric()` (test-utils) calls this with the TypeScript applier; the
 * native module installs itself the same way once its bindings carry these reads.
 *
 * Passing `undefined` uninstalls, so a fixture can prove a path degrades rather than throws.
 */
export function setTreeHost(next: ITreeHost | undefined): void {
  host = next;
}

/** The installed host, or `undefined` on a runtime that has none. */
export function treeHost(): ITreeHost | undefined {
  return host;
}

/**
 * Push everything recorded since the last apply into the host.
 *
 * Every READ goes through here first. A reconciler navigates the tree it is mid-way through
 * BUILDING — Vue, Solid, Svelte and Angular all ask for a parent or a sibling between mutations and
 * long before the commit — so a host that only learned of ops at `completeRoot` would answer about a
 * tree several operations stale. The ops are structural, so applying them early costs nothing: only
 * `OP_COMMIT` reaches Fabric, and one is recorded solely by `commitSurfaceOps` below, immediately
 * before its own drain.
 */
/**
 * Adapters that COALESCE writes, given the last moment to record what they are holding.
 *
 * An adapter cannot always publish a write the instant its framework hands it over. Angular's
 * styling engine has no whole-value call — `ɵɵstyleMap` delivers one key per `Renderer2.setStyle`
 * — so the renderer accumulates the run and writes RN's one `style` prop once. That accumulator has
 * to be emptied before anything can observe the tree, and the adapter cannot know when that is: a
 * read and a commit both arrive from elsewhere.
 *
 * Both of them come through `flushOps`, which is what makes this the right seam and a cheap one — it
 * is the single door in front of every drain, `commit` included.
 *
 * NOT A COMMIT HOOK. It fires before every read as well, so a listener must be idempotent and must
 * do nothing when it holds nothing. It runs BEFORE the `hasPendingOps` check on purpose: a listener
 * holding a write has ops that are not in the buffer yet, so an empty buffer is no reason to skip it.
 */
const beforeFlush = new Set<() => void>();

export function registerBeforeFlush(listener: () => void): () => void {
  beforeFlush.add(listener);
  return () => beforeFlush.delete(listener);
}

// A listener records ops, and `routeProp` can reach a read on the way — which would re-enter here
// and ask the same listener for what it has already handed over. One flag rather than per-listener
// bookkeeping: the whole set is being drained, and re-entering any of it is the same mistake.
let settling = false;

/**
 * Collect what the listeners are holding, WITHOUT draining.
 *
 * Separate from `flushOps` because a read may legitimately decide it needs no drain — `parentOf`
 * skips one for a node whose placement is not pending — and skipping the drain must not also skip
 * asking. A held write is still a write, and a reader that cannot see it is reading a stale tree.
 */
export function settleBeforeFlush(): void {
  if (settling || beforeFlush.size === 0) return;
  settling = true;
  try {
    for (const listener of beforeFlush) listener();
  } finally {
    settling = false;
  }
}

export function flushOps(): void {
  settleBeforeFlush();
  if (host === undefined || !hasPendingOps()) return;
  host.applyOps(takeBatch());
}

// Commits this window, for readCommitProfile below.
let commits = 0;

// A surface to ask for this window's node counts. They live in C++ and this profile is id-less, so
// the window has to keep a tag to ask WITH, and exactly one: `walkCost_` is file-scope in
// `SymbioteTree.cpp`, shared by every surface and drained on read, so asking a second surface in the
// same window reads zeroes and a sum would be wrong rather than merely redundant.
let lastCommittedTag: IRootTag | undefined;

/**
 * Record a surface's commit and drain the buffer into the host.
 *
 * A SURFACE IS AN ANCHOR: an anchor is a node whose children belong to its parent's list, and a
 * surface is a node whose children belong to the root child set. Same shape, which is why `OP_COMMIT`
 * names one node and the host needs no `rootTag -> map`.
 *
 * `others` is every OTHER live surface, and it exists because the buffer is GLOBAL while a commit
 * names ONE root. A framework can mutate a tree that belongs to a different surface than the one
 * whose renderer it is holding — a portal, a tunnel, any cross-surface move — and every adapter
 * then asks its OWN surface to commit. The ops reach the host either way, so the other surface is
 * left correctly updated in the tree and never handed to `completeRoot`: a stale Fabric root that
 * nothing will refresh until something unrelated dirties it. Naming every root here is what makes a
 * commit mean "flush what changed" rather than "flush the surface I happen to be bound to".
 *
 * A single-surface app — every example, and the overwhelming case — passes an empty list and the
 * behaviour is byte-identical to naming only itself.
 */
export function commitSurfaceOps(
  rootTag: IRootTag | undefined,
  surface: IMutationHandle,
  others: readonly (readonly [IRootTag, IMutationHandle])[] = [],
): void {
  commits += 1;
  // No host: the ops STAY PENDING. Draining them here would be silent data loss — a surface created
  // before a host is installed would have its own `createElement` thrown away, and the next commit
  // that DOES reach a host names a node that host never saw. Nothing is red until then, and the
  // throw when it comes names the commit rather than the discard.
  //
  // The commit op is not recorded either, for the same reason: it would sit at the head of the next
  // batch, ahead of the creates it depends on.
  if (host === undefined) return;
  // NOTHING TO PUBLISH — return before the host is asked to do anything.
  //
  // The host already declines `completeRoot` when the root child set comes back identical, but it
  // decides that AFTER rebuilding the set: every child of the committed surface is visited to
  // rediscover that none of them moved. Measured on the reference applier, a commit with nothing
  // pending cost 0.0145 ms over 500 rows and 0.0822 over 4 000 — linear in the width of the surface,
  // for a commit that publishes nothing.
  //
  // Who pays it: any frame where a framework re-ran an effect and produced no change, which for a
  // reactive adapter is most frames.
  //
  // The post-commit hooks are NOT affected. `notifyCommitted`, `runPostCommitHooks`,
  // `runDeferredAttaches` and the `afterCommit` drain all run in `surface.ts` AFTER this call and
  // are deliberately not gated on the commit having made native calls — a fold that strips a prop
  // makes its own commit byte-identical, and the hook reacting to that flip must still fire.
  if (!hasChangedSinceCommit()) return;
  for (const [otherTag, otherSurface] of others) {
    recordCommit(otherTag, otherSurface);
  }
  // `undefined` means this surface no longer OWNS its root — a re-mount on the same rootTag took
  // it. Its ops still drain, because a teardown is what carries the removals; completing the root
  // would hand Fabric the dead surface's emptied tree over the live one's.
  if (rootTag !== undefined) {
    recordCommit(rootTag, surface);
    lastCommittedTag = rootTag;
  }
  host.applyOps(takeBatch());
  noteCommitDrained();
}

// What the commit path cost on this host since the last read. Reading zeroes the accumulator, so a
// sampler on an interval gets disjoint windows rather than a growing total.
//
// `propWrites` comes from `node.ts` and prices the layer ABOVE the host: how many prop writes an
// adapter pushed at the engine in this window.
//
// `propNoops` used to sit beside it — the share of those writes that asked for a value the node
// already held — and is GONE, not zeroed. The guard that produced it moved into the host, where the
// previous value is a local field instead of a crossing, so the number is no longer visible from JS.
// A field that is structurally always zero reads as "the adapter is clean" and is worse than absent.
//
// The WALK numbers this profile used to carry — nodesVisited, propsBuilt, childScans and the rest —
// are gone with the walk itself. There is no JS tree to walk any more.
//
// The host's own cost was instrumented too, end to end: the build/commit split across the ABI, the
// create branch timed in four stages, Fabric's adopt-swaps, Yoga's telemetry. None of it was
// actionable, so it all came out again. A timer added back here re-opens a question already closed.
export interface ICommitProfile {
  commits: number;
  propWrites: number;
  /**
   * Fresh Fabric families minted in this window — the SAME quantity a stock React Native app counts
   * by wrapping `global.nativeFabricUIManager.createNode`, and the only like-for-like census left
   * between the two stacks: our creates are issued from C++ (`SymbioteTree.cpp`,
   * `uiManager.createNode`) and never touch that global, so a JS wrapper over it reads zero here by
   * construction. Two arms whose node counts differ are not one workload, whatever their
   * milliseconds say, so this belongs next to the writes rather than behind a surface id.
   */
  nodesCreated: number;
  /**
   * How many times `applyOps` was ENTERED for this window — the number of JSI crossings the buffer
   * actually cost, as against the one the architecture promises.
   *
   * A whole create should read 2. It reads more when something READS the tree while the tree is
   * being built, because a read is a batch boundary: the buffer has to drain before the answer can
   * be given, so a framework navigating what it is inserting enters `applyOps` once per mutation.
   * `small-batch-crossing-cost.itest.ts` prices an empty prologue at 1.5-4.4 us, so ten thousand
   * boundaries is tens of milliseconds that no node count and no write count can see — which is
   * exactly the shape of a cost that shows up on a device and not in a fixture.
   */
  applyCalls: number;
  /**
   * `applyOps` end to end, and the part of it that reads the buffer out of JS.
   *
   * THE ONE QUESTION A DEVICE HAS TO ANSWER and a fixture cannot. Our crossing is a single call
   * carrying a 12 000-entry array that C++ walks element by element through JSI; stock's is ten
   * thousand calls carrying scalars. On the harness's JavaScriptCore that walk is ~4 ms of a ~48 ms
   * `applyOps`. Hermes is a different JSI implementation with different array-read costs and nothing
   * headless can price it, so the number has to be read on a phone — near 4 ms and the buffer is
   * innocent, tens of milliseconds and it is most of the gap the device reports.
   */
  applyMs: number;
  decodeMs: number;
}

/**
 * NOTE: reading this now DRAINS the surface telemetry too — `nodesCreated` is folded in from
 * `readSurfaceTelemetry`, which zeroes on read in C++. A sampler polling this on an interval
 * therefore empties what a later `readSurfaceTelemetry` call would have reported.
 */
export function readCommitProfile(): ICommitProfile {
  // ONE read, not two: `readSurfaceTelemetry` zeroes the C++ accumulator, so asking it twice hands
  // the second caller zeroes and the field would read as "the buffer never crossed".
  //
  // Gated on a commit having LANDED in this window, and not merely on a tag being known. Fabric's
  // `TransactionTelemetry::getCommitStartTime` asserts that a commit has started, so asking a
  // surface that has not committed since the last read aborts the process in a debug build and
  // reads an undefined time point in a release one. The window's own `commits` is the only thing
  // that answers "is there anything to ask about" without asking.
  const telemetry =
    commits === 0 || lastCommittedTag === undefined
      ? undefined
      : readSurfaceTelemetry(lastCommittedTag);
  const snapshot = {
    commits,
    propWrites: takePropStats().writes,
    nodesCreated: telemetry?.nodesCreated ?? 0,
    applyCalls: telemetry?.applyCalls ?? 0,
    applyMs: telemetry?.applyMs ?? 0,
    decodeMs: telemetry?.decodeMs ?? 0,
  };
  commits = 0;
  return snapshot;
}

export type ISurfaceTelemetry = {
  layoutMs: number;
  textMs: number;
  /**
   * `ShadowTree::commit`'s own window — and **NOT** `materialize`'s.
   *
   * This field's doc used to claim it was the clone-on-write walk, and F-80/F-81/F-82 each read it
   * that way and concluded the native pipeline was too small to matter. `materialize` runs inside
   * `kOpCommit` BEFORE `completeSurface` is called, so it is outside both this window and layout's.
   * Pricing our own walk means timing `applyOps` from JS and subtracting these two.
   */
  commitMs: number;
  layoutNodes: number;
  textMeasures: number;
  /**
   * How many parents took the targeted-replace path since the last read, zeroed on read.
   *
   * OURS, not React Native's. It is a LIVENESS signal, not a performance one: every test in this
   * repository stays green when `canReplaceInPlace` is off, which is how it spent eighteen months
   * disabled. Assert it is non-zero wherever the fast path is the point of the test.
   */
  targetedReplaces: number;
  /**
   * `materialize`'s own walk, and the fields below break it down. OURS, zeroed on read.
   *
   * The doc above says the walk falls outside every window React Native times, which left it
   * priceable only by subtraction — and a subtraction gives a budget, not an address. Measured
   * 2026-09-17: ~200 ms of a 327 ms headless create sat here with nothing inside it named.
   *
   * `walkMs` is the single entry point in `kOpCommit`; `propsMs` / `rawPropsMs` / `createNodeMs` /
   * `appendChildMs` / `diffPropsMs` are per-node sums inside it and do NOT add up to it — what is
   * left over is the walk's own bookkeeping.
   */
  walkMs: number;
  /** `fabricProps` alone, on both the create and the clone path. The fold LOOKUP is billed apart. */
  propsMs: number;
  /**
   * Asking a node whether it carries a `payloadFold`: a JSI property read, and on a hit a
   * `jsi::Function` allocation. The fold's own CALL is inside `propsMs`, where `fabricProps` makes
   * it. Separated because the two answer different questions — how big the payload is, against how
   * much the seam to JS costs to reach.
   */
  foldLookupMs: number;
  /** How many nodes the lookup found one on. Zero makes `foldLookupMs` pure probe cost. */
  foldsFound: number;
  /**
   * Inside a fold that runs, split three ways because a fold's CONTRACT is bag in, bag out: both
   * conversions walk every key of the node whatever the fold actually reads. If the conversions
   * dominate, the fix is a narrower contract; if `foldCallMs` does, the fix is not having a fold.
   */
  foldToJsMs: number;
  foldCallMs: number;
  foldFromJsMs: number;
  /** The payload copy Fabric consumes, kept because `committedProps` is next commit's baseline. */
  rawPropsMs: number;
  createNodeMs: number;
  appendChildMs: number;
  diffPropsMs: number;
  /** Nodes that minted a fresh Fabric family, were cloned, or were returned untouched. */
  nodesCreated: number;
  nodesCloned: number;
  nodesReused: number;
  /**
   * `applyOps`' own decode, per created element, and its three biggest parts.
   *
   * A different question from the walk's. The walk asks what Fabric charges; this asks what it costs
   * US to turn one op into one node — and the buffer architecture only pays for itself if that is
   * well under the per-node JSI call it replaces. On `build-release` it was not, which is why these
   * exist. `publishMs` contains `nativeStateMs`; neither contains `instanceHandleMs`.
   */
  decodeMs: number;
  instanceHandleMs: number;
  publishMs: number;
  nativeStateMs: number;
  nodesDecoded: number;
  /**
   * `kOpSetProp` and, inside it, the JS value -> `folly::dynamic` conversion.
   *
   * `setPropMs` skips the two early exits (deleting an absent key, and a value equal to the one
   * standing), so it under-counts exactly the cheap paths; `propConvertMs` has no such hole.
   */
  setPropMs: number;
  propConvertMs: number;
  setProps: number;
  /**
   * The two `setProp` ops that changed nothing, counted apart because they are not the same waste.
   *
   * `deletesOfAbsent` leaves before the value conversion and costs a hash lookup. `writesOfUnchanged`
   * leaves AFTER it, so the adapter has already paid the JSI -> `folly::dynamic` crossing for a value
   * that changes nothing — that is the expensive one, and it is what the device benchmark's
   * `WRITES n/m` second figure reports.
   */
  deletesOfAbsent: number;
  writesOfUnchanged: number;
  /**
   * How well the buffer's value interning worked: entries in the batch's value table, and how many
   * of them an op actually reached and converted.
   *
   * `setProps / valueEntries` is the dedup achieved. A ratio near 1 means the values are unique —
   * which is a fact about what the caller HANDS the buffer, not about the interning: a style slot
   * rebuilt per node arrives as a fresh reference and cannot be folded with anything.
   */
  valueEntries: number;
  valueConversions: number;
  /**
   * `applyOps` end to end, plus the two parts of it that are neither a create nor a prop write.
   *
   * `applyMs` is the whole native call, so `applyMs` minus `decodeMs` / `setPropMs` /
   * `stringDecodeMs` / `structureMs` is what the op loop itself costs — the books close here.
   */
  applyMs: number;
  /**
   * How many nodes the C++ tree is holding right now — a LEVEL, not a total, and the one counter
   * here that is not drained on read.
   *
   * What it is for: JS ownership anchors the C++ side (a node lives while a parent holds it or while
   * JS names it through `NativeState`), so a heap reading proves the JS half was released and only
   * infers the other. This is the other half as a reading.
   */
  liveNodes: number;
  stringDecodeMs: number;
  /** Every append / insert / remove op together. */
  structureMs: number;
  /** Inside `structureMs`: promoting a node's weak handle reference to a strong one. */
  holdHandleMs: number;
  /**
   * `subtreesOf` — the batched host read the teardown sweep makes, and how many handles it returned.
   *
   * Not on a commit path and timed anyway: it hands JS a handle for every node in every removed
   * subtree, which on a 1 000-row clear is ten thousand. Whether that time is the crossing or the JS
   * loop above it decides whether the torn-down mark is worth moving into C++.
   */
  hostReadMs: number;
  hostReadHandles: number;
  /**
   * How many times `applyOps` was entered since the last read.
   *
   * The string and value tables are interned PER BATCH, so a driver that flushes in many small
   * batches cannot fold a repeated value across them. This is what distinguishes "this adapter sends
   * more values" from "this adapter sends the same values in more batches" — two very different
   * findings that look identical in `valueEntries` alone.
   */
  applyCalls: number;
};

/**
 * RN's own commit telemetry for a surface THIS HOST NEED NOT HAVE DRIVEN, or `undefined` when the
 * runtime cannot answer.
 *
 * It exists for one comparison and should not be reached for anything else: `readCommitProfile`
 * accumulates inside our own commit, so it can only ever describe a tree we built, and the standing
 * open question is whether a tree-wide text re-measure is something we cause or something a Fabric
 * commit costs whoever drives it. Point this at a surface React Native's OWN renderer committed and
 * the two numbers are directly comparable — same device, same RN, same tree.
 *
 * `undefined` rather than zeroes on a runtime without the binding, deliberately: zeroes would read
 * as "the other renderer measures no text", which is precisely the claim under test.
 */
export function readSurfaceTelemetry(
  surfaceId: number,
): ISurfaceTelemetry | undefined {
  return nativeEngine()?.readSurfaceTelemetry?.(surfaceId);
}

/**
 * Arm the C++ half's diagnostics (`SymbioteDebug.h`), which `installBindings` already did from
 * `DEBUG=1` / `globalThis.__SYMBIOTE_DEBUG__` at install.
 *
 * This is for the LATER toggle — the runtime escape hatch `debug.ts` documents for hosts where the
 * env is not reachable. Without it a `globalThis.__SYMBIOTE_DEBUG__ = true` typed into a running app
 * would flip the JS half and silently leave the engine's own half dark, which is the surprise worth
 * the six lines.
 */
export function setNativeDebug(enabled: boolean): void {
  nativeEngine()?.setDebugEnabled?.(enabled);
}

/**
 * Drain what the C++ half has logged since the last call.
 *
 * The reason those lines are retained at all rather than only written to stderr: a diagnostic nobody
 * can assert on is one that rots. This is what lets a test say "the engine warned about that" —
 * see `core/engine/cpp/tests/js/native-debug-log.itest.ts`.
 *
 * An empty array on a runtime without the binding, not `undefined`: the question "what was logged"
 * has an honest empty answer, unlike the telemetry read above, where a zero would be a false claim.
 */
export function takeNativeDebugLog(): readonly string[] {
  return nativeEngine()?.takeDebugLog?.() ?? [];
}
