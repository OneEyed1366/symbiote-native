// A property test over the reference applier: drive a SEEDED random op program through the
// mutation buffer into `applyBatch`, and check FOUR oracles that were written from the RULES, not
// from `tree-applier.ts`. On failure it SHRINKS the program and prints it, so a red run hands you a
// reproduction rather than a seed number.
//
// The ancestor is `commit-fuzz.test.ts`, which died with `commit.ts`. Its oracles transferred
// because they were deliberately implementation-agnostic; the subject changed from a retained tree
// plus a 2 041-line walk to a flat op buffer plus this applier, and the six rules did not.
//
// ── THE ORACLES, and which of the six rules each one can see ────────────────────────────────────
//
//   1 STRUCTURE   the committed view names and nesting match an INDEPENDENT restatement of the
//                 flattening rules — anchors hoist (rule 1), an empty raw text is skipped (rule 2),
//                 a text inside a text goes virtual and the flag is sticky (rule 3). This oracle
//                 re-derives all three from the model's own child lists rather than calling
//                 `appendRenderable`, which is the whole point: sharing it would make a bug in it
//                 invisible.
//   2 PROPS       what Fabric HOLDS for each committed node equals the model's props, with a key
//                 the model no longer has held as an explicit `null`. Sees the second half of
//                 rule 6 (a vanished key must be sent as null, because a clone MERGES), and any
//                 update the applier simply failed to send.
//   3 PAYLOAD     every key in a clone's payload actually differs from what Fabric held a moment
//                 before. Sees the first half of rule 6: re-sending an unchanged key re-invokes
//                 that prop's native setter. Oracle 2 is blind to it — a redundant key merges to
//                 the same value.
//   4 WORK        the set of nodes the commit created or cloned equals an independent prediction
//                 from the op stream. Sees rule 5 (an untouched subtree is handed back, not
//                 rebuilt), which no oracle over committed OUTPUT can see: a rebuilt subtree is
//                 byte-identical to a reused one.
//
// Rule 4 — a node handed to a different parent is RE-CREATED, not cloned, because a Fabric node
// belongs to one family — needs no oracle here. `fake-fabric.ts`'s `assertSameFamily` throws on the
// violation, and a throw is caught below and shrunk like any other failure. Oracle 4 covers the
// wasteful direction of the same rule (re-creating when a clone would do).
//
// ── WHAT ORACLES 2 AND 3 STAND ON, AND WHY IT IS NOT THE FAKE'S OWN BOOKKEEPING ──────────────────
//
// `createNode` is handed `node.props` BY REFERENCE and the fake stores that reference, so a later
// `setProp` mutates the committed node's props with no commit at all. Reading `IFakeNode.props`
// back would therefore report a payload the applier never sent. So the wrapper slot below keeps its
// OWN model of what Fabric holds per tag, applying the merge semantics itself — the same
// independence oracle 1 has from `appendRenderable`.
//
// ── THE TWO BUGS THIS FILE FOUND ON ITS FIRST RUN, both since FIXED ──────────────────────────────
//
// Kept because each is a rule stated in two lines that neither review nor a hand-written case had
// caught, and both are exactly the shape a device would have reported as "the screen went stale".
//
//   A  A MUTATION INSIDE AN ANCHOR'S SUBTREE, AFTER THAT ANCHOR'S FIRST COMMIT, WAS LOST.
//      Default settings, seed 1, shrank to 5 steps; ORACLE 1.
//      `materialize` clears `selfDirty`/`pathDirty` on every node it commits, and an anchor never
//      goes through it — so an anchor kept `pathDirty === true` forever. `markDirty` climbs only
//      "while NOT already pathDirty", so the climb out of an anchor's subtree stopped AT the anchor
//      and the anchor's own element ancestor was never marked. Every `{#if}` that gains content
//      after mount is this shape. Fixed by clearing the flags in `appendRenderable` for the two
//      kinds the walk contributes nothing for.
//
//   B  MOVING A SUBTREE INTO A TEXT ANCESTRY DID NOT RE-RESOLVE RCTText/RCTVirtualText BELOW THE
//      FIRST UNCHANGED INTERMEDIATE NODE.
//      SYMBIOTE_FUZZ_ANCHORS=0, seed 259, 7 steps; ORACLE 1. Move `View > View > Text` under a
//      `<Text>`: the moved node rebuilt and so did its direct child, but the SECOND level down was
//      clean, kept its parent and its view name, so `materialize` early-returned and the walk never
//      reached the Text. Fixed by `committedTextAncestor` — the ancestry is CONTEXT the node
//      commits under, not a property of the node, so it has to be recorded like the parent is.
//
// ── ORACLE 4 MIRRORS A CONTRACT, and every time the applier learned to do LESS it had to follow ──
//
// The applier declines to clone a node whose payload diff is empty and whose renderable children
// are identical. So "was written to" is not "changed", and three separate over-predictions had to
// come out of the prediction, each found by this loop rather than by reading:
//
//   a no-op prop write        a delete of an absent key, or a write of the value already held —
//                             the applier's own `Object.hasOwn`/`Object.is` guard turns both away
//   a structural op           appending an ANCHOR dirties its parent and changes nothing Fabric
//                             will ever see, so the model compares RENDERABLE children instead
//   a write and its reversal  between two commits it leaves the node dirty and the payload empty,
//                             so the model compares against what it last COMMITTED, not what was
//                             written
//
// The prediction is also POST-ORDER, because a rebuild is the one thing that propagates upward: a
// rebuilt child has a new handle, so its parent's child list differs. Top-down cannot see that.
//
// ── CALIBRATION — which oracle each deliberate injury reports ────────────────────────────────────
//
// Run at SYMBIOTE_FUZZ_ANCHORS=0 SYMBIOTE_FUZZ_SEEDS=200 SYMBIOTE_FUZZ_STEPS=50, the deepest
// configuration that is GREEN on unmodified code, so each red is attributable to the injury alone.
// Rule 1's arm needs anchors and so runs at the default instead.
//
//   rule 1  drop the KIND_ANCHOR branch in appendRenderable      ORACLE 1   1 step
//   rule 2  drop the isEmptyRawText guard                        ORACLE 1   2 steps
//   rule 3  childHasTextAncestor = node.isText (not sticky)      ORACLE 1  11 steps
//   rule 4  drop committedParent !== fabricParent                ORACLE 4   4 steps
//   rule 5  delete materialize's early return                    ORACLE 4   2 steps
//   rule 6a send node.props whole instead of diffProps           ORACLE 3   4 steps
//   rule 6b drop diffProps' vanished-key -> null loop            ORACLE 2   4 steps
//
// Rule 4's arm is the one worth reading twice: it reports ORACLE 4 rather than a throw from the
// fake's `assertSameFamily`, because the shrinker found a case where the stale handle was appended
// somewhere the family check happens to allow. So oracle 4 is what pins rule 4 deterministically
// and the throw is a second, weaker net.

