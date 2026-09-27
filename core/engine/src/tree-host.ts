// The tree host seam — the one place JS asks about a tree it does not hold. @symbiote-native/engine
// keeps no tree: every adapter mutation appends an opcode (mutation-buffer.ts), and turning that
// into a tree is the host's job — native on device, a TypeScript applier headlessly (test-utils).

// Shaped after fabric.ts's slot seam on purpose: a resolver plus a test-time installer.

// undefined/empty is an ordinary answer from every read here, not an error — a runtime with no
// host, a node the host hasn't seen, and a genuinely absent value are indistinguishable and all
// three degrade the same way.

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

// What Fabric currently holds for one node — the three fields every imperative call is aimed at.
export type ICommittedRecord = {
  // Opaque, and typed that way because it is: each host puts its own thing here (the native host a
  // ShadowNode, a headless one whatever it committed) — the field's only contract is identity.
  handle: object;
  tag: number;
  rootTag: IRootTag;
};

// A structural census of the host's tree: how many nodes it holds, how many the commit skips, and
// the width of every parent with a skipped child — exactly what the child-set build re-scans
// every time that parent reconciles.

// Anchor count is an adapter property, not an app one: Angular's components bind to a host element
// and always allocate one, where React/Vue/Svelte/Solid don't — the same screen is anchor-free
// under four adapters and carries one per instance under the fifth.
export interface ITreeCensus {
  nodes: number;
  anchors: number;
  emptyRawTexts: number;
  // Nodes that actually become a Fabric view: nodes minus everything the commit skips.
  renderable: number;
  // children.length of every parent holding at least one skipped child, widest first.
  flattenWidths: number[];
}

// The census of a tree nobody counted — what a host with no walk answers, and what
// censusRetainedTree answers with no host installed. Not exported from the package barrel: an app
// reading a census asserts against a mounted tree, so a zero from here must not read as a real one.
export const EMPTY_CENSUS: ITreeCensus = {
  nodes: 0,
  anchors: 0,
  emptyRawTexts: 0,
  renderable: 0,
  flattenWidths: [],
};

// Everything JS asks of the tree it no longer owns. No read here is on a commit path — they run at
// gesture or lifecycle rate, but a gesture is not one touch: a per-level walk once cost 18-19
// crossings per event/frame, all reduced to 1.

// parentsOf, subtreesOf and ancestorsOf are that fix: each answers its singular twin's question,
// in one crossing, for the three walks whose size is the tree's rather than a node's — teardown
// down, dispatch and responder negotiation up.
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
  // A test read: the payload the last commit handed Fabric for this node, undefined before one.
  // Exists because the alternative reads are blind — Props::getDebugProps() is hand-written per
  // component, and RN's rawProps needs a flag that doesn't compile on a host build.

  // Not on any commit path — the bag is already retained per node as the next commit's diff
  // baseline. Answers what we sent, not what Fabric parsed — a key no ViewConfig declares stays.
  committedPayloadOf: (
    handle: object,
  ) => Readonly<Record<string, unknown>> | undefined;
  parentOf: (handle: object) => object | undefined;
  childrenOf: (handle: object) => readonly object[];
  // The first entry of the child list — not childrenOf(handle)[0]. Its own member because that
  // spelling is quadratic: solid-js/universal's cleanChildren calls this in a loop, and reading the
  // whole list to take its head crosses N + (N-1) + (N-2)... handles to empty N children.

  // Anchors included and a dead handle skipped, matching childrenOf element for element —
  // answering early would orphan every child behind a dead one, since cleanChildren's loop ends
  // on undefined.
  firstChildOf: (handle: object) => object | undefined;
  // The next entry in the parent's child list — not parentOf + childrenOf spelled in JS, which is
  // quadratic on the path that uses it: Vue's renderer names this once per row while patching a
  // keyed list, so building the sibling list per call crosses a handle per entry every time.

  // A surface parent answers like any other: the surface is an ordinary node in the host's tree,
  // so a top-level node's siblings are its children.
  nextSiblingOf: (handle: object) => object | undefined;
  // ── the two batched reads, and why they take a list ────────────────────────────────────────────

  // Each answers its singular twin's question, for many nodes in one crossing — the teardown sweep
  // is the one read whose size is the tree's, not the gesture's: clearing rows one at a time would
  // cross a handle per node walked, which is what named the sweep.

  // Per-element semantics are the twins' unchanged, deliberately: this is a cost fix, and a sweep
  // that tore down a different set of nodes than before would be a behaviour change wearing one.
  parentsOf: (handles: readonly object[]) => readonly (object | undefined)[];
  // Each root and every descendant, pre-order, concatenated in root order.
  subtreesOf: (roots: readonly object[]) => readonly object[];
  // The same walk, narrowed to nodes a teardown has work for — each root, every node carrying an
  // intrinsic tag, and every node between the two. The sweep's whole cost is how wide this walk
  // is, and an ancestor of a tagged node must come back too or reattach can't reach it.

  // Not a replacement for subtreesOf: an animated binding is per node and carries no tag, so
  // host-access.ts asks for the full walk whenever one exists.
  teardownSubtreesOf: (roots: readonly object[]) => readonly object[];
  // The node itself and every ancestor above it, deepest first — the upward twin of subtreesOf,
  // for the same reason: event dispatch needs this chain for every event (capture reversed, bubble
  // forward), and responder negotiation needs it again on every drag frame.

  // A surface is included, exactly as parentOf's answer is — stopping at one is host-access.ts's
  // job, done by reading the answer's component.
  ancestorsOf: (handle: object) => readonly object[];
  census: (roots: readonly object[]) => ITreeCensus;

  // ── the imperative six ─────────────────────────────────────────────────────────────────────────

  // They belong to the host, not the Fabric slot: a JSI handle carries exactly one NativeState, and
  // under the native host that state is our Node, so nativeFabricUIManager.measure (expecting a
  // ShadowNode) throws the moment an app measures a ref.

  // Each takes the same placeholder every other member here takes, and each host maps it to
  // whatever its own side needs — which is why ICommittedRecord.handle is not what an imperative
  // call passes.
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

