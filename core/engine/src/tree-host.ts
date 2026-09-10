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
  IFabricNode,
  IMeasureInWindowOnSuccess,
  IMeasureLayoutOnSuccess,
  IMeasureOnSuccess,
  IRootTag,
} from './fabric';
import {
  hasPendingOps,
  recordCommit,
  takeBatch,
  type IMutationBatch,
} from './mutation-buffer';
import { nativeEngine } from './native-engine';
import { takePropStats } from './node';

/** What Fabric currently holds for one node — the three fields every imperative call is aimed at. */
export type ICommittedRecord = {
  handle: IFabricNode;
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
 * Seven methods, and none of the six reads is on a commit path — they are per-node and run at
 * GESTURE or lifecycle rate (a host behavior seeing the props it reacts to, an app measuring a ref,
 * a framework seam navigating what it just built). That is what makes the crossing cost irrelevant:
 * ~10 reads per touch against the ~19 000 per commit this whole design exists to remove.
 */
export type ITreeHost = {
  applyOps: (batch: IMutationBatch) => void;
  propOf: (handle: object, key: string) => unknown;
  committedRecordOf: (handle: object) => ICommittedRecord | undefined;
  parentOf: (handle: object) => object | undefined;
  childrenOf: (handle: object) => readonly object[];
  census: (roots: readonly object[]) => ITreeCensus;

  // ── THE IMPERATIVE FIVE ────────────────────────────────────────────────────────────────────────
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
export function flushOps(): void {
  if (host === undefined || !hasPendingOps()) return;
  applyTimed(host, takeBatch());
}

// Commits this window, for readCommitProfile below.
let commits = 0;

// Wall time inside the host, this window. The ONE number JS can still take about work it no longer
// does: everything past this call — the tree build, Fabric's commit, layout, the mount pass — is
// native and invisible from here, so a step that is slow tells you nothing about WHICH half is slow
// without it. Both drains go through here; `flushOps` is called on every read, so timing only the
// commit would attribute a read's flush to whatever ran next.
//
let applyMs = 0;

/**
 * A monotonic millisecond clock, resolved ONCE and guarded.
 *
 * `performance.now()` is what this wants — the small rows split into single-digit milliseconds,
 * which is at or under `Date.now()`'s resolution — and it is a global the ENGINE has never named
 * before. RN installs one and Node has one, but "never named before" is exactly the shape that
 * turns an absent global into a throw on every commit rather than a missing number, so it is read
 * off `globalThis` with a fallback instead of being declared.
 */
const monotonicNow = ((): (() => number) => {
  const perf: unknown = Reflect.get(globalThis, 'performance');
  if (typeof perf !== 'object' || perf === null) return Date.now;
  const now: unknown = Reflect.get(perf, 'now');
  if (typeof now !== 'function') return Date.now;
  return () => {
    const value: unknown = Reflect.apply(now, perf, []);
    return typeof value === 'number' ? value : Date.now();
  };
})();

function applyTimed(target: ITreeHost, batch: IMutationBatch): void {
  const started = monotonicNow();
  target.applyOps(batch);
  applyMs += monotonicNow() - started;
}

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
  surface: object,
  others: readonly (readonly [IRootTag, object])[] = [],
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
  for (const [otherTag, otherSurface] of others) {
    recordCommit(otherTag, otherSurface);
  }
  // `undefined` means this surface no longer OWNS its root — a re-mount on the same rootTag took
  // it. Its ops still drain, because a teardown is what carries the removals; completing the root
  // would hand Fabric the dead surface's emptied tree over the live one's.
  if (rootTag !== undefined) recordCommit(rootTag, surface);
  applyTimed(host, takeBatch());
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
// are gone with the walk itself. There is no JS tree to walk any more, and the host's own cost is not
// observable from here; measuring it means instrumenting the host.
export interface ICommitProfile {
  commits: number;
  propWrites: number;
  /**
   * Milliseconds spent inside the host's `applyOps`, this window.
   *
   * It splits a slow step in two and answers which half owns it: the time NOT in here is the
   * adapter's own pass plus whatever the engine does before the buffer drains, and the time in here
   * is the host — natively, that is the C++ tree build, Fabric's commit, layout and the mount pass.
   *
   * Headless it measures the TypeScript applier, which is a different machine entirely, so a number
   * from `installFabric()` says nothing about a device.
   */
  applyMs: number;
  /**
   * `applyMs` split in two, by the native host itself. Both zero on any runtime whose bindings
   * predate the split, and on every headless run.
   *
   * `buildMs` is the native tree walk plus every `createNode`/`cloneNode` it issues — OUR work.
   * `commitMs` is `completeSurface`: Fabric's own `ShadowTree::commit`, the differ, layout and the
   * mount pass — work we only ASK for. A step that is slow says nothing about which one owns it,
   * and the two have unrelated fixes, which is the whole reason this crosses the ABI instead of
   * being logged (a `dlog` needs `DEBUG=1`, and a Debug build cannot be benchmarked at all).
   *
   * `applyMs - (buildMs + commitMs)` is what the crossing itself costs — the argument marshalling
   * and the opcode read, which nothing else prices.
   */
  buildMs: number;
  commitMs: number;
  /**
   * Child pointers Fabric swapped out from under the host this window.
   *
   * Fabric does not always keep the children it is handed: a child still owned by its previous
   * parent's yoga node is cloned and the clone put in its place. Holding the original then defeats
   * every pointer-identity short circuit in the commit, so the host takes the landed ones back —
   * and this counts how often that fires, because a repair that never fires and a repair that works
   * produce the same tree.
   */
  adoptSwaps: number;
  /**
   * Nodes this host cloned WITH a props payload this window.
   *
   * Read beside `textMeasures`, and it settles which side dirties measurement. A measurable Yoga
   * node is re-measured only when it is dirty, and the only gate a host trips from outside is the
   * props fragment of a clone — so this is the ceiling on what our own walk could have dirtied.
   * Near `propWrites` means the dirtying happens inside Fabric's commit and the walk is innocent;
   * near `textMeasures` means it is ours.
   */
  propClones: number;
  /**
   * Of `adoptSwaps`, the ones where the node Fabric substituted is a Paragraph.
   *
   * Only that kind's swap costs more than a pointer: a Paragraph memoises its measured content in a
   * field the clone constructor does not copy, so a replaced one re-derives its measurement cache
   * key — and the key embeds the node's own layout frame, which is zero while the tree is being
   * created and distinct per row ever after. That is the whole difference between a create
   * measuring 1890 texts and a one-row mutation measuring 2869 on the identical tree.
   */
  textSwaps: number;
  /**
   * Measurable text nodes already dirty in the tree handed to Fabric, counted BEFORE the commit.
   *
   * It splits the last open question in two and nothing else can. React's own renderer commits the
   * identical tree with zero text measurements where this host reports thousands, and only a dirty
   * leaf produces a measurement — so either the host's own build phase leaves them dirty, which
   * this counts, or they are clean here and the commit dirties them. The two have nothing in
   * common: one is a bug in the walk, the other is upstream of it.
   */
  dirtyTexts: number;
  /**
   * The inside of `commitMs`, taken from RN's own `TransactionTelemetry` rather than timed by us.
   *
   * `layoutNodes` is the decisive one: Yoga reports how many layoutable nodes the pass actually
   * touched, so a one-row change reporting the whole tree is a RE-LAYOUT, which no amount of making
   * layout faster would fix. `textMeasures` is the other tree-sized term a Fabric commit can carry.
   */
  layoutMs: number;
  textMs: number;
  layoutNodes: number;
  textMeasures: number;
}

const EMPTY_SPLIT = {
  buildMs: 0,
  commitMs: 0,
  adoptSwaps: 0,
  propClones: 0,
  textSwaps: 0,
  dirtyTexts: 0,
  layoutMs: 0,
  textMs: 0,
  layoutNodes: 0,
  textMeasures: 0,
};

export function readCommitProfile(): ICommitProfile {
  const split = nativeEngine()?.takeCommitSplit?.() ?? EMPTY_SPLIT;
  const snapshot = {
    commits,
    propWrites: takePropStats().writes,
    applyMs,
    ...split,
  };
  commits = 0;
  applyMs = 0;
  return snapshot;
}

export type ISurfaceTelemetry = {
  layoutMs: number;
  textMs: number;
  layoutNodes: number;
  textMeasures: number;
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