import { describe, expect, it } from 'vitest';
import { installFabric, type IFakeNode } from './fake-fabric';
// The RECORDER comes off the `mutation-buffer` subpath rather than the package barrel, which is
// where it lives by design: the opcodes are the wire contract between the engine and whatever
// implements the tree, so their audience is a host author and not an app
// (`.claude/rules/adapter-parity-audit.md`, "A build-tool-facing symbol belongs on a SUBPATH").
import {
  recordAppendChild,
  recordCommit,
  recordCreateAnchor,
  recordCreateElement,
  recordCreateRawText,
  recordInsertBefore,
  recordRemoveChild,
  recordSetProp,
  recordSetText,
  resetMutationBuffer,
  takeBatch,
} from '@symbiote-native/engine/mutation-buffer';
import { applyBatch } from './tree-applier';
import {
  getSlot,
  resetSlot,
  type IFabricNode,
  type IFabricSlot,
} from '@symbiote-native/engine';

const ROOT_TAG = 1;
const VIRTUAL_TEXT = 'RCTVirtualText';
const RAW_TEXT = 'RCTRawText';

// mulberry32 — a seeded PRNG, so a failure names a seed that reproduces it exactly.
function createRng(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ── THE PROGRAM ─────────────────────────────────────────────────────────────────────────────────
//
// A program is DATA, generated up front. That is what makes shrinking possible at all: a step can
// be deleted and the rest replayed. Steps address nodes by a FRACTION of the live pool rather than
// by identity, because identity does not survive the deletion of an earlier step — so a shrink is a
// SEARCH that re-runs and re-checks, never a rewrite assumed still to fail.

type IStepKind =
  | 'createView'
  | 'createText'
  | 'createAnchor'
  | 'rawText'
  | 'insertBefore'
  | 'remove'
  | 'move'
  | 'setProp'
  | 'setText'
  | 'commit';

interface IStep {
  kind: IStepKind;
  a: number;
  b: number;
  value: number;
}

const KINDS: readonly IStepKind[] = [
  'createView',
  'createView',
  'createText',
  'createAnchor',
  'rawText',
  'insertBefore',
  'remove',
  'move',
  'setProp',
  'setProp',
  'setText',
  // Commit is a STEP, not a coin flip between steps, so the shrinker can delete commits too.
  'commit',
  'commit',
];

// Anchors are the only construct with no Fabric counterpart, so they carry rule 1 on their own.
// The knob exists to BISECT: turning them off removes bug A from the picture and leaves bug B, and
// at 200x50 it leaves neither, which is what gives the calibration table above a clean baseline.
// Default ON — a fuzzer that avoids the shape it found a bug in is a fuzzer that unfinds it.
const ANCHORS = process.env.SYMBIOTE_FUZZ_ANCHORS !== '0';

function generateProgram(seed: number, length: number): IStep[] {
  const rng = createRng(seed);
  const alphabet = ANCHORS
    ? KINDS
    : KINDS.filter(kind => kind !== 'createAnchor');
  const steps: IStep[] = [];
  for (let index = 0; index < length; index += 1) {
    steps.push({
      kind: alphabet[Math.floor(rng() * alphabet.length)] ?? 'commit',
      a: rng(),
      b: rng(),
      value: Math.floor(rng() * 1000),
    });
  }
  return steps;
}

// ── THE MODEL ───────────────────────────────────────────────────────────────────────────────────
//
// Built from the ops the executor ISSUES, never read back out of the applier. Every oracle below
// asks its question of this, which is what makes them oracles rather than mirrors.

type IKind = 'element' | 'rawText' | 'anchor';

interface IModelNode {
  id: number;
  handle: object;
  kind: IKind;
  isText: boolean;
  viewName: string;
  props: Record<string, unknown>;
  children: IModelNode[];
  parent: IModelNode | undefined;
  /** Something wrote to this node, or to its child LIST, since the last commit. */
  dirty: boolean;
  /** Filled in at the first commit that materializes it, by pairing with the committed tree. */
  tag: number | undefined;
  /** What the last commit sent, so oracle 4 can predict a fresh family. */
  lastViewName: string | undefined;
  /** The nearest non-anchor ancestor at the last commit; `undefined` is the surface's child set. */
  lastFabricParent: IModelNode | undefined;
  /**
   * The text ancestry it last committed under. Not derivable from `lastViewName`: only a TEXT node
   * spells the answer into its own name, and a plain `<View>` moved under a `<Text>` has to rebuild
   * anyway so the `<Text>` below IT can go out virtual.
   */
  lastTextAncestor: boolean;
  /**
   * The RENDERABLE children it last committed, which is not `children`: an anchor and an empty raw
   * text are in one list and not the other. A structural op that only moves those changes what the
   * applier holds and nothing Fabric sees, so the node must NOT be predicted to rebuild.
   */
  lastRenderedChildren: readonly IModelNode[];
  /**
   * The props it last COMMITTED, which is not "the props something wrote to". A write and its
   * reversal between two commits leave the node dirty and the payload empty, and the applier
   * declines to clone for an empty payload — so a prediction keyed on "was written" over-reports.
   */
  lastCommittedProps: Record<string, unknown>;
}

let nextId = 0;

function makeModel(kind: IKind, viewName: string, isText: boolean): IModelNode {
  nextId += 1;
  return {
    id: nextId,
    handle: {},
    kind,
    isText,
    viewName,
    props: {},
    children: [],
    parent: undefined,
    dirty: true,
    tag: undefined,
    lastViewName: undefined,
    lastFabricParent: undefined,
    lastTextAncestor: false,
    lastRenderedChildren: [],
    lastCommittedProps: {},
  };
}

/** Mirrors `detachFromParent` + `linkAppend`: an insert detaches first, and both dirty the parent. */
function detach(node: IModelNode): void {
  const parent = node.parent;
  if (parent === undefined) return;
  const index = parent.children.indexOf(node);
  if (index >= 0) parent.children.splice(index, 1);
  node.parent = undefined;
  // NOT `parent.dirty`: that field now means "this node's own props changed". A structural op's
  // observable consequence is the parent's RENDERABLE child list, which ORACLE 4 compares directly —
  // and an anchor moving changes the child list while changing nothing Fabric sees.
}

function append(parent: IModelNode, child: IModelNode): void {
  detach(child);
  child.parent = parent;
  parent.children.push(child);
}

function insertBefore(
  parent: IModelNode,
  child: IModelNode,
  before: IModelNode,
): void {
  detach(child);
  child.parent = parent;
  const index = parent.children.indexOf(before);
  parent.children.splice(index < 0 ? parent.children.length : index, 0, child);
}

function subtree(node: IModelNode, out: IModelNode[] = []): IModelNode[] {
  out.push(node);
  for (const child of node.children) subtree(child, out);
  return out;
}

function isSkipped(node: IModelNode): boolean {
  return node.kind === 'rawText' && node.props.text === '';
}

// ── ORACLE 1's INDEPENDENT TREE ─────────────────────────────────────────────────────────────────

interface IExpected {
  node: IModelNode;
  viewName: string;
  textAncestor: boolean;
  children: IExpected[];
}

/**
 * The three flattening rules, restated from the spec rather than from `appendRenderable`.
 *
 * An anchor contributes its children in its place, recursively, and is transparent to the Fabric
 * PARENT its children get. An empty raw text contributes nothing. A text element under a text
 * ancestor commits virtual, and the ancestry flag is sticky through a non-text element.
 */
function expectedChildren(
  parent: IModelNode,
  hasTextAncestor: boolean,
  fabricParent: IModelNode | undefined,
  out: IExpected[] = [],
): IExpected[] {
  for (const child of parent.children) {
    if (child.kind === 'anchor') {
      expectedChildren(child, hasTextAncestor, fabricParent, out);
      continue;
    }
    if (isSkipped(child)) continue;
    child.lastFabricParent = fabricParent;
    out.push({
      node: child,
      viewName: child.isText && hasTextAncestor ? VIRTUAL_TEXT : child.viewName,
      textAncestor: hasTextAncestor,
      children: expectedChildren(child, hasTextAncestor || child.isText, child),
    });
  }
  return out;
}

/** VIEW NAME and nesting only. Every payload question belongs to oracles 2 and 3. */
function describeExpected(nodes: readonly IExpected[]): string {
  return JSON.stringify(
    nodes.map(function map(node: IExpected): unknown {
      return { v: node.viewName, c: node.children.map(map) };
    }),
  );
}

function describeCommitted(nodes: readonly IFakeNode[]): string {
  return JSON.stringify(
    nodes.map(function map(node: IFakeNode): unknown {
      return { v: node.viewName, c: node.children.map(map) };
    }),
  );
}

function jsonEqual(a: unknown, b: unknown): boolean {
  return JSON.stringify(a ?? null) === JSON.stringify(b ?? null);
}

// ── THE WRAPPER SLOT — an independent model of what Fabric holds ─────────────────────────────────

interface ISpy {
  slot: IFabricSlot;
  /** tag -> the props Fabric holds, by the fake's own merge semantics, tracked here not read back. */
  held: Map<number, Record<string, unknown>>;
  /** Nodes created or cloned since `startCommit`. */
  touched: Set<number>;
  /** ORACLE 3's finding, recorded at the moment the payload was sent. */
  redundant: string | undefined;
  startCommit(): void;
}

/**
 * The fake hands back its own `IFakeNode`, whose `tag` is the identity every oracle keys on. Read
 * through a runtime guard rather than a cast: `IFabricNode` is opaque by design and this is the one
 * place that vouches for the double's shape.
 */
function tagOf(node: IFabricNode): number {
  const candidate: unknown = node;
  if (
    typeof candidate === 'object' &&
    candidate !== null &&
    'tag' in candidate &&
    typeof candidate.tag === 'number'
  ) {
    return candidate.tag;
  }
  throw new Error('the fake slot handed back a node with no tag');
}

function spyOn(inner: IFabricSlot): ISpy {
  const held = new Map<number, Record<string, unknown>>();
  const touched = new Set<number>();
  const spy: ISpy = {
    held,
    touched,
    redundant: undefined,
    startCommit(): void {
      touched.clear();
    },
    slot: inner,
  };

  const merge = (tag: number, payload: Record<string, unknown>): void => {
    const before = held.get(tag) ?? {};
    for (const key of Object.keys(payload)) {
      // ORACLE 3, asked here because this is the only moment the BEFORE state exists.
      if (spy.redundant === undefined && jsonEqual(before[key], payload[key])) {
        spy.redundant =
          `#${tag}: the clone payload re-sends ${key}=${JSON.stringify(payload[key])}, ` +
          `which Fabric already held. A clone MERGES, so an unchanged key re-invokes its setter.`;
      }
    }
    held.set(tag, { ...before, ...payload });
  };

  spy.slot = {
    ...inner,
    createNode(tag, viewName, rootTag, props, instanceHandle) {
      touched.add(tag);
      held.set(tag, JSON.parse(JSON.stringify(props)));
      return inner.createNode(tag, viewName, rootTag, props, instanceHandle);
    },
    cloneNodeWithNewProps(node, newProps) {
      const tag = tagOf(node);
      touched.add(tag);
      merge(tag, newProps);
      return inner.cloneNodeWithNewProps(node, newProps);
    },
    cloneNodeWithNewChildren(node, children) {
      touched.add(tagOf(node));
      return inner.cloneNodeWithNewChildren(node, children);
    },
    cloneNodeWithNewChildrenAndProps(node, newProps, children) {
      const tag = tagOf(node);
      touched.add(tag);
      merge(tag, newProps);
      return inner.cloneNodeWithNewChildrenAndProps(node, newProps, children);
    },
  };
  return spy;
}

// ── THE ORACLES ─────────────────────────────────────────────────────────────────────────────────

/** Pair the expected tree with the committed one, so every model node learns its Fabric tag. */
function pair(
  expected: readonly IExpected[],
  committed: readonly IFakeNode[],
): void {
  expected.forEach((entry, index) => {
    const node = committed[index];
    if (node === undefined) return;
    entry.node.tag = node.tag;
    pair(entry.children, node.children);
  });
}

/** ORACLE 2 — what Fabric holds equals the model, with a vanished key held as an explicit null. */
function findPropDivergence(
  expected: readonly IExpected[],
  spy: ISpy,
): string | undefined {
  for (const entry of expected) {
    const tag = entry.node.tag;
    const fabric = tag === undefined ? undefined : spy.held.get(tag);
    if (fabric === undefined)
      return `${entry.viewName}: committed but Fabric holds no props for it`;
    for (const key of Object.keys(entry.node.props)) {
      if (!jsonEqual(fabric[key], entry.node.props[key])) {
        return (
          `${entry.viewName}#${tag}: Fabric holds ${key}=${JSON.stringify(fabric[key])}, ` +
          `the program asked for ${JSON.stringify(entry.node.props[key])}`
        );
      }
    }
    for (const key of Object.keys(fabric)) {
      if (key in entry.node.props) continue;
      // A clone MERGES, so a key the model dropped must be reset with an explicit null; anything
      // else means the old value is still live on the native view.
      if (fabric[key] !== null) {
        return (
          `${entry.viewName}#${tag}: ${key} was removed but Fabric still holds ` +
          `${JSON.stringify(fabric[key])} instead of null`
        );
      }
    }
    const deeper = findPropDivergence(entry.children, spy);
    if (deeper !== undefined) return deeper;
  }
  return undefined;
}

/**
 * ORACLE 4 — the nodes the commit rebuilt are exactly the ones that needed it.
 *
 * The prediction is computed from the op stream: a node is rebuilt when it has never committed,
 * when its resolved view name flipped, when its Fabric parent changed (a family cannot be
 * reparented), or when anything at or below it was written to since the last commit. Everything
 * else must be handed back untouched — which is rule 5, and is invisible to any oracle that reads
 * committed output, because a rebuilt subtree looks exactly like a reused one.
 */
/** Same key set, same values. The model's prop values are strings, so identity is a real compare. */
function samePropBags(
  previous: Record<string, unknown>,
  next: Record<string, unknown>,
): boolean {
  const previousKeys = Object.keys(previous);
  if (previousKeys.length !== Object.keys(next).length) return false;
  return previousKeys.every(
    key => Object.hasOwn(next, key) && Object.is(previous[key], next[key]),
  );
}

function findWorkDivergence(
  expected: readonly IExpected[],
  spy: ISpy,
): string | undefined {
  const predicted = new Set<number>();
  // POST-ORDER, because a rebuild propagates UPWARD and nothing else does: a child that rebuilt has
  // a new handle, so its parent's child list differs and the parent must rebuild too. Walking
  // top-down cannot see that — the answer for a node depends on answers not yet computed.
  const walk = (entries: readonly IExpected[]): boolean => {
    let anyRebuilt = false;
    for (const entry of entries) {
      const node = entry.node;
      const childRebuilt = walk(entry.children);
      // DIRTY is not CHANGED, and the applier is entitled to tell them apart — it declines to clone
      // a node whose payload diff is empty and whose renderable children are identical. So the
      // prediction is about OBSERVABLE change. Appending an ANCHOR is the case that separates the
      // two: it dirties its parent and changes nothing Fabric will ever see.
      const rendered = entry.children.map(child => child.node);
      const childrenMoved =
        rendered.length !== node.lastRenderedChildren.length ||
        rendered.some(
          (child, index) => child !== node.lastRenderedChildren[index],
        );
      const rebuild =
        node.lastViewName === undefined ||
        entry.viewName !== node.lastViewName ||
        node.lastFabricParent !== previousFabricParent.get(node) ||
        !samePropBags(node.lastCommittedProps, node.props) ||
        childrenMoved ||
        childRebuilt;
      // NOT `textAncestor !== lastTextAncestor`. A changed ancestry makes the applier DESCEND —
      // that is what re-resolves an `RCTText` below it — but for the node itself it changes nothing
      // unless its own name flips, which the term above already covers. A descendant that does flip
      // is predicted on its own row and propagates up through `childRebuilt`. Predicting it here as
      // well demands a rebuild of every leaf that merely moved under a `<Text>`.
      if (rebuild) {
        anyRebuilt = true;
        if (node.tag !== undefined) predicted.add(node.tag);
      }
    }
    return anyRebuilt;
  };
  walk(expected);

  const extra = [...spy.touched].filter(tag => !predicted.has(tag));
  if (extra.length > 0) {
    return `rebuilt #${extra.join(', #')} although nothing at or below them changed`;
  }
  const missing = [...predicted].filter(tag => !spy.touched.has(tag));
  if (missing.length > 0) {
    return (
      `did NOT rebuild ${missing.map(tag => describeTag(tag, expected)).join(', ')} ` +
      `although something at or below them changed`
    );
  }
  return undefined;
}

// Names a predicted tag in the failure text. A bare number says which node disagreed and nothing
// about why, and "why" is always the reason the prediction and the applier parted company.
function describeTag(tag: number, expected: readonly IExpected[]): string {
  const find = (entries: readonly IExpected[]): IExpected | undefined => {
    for (const entry of entries) {
      if (entry.node.tag === tag) return entry;
      const deeper = find(entry.children);
      if (deeper !== undefined) return deeper;
    }
    return undefined;
  };
  const entry = find(expected);
  if (entry === undefined) return `#${tag}`;
  const node = entry.node;
  return (
    `#${tag} ${entry.viewName}[dirty=${node.dirty} kids=${entry.children.length}` +
    ` wasKids=${node.lastRenderedChildren.length}` +
    ` parentMoved=${node.lastFabricParent !== previousFabricParent.get(node)}]`
  );
}

// `expectedChildren` writes each node's CURRENT fabric parent as it walks, so the previous one has
// to be captured before that walk runs.
const previousFabricParent = new Map<IModelNode, IModelNode | undefined>();

// ── THE RUNNER ──────────────────────────────────────────────────────────────────────────────────

function at<T>(list: readonly T[], fraction: number): T | undefined {
  if (list.length === 0) return undefined;
  return list[Math.min(list.length - 1, Math.floor(fraction * list.length))];
}

function isDescendant(ancestor: IModelNode, candidate: IModelNode): boolean {
  for (
    let cursor: IModelNode | undefined = candidate;
    cursor !== undefined;
    cursor = cursor.parent
  ) {
    if (cursor === ancestor) return true;
  }
  return false;
}

function runProgram(steps: readonly IStep[]): string | undefined {
  resetMutationBuffer();
  const fabric = installFabric();
  resetSlot();
  const spy = spyOn(getSlot());

  const surface = makeModel('anchor', '', false);
  recordCreateAnchor(surface.handle);
  // Anchors and raw texts never take a `pool` slot as a container; the pool is every node a later
  // step may address.
  const pool: IModelNode[] = [];

  const commit = (): string | undefined => {
    previousFabricParent.clear();
    for (const node of subtree(surface)) {
      previousFabricParent.set(node, node.lastFabricParent);
    }
    const expected = expectedChildren(surface, false, undefined);

    spy.startCommit();
    recordCommit(ROOT_TAG, surface.handle);
    applyBatch(takeBatch(), spy.slot);

    const wanted = describeExpected(expected);
    const actual = describeCommitted(fabric.committed);
    if (wanted !== actual) {
      return `ORACLE 1 (structure)\n  expected=${wanted}\n  actual  =${actual}`;
    }
    pair(expected, fabric.committed);

    const props = findPropDivergence(expected, spy);
    if (props !== undefined) return `ORACLE 2 (props)\n  ${props}`;
    if (spy.redundant !== undefined)
      return `ORACLE 3 (payload)\n  ${spy.redundant}`;
    const work = findWorkDivergence(expected, spy);
    if (work !== undefined) return `ORACLE 4 (work)\n  ${work}`;

    // Settle the model the way a commit settles the applier: nothing reachable is pending, and
    // every materialized node records the view name it went out as.
    const record = (entries: readonly IExpected[]): void => {
      for (const entry of entries) {
        entry.node.lastViewName = entry.viewName;
        entry.node.lastTextAncestor = entry.textAncestor;
        entry.node.lastRenderedChildren = entry.children.map(
          child => child.node,
        );
        entry.node.lastCommittedProps = { ...entry.node.props };
        record(entry.children);
      }
    };
    record(expected);
    for (const node of subtree(surface)) node.dirty = false;
    return undefined;
  };

  // A THROW is a violation, not a crash to let escape: `assertSameFamily` in the fake is what
  // enforces rule 4, and letting it propagate fails the test with a stack and no reproduction,
  // because the shrinker never runs.
  try {
    for (let index = 0; index < steps.length; index += 1) {
      const step = steps[index];
      if (step === undefined) continue;
      if (step.kind === 'commit') {
        const violation = commit();
        if (violation !== undefined) return `at step ${index}\n${violation}`;
        continue;
      }
      applyStep(step, pool, surface);
    }
    // A final commit, so a program whose last step was a mutation is still checked.
    const violation = commit();
    if (violation !== undefined) return `at the final commit\n${violation}`;
  } catch (error) {
    return `THREW\n  ${error instanceof Error ? error.message : String(error)}`;
  }
  return undefined;
}

function applyStep(step: IStep, pool: IModelNode[], surface: IModelNode): void {
  // A raw text may not take children and the applier is entitled to assume it, so a fuzzer that
  // gives one children tests the harness rather than the applier.
  const containers = (): IModelNode[] =>
    [surface, ...pool].filter(node => node.kind !== 'rawText');

  switch (step.kind) {
    case 'createView':
    case 'createText':
    case 'createAnchor': {
      const node =
        step.kind === 'createAnchor'
          ? makeModel('anchor', '', false)
          : step.kind === 'createText'
            ? makeModel('element', 'RCTText', true)
            : makeModel(
                'element',
                step.b < 0.5 ? 'RCTView' : 'RCTImageView',
                false,
              );
      if (node.kind === 'anchor') recordCreateAnchor(node.handle);
      else
        recordCreateElement(
          node.handle,
          node.viewName,
          node.isText,
          node.handle,
        );
      const parent = at(containers(), step.a) ?? surface;
      recordAppendChild(parent.handle, node.handle);
      append(parent, node);
      pool.push(node);
      return;
    }
    case 'rawText': {
      const parent = at(
        pool.filter(node => node.isText),
        step.a,
      );
      if (parent === undefined) return;
      const node = makeModel('rawText', RAW_TEXT, false);
      // The EMPTY string is generated deliberately: an empty raw text is dropped from its parent's
      // child list, so writing one changes the parent's RENDERABLE children with no structural op.
      const text = step.value % 5 === 0 ? '' : `t${step.value}`;
      node.props.text = text;
      recordCreateRawText(node.handle, text);
      recordAppendChild(parent.handle, node.handle);
      append(parent, node);
      pool.push(node);
      return;
    }
    case 'insertBefore': {
      const parent = at(
        containers().filter(node => node.children.length > 0),
        step.a,
      );
      if (parent === undefined) return;
      const before = at(parent.children, step.b);
      if (before === undefined) return;
      const node = makeModel('element', 'RCTView', false);
      recordCreateElement(node.handle, node.viewName, false, node.handle);
      recordInsertBefore(parent.handle, node.handle, before.handle);
      insertBefore(parent, node, before);
      pool.push(node);
      return;
    }
    case 'remove': {
      const node = at(pool, step.a);
      if (node === undefined) return;
      const parent = node.parent;
      if (parent === undefined) return;
      recordRemoveChild(parent.handle, node.handle);
      // The whole subtree leaves with it, so it leaves the pool too — a later step addressing a
      // detached node would test the harness, not the applier.
      const gone = new Set(subtree(node));
      detach(node);
      for (let index = pool.length - 1; index >= 0; index -= 1) {
        const candidate = pool[index];
        if (candidate !== undefined && gone.has(candidate))
          pool.splice(index, 1);
      }
      return;
    }
    // MOVE, spelled as a bare append, which is how the mutation API spells it: the applier detaches
    // from the old parent itself. It is the op that exercises rule 4 — a Fabric node handed to a
    // different parent must be re-created, and the fake throws if it is cloned instead.
    case 'move': {
      const node = at(
        pool.filter(candidate => candidate.parent !== undefined),
        step.a,
      );
      if (node === undefined) return;
      const target = at(
        containers().filter(
          candidate => candidate !== node && !isDescendant(node, candidate),
        ),
        step.b,
      );
      if (target === undefined) return;
      recordAppendChild(target.handle, node.handle);
      append(target, node);
      return;
    }
    case 'setProp': {
      const node = at(
        pool.filter(candidate => candidate.kind === 'element'),
        step.a,
      );
      if (node === undefined) return;
      const key = step.b < 0.5 ? 'testID' : 'accessibilityLabel';
      // The applier's no-op guard is part of the contract, not an optimisation it may skip, so the
      // model mirrors it: the op is still RECORDED — that is what exercises the guard — but a write
      // that changes nothing leaves the node clean. Marking it dirty regardless makes ORACLE 4
      // demand a rebuild for a write Fabric would never have seen.
      if (step.value % 7 === 0) {
        // A DELETE every so often, because the null-erasure half of rule 6 is only reachable through
        // one: `undefined` collapses to a key removal on the wire.
        recordSetProp(node.handle, key, undefined);
        if (!Object.hasOwn(node.props, key)) return;
        delete node.props[key];
      } else {
        const value = `v${step.value}`;
        recordSetProp(node.handle, key, value);
        if (node.props[key] === value) return;
        node.props[key] = value;
      }
      node.dirty = true;
      return;
    }
    case 'setText': {
      const node = at(
        pool.filter(candidate => candidate.kind === 'rawText'),
        step.a,
      );
      if (node === undefined) return;
      const text = step.value % 5 === 0 ? '' : `t${step.value}`;
      recordSetText(node.handle, text);
      // The same guard, and here it is a real value comparison rather than the reference check it
      // degrades to for an object prop — so it fires often.
      if (node.props.text === text) return;
      node.props.text = text;
      node.dirty = true;
      // Writing to or from '' takes the node out of its parent's renderable list or puts it back —
      // a structural change to the PARENT that no structural op records.
      if (node.parent !== undefined) node.parent.dirty = true;
      return;
    }
    case 'commit':
      return;
  }
}

/**
 * Delete steps while the program still fails, then report the smallest one found.
 *
 * Greedy and re-checking rather than clever: a step's meaning depends on the pool, so removing an
 * earlier step changes what a later one touches. The result is a local minimum, which is enough —
 * the point is a reproduction a human can read.
 */
function shrink(steps: readonly IStep[]): {
  steps: IStep[];
  violation: string;
} {
  let best = [...steps];
  let violation = runProgram(best);
  if (violation === undefined)
    throw new Error('shrink called on a program that passes');

  let improved = true;
  let budget = 400;
  while (improved && budget > 0) {
    improved = false;
    for (let index = 0; index < best.length && budget > 0; index += 1) {
      const candidate = [...best.slice(0, index), ...best.slice(index + 1)];
      budget -= 1;
      const candidateViolation = runProgram(candidate);
      if (candidateViolation === undefined) continue;
      best = candidate;
      violation = candidateViolation;
      improved = true;
      index -= 1;
    }
  }
  return { steps: best, violation };
}

function describeProgram(steps: readonly IStep[]): string {
  return steps
    .map(
      (step, index) =>
        `  ${index}: ${step.kind}(a=${step.a.toFixed(3)}, b=${step.b.toFixed(3)}, v=${step.value})`,
    )
    .join('\n');
}

// ── THE SUITE ───────────────────────────────────────────────────────────────────────────────────

// Fixed defaults so CI is deterministic and a red is reproducible. Overridable for a deep local
// run: SYMBIOTE_FUZZ_SEEDS=2000 SYMBIOTE_FUZZ_STEPS=200 npx vitest run <file>
// 300 x 60 rather than the 200 x 50 the break tests were calibrated at: it is the smallest setting
// that finds bug B as well as bug A, and it costs ~50 ms.
const SEED_COUNT = Number(process.env.SYMBIOTE_FUZZ_SEEDS ?? '300');
const STEP_COUNT = Number(process.env.SYMBIOTE_FUZZ_STEPS ?? '60');
// Generous rather than tight: the number exists to keep a hang from wedging CI, not to police
// speed, and a deep run must not read as a defect because vitest's 5s default rejected it.
const FUZZ_TIMEOUT_MS = Math.max(30_000, SEED_COUNT * STEP_COUNT * 0.5);

describe('tree applier fuzz — four oracles over a seeded op program', () => {
  it(
    `holds over ${SEED_COUNT} programs of ${STEP_COUNT} steps`,
    () => {
      const failures: string[] = [];
      for (let seed = 1; seed <= SEED_COUNT; seed += 1) {
        const program = generateProgram(seed, STEP_COUNT);
        if (runProgram(program) === undefined) continue;
        const minimal = shrink(program);
        failures.push(
          `seed ${seed} (anchors ${ANCHORS ? 'on' : 'off'}) — shrunk from ${STEP_COUNT} to ` +
            `${minimal.steps.length} steps\n${describeProgram(minimal.steps)}\n${minimal.violation}`,
        );
        // One reproduction is what a reader acts on; two hundred is a wall.
        break;
      }
      expect(failures.join('\n\n')).toBe('');
    },
    FUZZ_TIMEOUT_MS,
  );
});