// Install the tree host. installFabric() (test-utils) calls this with the TypeScript applier; the
// native module installs itself the same way. Passing undefined uninstalls, so a fixture can prove
// a path degrades rather than throws.
export function setTreeHost(next: ITreeHost | undefined): void {
  host = next;
}

// The installed host, or undefined on a runtime that has none.
export function treeHost(): ITreeHost | undefined {
  return host;
}

// Push everything recorded since the last apply into the host. Every read goes through here first
// — a reconciler navigates the tree mid-build (Vue/Solid/Svelte/Angular all ask for a parent or
// sibling before commit), so a host only told at completeRoot would answer about a stale tree.

// Adapters that coalesce writes, given the last moment to record what they're holding. Angular's
// styling engine has no whole-value call (ɵɵstyleMap delivers one key per setStyle), so the
// renderer accumulates a run and writes RN's one style prop only once — flushed from here.

// Not a commit hook: fires before every read too, so a listener must be idempotent and must do
// nothing when it holds nothing. Runs before the hasPendingOps check, since a listener holding a
// write has ops not in the buffer yet.
const beforeFlush = new Set<() => void>();

export function registerBeforeFlush(listener: () => void): () => void {
  beforeFlush.add(listener);
  return () => beforeFlush.delete(listener);
}

// A listener records ops, and `routeProp` can reach a read on the way — which would re-enter here
// and ask the same listener for what it has already handed over. One flag rather than per-listener
// bookkeeping: the whole set is being drained, and re-entering any of it is the same mistake.
let settling = false;

// Collect what the listeners are holding, without draining. Separate from flushOps because a read
// may legitimately decide it needs no drain (parentOf skips one for a node whose placement isn't
// pending), but skipping the drain must not also skip asking a held write.
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

// A surface to ask for this window's node counts, exactly one: walkCost_ is file-scope in
// SymbioteTree.cpp, shared by every surface and drained on read, so asking a second surface in the
// same window reads zeroes and a sum would be wrong rather than merely redundant.
let lastCommittedTag: IRootTag | undefined;

// Record a surface's commit and drain the buffer into the host. A surface is an anchor: its
// children belong to the root child set the same way an anchor's belong to its parent's list,
// which is why OP_COMMIT names one node and the host needs no rootTag -> map.

// `others` is every other live surface, needed because the buffer is global while a commit names
// one root — a portal or cross-surface move can mutate a different surface than the one
// committing, and naming every root here is what flushes what actually changed.

