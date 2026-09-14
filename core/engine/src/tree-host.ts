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
  // The whole bag, for the callers that fold over it rather than ask for one name — every host
  // behavior's payload fold. Kept beside `propOf` rather than derived from it: the host holds the
  // map, and rebuilding one key at a time from JS would need the key list first.
  propsOf: (handle: object) => Readonly<Record<string, unknown>>;
  // "Rebuild this node's payload even though no op named it." The one dirtying route a behavior
  // with a DERIVED payload has; see `markPropsDirty` (node.ts).
  markPropsDirty: (handle: object) => void;
  committedRecordOf: (handle: object) => ICommittedRecord | undefined;
  parentOf: (handle: object) => object | undefined;
  childrenOf: (handle: object) => readonly object[];
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
export function flushOps(): void {
  if (host === undefined || !hasPendingOps()) return;
  host.applyOps(takeBatch());
}

// Commits this window, for readCommitProfile below.
let commits = 0;

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
  host.applyOps(takeBatch());
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
}

export function readCommitProfile(): ICommitProfile {
  const snapshot = { commits, propWrites: takePropStats().writes };
  commits = 0;
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