// A single-surface app (the overwhelming case) passes an empty list, byte-identical to naming
// only itself.
export function commitSurfaceOps(
  rootTag: IRootTag | undefined,
  surface: IMutationHandle,
  others: readonly (readonly [IRootTag, IMutationHandle])[] = [],
): void {
  commits += 1;
  // No host: ops stay pending, not drained — a surface created before a host installs would have
  // its own createElement thrown away, and the next commit that does reach a host would name a
  // node that host never saw. The commit op itself is skipped too, for the same reason.
  if (host === undefined) return;
  // Nothing to publish — return before the host does anything. The host already declines
  // completeRoot on an identical child set, but only after rebuilding it: every child is
  // revisited to discover none moved, linear cost for a commit that publishes nothing.

  // Post-commit hooks are NOT affected: notifyCommitted/runPostCommitHooks/runDeferredAttaches/
  // afterCommit all run after this call in surface.ts, deliberately ungated on native calls — a
  // fold that strips a prop makes its commit byte-identical, and the hook must still fire.
  if (!hasChangedSinceCommit()) return;
  for (const [otherTag, otherSurface] of others) {
    recordCommit(otherTag, otherSurface);
  }
  // undefined means this surface no longer owns its root — a re-mount on the same rootTag took
  // it. Its ops still drain, since a teardown is what carries the removals.
  if (rootTag !== undefined) {
    recordCommit(rootTag, surface);
    lastCommittedTag = rootTag;
  }
  host.applyOps(takeBatch());
  noteCommitDrained();
}

// What the commit path cost on this host since the last read. Reading zeroes the accumulator, so
// a sampler on an interval gets disjoint windows rather than a growing total.

// propWrites comes from node.ts and prices the layer above the host: how many prop writes an
// adapter pushed at the engine in this window.
export interface ICommitProfile {
  commits: number;
  propWrites: number;
  // Fresh Fabric families minted in this window — the same quantity a stock RN app counts by
  // wrapping global.nativeFabricUIManager.createNode. Our creates are issued from C++ and never
  // touch that global, so a JS wrapper over it would read zero here by construction.
  nodesCreated: number;
  // How many times applyOps was entered for this window — the JSI crossings the buffer actually
  // cost, against the one the architecture promises. A whole create should read 2.

  // Reads higher when something reads the tree mid-build: a read is a batch boundary, so a
  // framework navigating what it's inserting enters applyOps once per mutation instead.
  applyCalls: number;
  // applyOps end to end, and the part that reads the buffer out of JS — the one question a device
  // has to answer and a fixture cannot.

  // Our crossing is one call carrying a large array C++ walks element by element through JSI;
  // stock RN is many calls carrying scalars. Hermes has different array-read costs than the
  // harness's JavaScriptCore, so this number must be read on a phone, not estimated headless.
  applyMs: number;
  decodeMs: number;
}

// Reading this now drains the surface telemetry too — nodesCreated is folded in from
// readSurfaceTelemetry, which zeroes on read in C++, so a sampler polling this on an interval
// empties what a later readSurfaceTelemetry call would have reported.
export function readCommitProfile(): ICommitProfile {
  // One read, not two: readSurfaceTelemetry zeroes the C++ accumulator, so asking twice hands the
  // second caller zeroes and the field would read as "the buffer never crossed".

  // Gated on a commit having landed this window, not merely a tag being known: Fabric's telemetry
  // asserts a commit has started, so asking an uncommitted surface aborts in debug and reads
  // garbage in release. `commits` answers "anything to ask about" without asking.
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
  // ShadowTree::commit's own window, NOT materialize's — materialize runs inside kOpCommit before
  // completeSurface, so it's outside both this window and layout's. Pricing our own walk means
  // timing applyOps from JS and subtracting these two.
  commitMs: number;
  layoutNodes: number;
  textMeasures: number;
  // How many parents took the targeted-replace path since the last read, zeroed on read. Ours,
  // not RN's — a liveness signal, not a performance one: assert this non-zero wherever the fast
  // path is the point of the test.
  targetedReplaces: number;
  // materialize's own walk, and the fields below break it down. Ours, zeroed on read — falls
  // outside every window React Native times, so previously priceable only by subtraction.

  // walkMs is the single entry point in kOpCommit; propsMs/rawPropsMs/createNodeMs/appendChildMs/
  // diffPropsMs are per-node sums inside it and do NOT add up to it — the remainder is bookkeeping.
  walkMs: number;
  // fabricProps alone, on both the create and the clone path. The fold lookup is billed apart.
  propsMs: number;
  // Asking a node whether it carries a payloadFold: a JSI property read, plus a jsi::Function
  // allocation on a hit. The fold's own call is inside propsMs — separated since the two answer
  // different questions: payload size vs. the cost of reaching the JS seam.
  foldLookupMs: number;
  // How many nodes the lookup found one on. Zero makes foldLookupMs pure probe cost.
  foldsFound: number;
  // Inside a fold that runs, split three ways: a fold's contract is bag in, bag out, so both
  // conversions walk every key regardless of what the fold reads. Conversions dominating means a
  // narrower contract fixes it; foldCallMs dominating means not having a fold does.
  foldToJsMs: number;
  foldCallMs: number;
  foldFromJsMs: number;
  /** The payload copy Fabric consumes, kept because `committedProps` is next commit's baseline. */
  rawPropsMs: number;
  createNodeMs: number;
  appendChildMs: number;
  diffPropsMs: number;
  // Nodes that minted a fresh Fabric family, were cloned, or were returned untouched.
  nodesCreated: number;
  nodesCloned: number;
  nodesReused: number;
  // applyOps' own decode, per created element, and its three biggest parts — a different question
  // from the walk's: the walk asks what Fabric charges, this asks what it costs us to turn one op
  // into one node.

  // The buffer architecture only pays for itself if this stays well under the per-node JSI call it
  // replaces. publishMs contains nativeStateMs; neither contains instanceHandleMs.
  decodeMs: number;
  instanceHandleMs: number;
  publishMs: number;
  nativeStateMs: number;
  nodesDecoded: number;
  // kOpSetProp and, inside it, the JS value -> folly::dynamic conversion. setPropMs skips the two
  // early exits (deleting an absent key, a value equal to the one standing), so it under-counts
  // exactly the cheap paths; propConvertMs has no such hole.
  setPropMs: number;
  propConvertMs: number;
  setProps: number;
  // The two setProp ops that changed nothing, counted apart since they're not the same waste:
  // deletesOfAbsent leaves before value conversion (a hash lookup), writesOfUnchanged leaves after
  // it (a paid JSI conversion for nothing) — the expensive one, reported as WRITES n/m on device.
  deletesOfAbsent: number;
  writesOfUnchanged: number;
  // How well the buffer's value interning worked: entries in the batch's value table, vs. how many
  // an op actually reached and converted. setProps / valueEntries is the dedup achieved — a ratio
  // near 1 means the caller hands mostly-unique values, not that interning failed.
  valueEntries: number;
  valueConversions: number;
  // applyOps end to end, plus the two parts that are neither a create nor a prop write. applyMs
  // minus decodeMs/setPropMs/stringDecodeMs/structureMs is what the op loop itself costs.
  applyMs: number;
  // How many nodes the C++ tree is holding right now — a level, not a total, the one counter here
  // not drained on read. JS ownership anchors the C++ side, so a heap reading proves JS was
  // released and only infers the rest; this is the other half as a reading.
  liveNodes: number;
  stringDecodeMs: number;
  // Every append / insert / remove op together.
  structureMs: number;
  // Inside structureMs: promoting a node's weak handle reference to a strong one.
  holdHandleMs: number;
  // subtreesOf — the batched host read the teardown sweep makes, and how many handles it returned.
  // Not on a commit path and timed anyway: it hands JS a handle for every node in every removed
  // subtree, and whether that cost is the crossing or the JS loop above decides where to optimize.
  hostReadMs: number;
  hostReadHandles: number;
  // How many times applyOps was entered since the last read. String/value tables intern per batch,
  // so many small flushes can't fold a repeated value across them — distinguishing "sends more
  // values" from "sends the same values in more batches", identical in valueEntries alone.
  applyCalls: number;
};

// RN's own commit telemetry for a surface this host need not have driven, or undefined when the
// runtime cannot answer. Exists for one comparison: point this at a surface RN's own renderer
// committed and the two numbers are directly comparable — same device, same RN, same tree.

// undefined rather than zeroes on a runtime without the binding, deliberately: zeroes would read
// as "the other renderer measures no text", which is precisely the claim under test.
export function readSurfaceTelemetry(
  surfaceId: number,
): ISurfaceTelemetry | undefined {
  return nativeEngine()?.readSurfaceTelemetry?.(surfaceId);
}

// Arm the C++ half's diagnostics (SymbioteDebug.h), already done by installBindings from DEBUG=1 /
// globalThis.__SYMBIOTE_DEBUG__ at install. This is for the LATER toggle: without it, flipping the
// runtime escape hatch would flip the JS half and silently leave the engine's half dark.
export function setNativeDebug(enabled: boolean): void {
  nativeEngine()?.setDebugEnabled?.(enabled);
}

// Drain what the C++ half has logged since the last call. Retained rather than only written to
// stderr so a test can assert "the engine warned about that" (native-debug-log.itest.ts).

// An empty array on a runtime without the binding, not undefined: "what was logged" has an honest
// empty answer, unlike the telemetry read above, where a zero would be a false claim.
export function takeNativeDebugLog(): readonly string[] {
  return nativeEngine()?.takeDebugLog?.() ?? [];
}
