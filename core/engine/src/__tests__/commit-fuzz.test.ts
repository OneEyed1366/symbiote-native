// A property test over the commit path: drive a SEEDED random mutation program into the retained
// tree, commit, and assert FOUR invariants after every commit. On failure it SHRINKS the program to
// a minimal one that still fails and prints it, so a red run hands you a reproduction rather than a
// seed number.
//
// Why this exists rather than more unit tests. The commit is guarded by the pending-edit buffer, and
// its failure mode is SILENT: a mutation whose mark is missed leaves the commit skipping a subtree
// that changed, so the app shows stale UI with every suite green. Enumerated tests only cover the
// sequences someone thought of, and the marks are set in nine places across node.ts and surface.ts
// (appendChild, insertBefore, removeChild, detach, setProp, setText, setNodeComponent, the surface's
// own splice path, and the container at the commit entry point). The interactions between them are
// what a fuzzer reaches and a case list does not.
//
// ── THE FOUR ORACLES, and what each one alone would miss ────────────────────────────────────────
//
//   1 STRUCTURE   the committed view names and child order match an INDEPENDENT reimplementation of
//                 the flattening rules. Catches a lost/duplicated/misordered node.
//   2 FRESHNESS   every retained node's mirror carries the payload `fabricProps` builds for it right
//                 now. This is `warnIfStale` (commit.ts) promoted from a DEBUG log on one node to an
//                 assertion over the whole tree, and it is the one that catches the stale-UI class:
//                 oracle 1 is blind to it, because a node skipped as clean keeps its OLD props and
//                 its position in the tree is still perfectly correct.
//   3 MIRROR      what Fabric holds equals what the mirror claims Fabric holds. Oracle 2 compares
//                 the mirror against the retained tree; this compares it against the recorder. A
//                 commit that updates the record without emitting the clone passes 2 and fails 3.
//   4 DRAIN       no node reachable from the surface still carries pending work. Catches the buffer
//                 growing without bound — invisible to 1-3, which all read committed output, and
//                 that output is byte-identical whether an entry was consumed or merely ignored.
//
// Oracles 2 and 3 share `fabricProps` with the implementation, deliberately and with a stated
// limit: they cannot see a bug INSIDE that function (`.claude/rules/test-harness-false-greens.md`
// §16 — a comparison is blind to the layer both its arms share). What they do see is the commit
// deciding not to CALL it, which is the entire bug class the buffer introduces. Oracle 1's
// reimplementation covers the shared layer for structure; nothing here covers a wrong prop VALUE,
// and `fabric-props.test.ts` is where that lives.
//
// Oracle 1's reimplementation is the point rather than duplication for its own sake: `expectedTree`
// below walks `node.children` naively — flattening anchors, skipping empty raw text, flipping
// RCTText to RCTVirtualText under a text ancestor — rather than calling the engine's own
// `renderableChildren` and `viewNameFor`. Sharing those would make a bug in them invisible.
//
// ── CALIBRATION, 2026-09-05 — which oracle a REAL engine injury trips ────────────────────────────
//
// A green fuzz run is worth nothing until the loop is shown to catch defects it was not built
// around. The four break arms at the bottom of this file construct their states by hand; these
// four were injected into the engine itself and found by GENERATED programs, at 300 seeds x 120
// steps, with the shrinker reporting the reproduction:
//
//   markStructureDirty stops bubbling        ORACLE 1    120 steps -> 3
//   recordPropEdit forgets pendingProps      ORACLE 2    120 steps -> 3
//   reconcile never drains pendingPath       ORACLE 4    120 steps -> 1
//   renderableChildren drops its drain       ORACLE 4    120 steps -> 1
//
// **ORACLE 3 is NOT witnessed by any injury reachable from these programs, and that is recorded
// rather than papered over.** The current commit writes the mirror from the same value it hands the
// clone, one statement apart, so a divergence between them is not expressible by damaging one
// place. Its hand-built arm proves the detector works. It becomes load-bearing at step 2 of
// `symbiote-fabric-cxx-surface` §9, where the record write and the native emission become separate
// steps in a drain — which is exactly when a guard is worth having in place already
// (`.claude/rules/test-harness-false-greens.md` §28).
//
// One thing this loop deliberately does NOT cover: a node that leaves the tree for good. Oracle 4
// only walks what is reachable, so the buffer's dropped-node sweep is invisible here and is
// covered by `edit-buffer.test.ts` instead. That split is intentional — a leak is not a property of
// the committed tree.

import { describe, expect, it } from 'vitest';
import { installFabric, type IFakeNode } from '@symbiote-native/test-utils';
import {
  appendChild,
  createAnchor,
  createElement,
  createRawText,
  insertBefore,
  isAnchor,
  markDirty,
  removeChild,
  setProp,
  setText,
  RAW_TEXT_COMPONENT,
  TEXT_COMPONENT,
  VIRTUAL_TEXT_COMPONENT,
  type ISymbioteNode,
} from '../node';
import { fabricProps } from '../fabric-props';
import { hasPendingWork } from '../edit-buffer';
import { createSurface, type SymbioteSurface } from '../surface';

// mulberry32 — a seeded PRNG, so a failure names a seed that reproduces it exactly. `Math.random`
// would make a red run unreproducible, which for a fuzzer is the difference between a bug report
// and a rumour.
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
// A program is DATA, generated up front, not a sequence of rng calls made during execution. That is
// what makes shrinking possible at all: a step can be deleted and the rest replayed. The earlier
// version drew from the rng inline, so every "smaller" program was a different program.
//
// Steps address nodes by a FRACTION of the live pool rather than by identity, because identity does
// not survive deletion of an earlier step. A shrink therefore changes which nodes a later step
// touches — which is why shrinking is a search that re-runs and re-checks, never a rewrite that is
// assumed still to fail.

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
  /** Pool selector in [0,1). Resolved against the live pool at execution time. */
  a: number;
  /** Second selector, for the ops that need a target as well as a subject. */
  b: number;
  /** Payload for setProp / setText, so a value is stable across replays. */
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
  // Commit is a STEP, not a coin flip between steps, so the shrinker can delete commits too — a
  // failure that needs three commits shrinks to exactly three.
  'commit',
  'commit',
];

function generateProgram(seed: number, length: number): IStep[] {
  const rng = createRng(seed);
  const steps: IStep[] = [];
  for (let index = 0; index < length; index += 1) {
    const kind = KINDS[Math.floor(rng() * KINDS.length)] ?? 'commit';
    steps.push({
      kind,
      a: rng(),
      b: rng(),
      value: Math.floor(rng() * 1000),
    });
  }
  return steps;
}

function at<T>(list: readonly T[], fraction: number): T | undefined {
  if (list.length === 0) return undefined;
  return list[Math.min(list.length - 1, Math.floor(fraction * list.length))];
}

// Containers only — a raw text node may not take children, and the engine is entitled to assume it.
// A fuzzer that builds an invalid tree tests the harness's tolerance, not the engine's correctness.
function containers(pool: readonly ISymbioteNode[]): ISymbioteNode[] {
  return pool.filter(node => node.component !== RAW_TEXT_COMPONENT);
}

function isDescendant(
  ancestor: ISymbioteNode,
  candidate: ISymbioteNode,
): boolean {
  let cursor: ISymbioteNode | undefined = candidate;
  while (cursor !== undefined) {
    if (cursor === ancestor) return true;
    cursor = cursor.parent;
  }
  return false;
}

// ── THE ORACLES ─────────────────────────────────────────────────────────────────────────────────

interface IExpected {
  viewName: string;
  props: Record<string, unknown>;
  children: IExpected[];
}

// The rules the commit applies, restated independently (see the header).
function expectedChildren(node: ISymbioteNode, inText: boolean): IExpected[] {
  const out: IExpected[] = [];
  for (const child of node.children) {
    // An anchor never becomes a Fabric view; its children take its place in the parent's list.
    if (isAnchor(child)) {
      out.push(...expectedChildren(child, inText));
      continue;
    }
    // An empty RCTRawText aborts Fabric's text walk, so the engine drops it.
    if (child.component === RAW_TEXT_COMPONENT && child.props.text === '') {
      continue;
    }
    const childInText = child.isText || inText;
    out.push({
      viewName:
        child.component === TEXT_COMPONENT && inText
          ? VIRTUAL_TEXT_COMPONENT
          : child.component,
      props: child.props,
      children: expectedChildren(child, childInText),
    });
  }
  return out;
}

// VIEW NAME and child ORDER only — deliberately NO props, and that exclusion is what makes oracle 2
// reachable at all. The first version included `testID`, which is the only prop the program writes,
// so a missed PROP mark showed up as a structure failure and oracle 2 could never fire in a fuzz
// run: calibrated against a real injury (`recordPropEdit` not adding to `pendingProps`), it
// reported ORACLE 1. Two oracles where the earlier one subsumes the later leave the later
// unverified (`.claude/rules/test-harness-false-greens.md` §20), so structure means structure here
// and every payload question belongs to 2 and 3.
//
// Tags are excluded for a different reason: they are allocated per commit and legitimately differ
// between runs.
function describeExpected(nodes: readonly IExpected[]): string {
  return JSON.stringify(
    nodes.map(function map(node): unknown {
      return {
        v: node.viewName,
        c: (node.children as IExpected[]).map(map),
      };
    }),
  );
}

function describeCommitted(nodes: readonly IFakeNode[]): string {
  return JSON.stringify(
    nodes.map(function map(node): unknown {
      return {
        v: node.viewName,
        c: node.children.map(map),
      };
    }),
  );
}

function jsonEqual(a: unknown, b: unknown): boolean {
  return JSON.stringify(a ?? null) === JSON.stringify(b ?? null);
}

/** Every node reachable from the surface, in document order. Anchors and skipped nodes included. */
function reachable(surface: SymbioteSurface): ISymbioteNode[] {
  const out: ISymbioteNode[] = [];
  const walk = (nodes: readonly ISymbioteNode[]): void => {
    for (const node of nodes) {
      out.push(node);
      walk(node.children);
    }
  };
  walk(surface.children);
  return out;
}

/** Whether the commit is entitled to leave this node without a mirror or a fresh payload. */
function isSkippedAtCommit(node: ISymbioteNode): boolean {
  return (
    isAnchor(node) ||
    (node.component === RAW_TEXT_COMPONENT && node.props.text === '')
  );
}

/** ORACLE 2 — the mirror carries what fabricProps builds for the node right now. */
function findStaleMirror(surface: SymbioteSurface): string | undefined {
  for (const node of reachable(surface)) {
    if (isSkippedAtCommit(node)) continue;
    const record = node.committed;
    // A node with no mirror has never been committed, which after a commit means it is unreachable
    // from the walk — oracle 1 is what reports that, with a readable diff.
    if (record === undefined) continue;
    const fresh = fabricProps(node);
    if (!jsonEqual(record.props, fresh)) {
      return (
        `${record.viewName}#${record.tag}: the commit treated it as unchanged, but its payload ` +
        `differs.\n  mirror=${JSON.stringify(record.props)}\n  fresh =${JSON.stringify(fresh)}`
      );
    }
  }
  return undefined;
}

/** ORACLE 3 — what Fabric holds equals what the mirror claims Fabric holds. */
function findMirrorFabricDivergence(
  surface: SymbioteSurface,
): string | undefined {
  for (const node of reachable(surface)) {
    if (isSkippedAtCommit(node)) continue;
    const record = node.committed;
    if (record === undefined) continue;
    // In the fake slot a handle IS the recorded node, so this reads the bytes Fabric was handed.
    const handle = record.handle as unknown as IFakeNode;
    if (!jsonEqual(handle.props, record.props)) {
      return (
        `${record.viewName}#${record.tag}: the mirror and the Fabric node disagree.\n` +
        `  mirror=${JSON.stringify(record.props)}\n  fabric=${JSON.stringify(handle.props)}`
      );
    }
  }
  return undefined;
}

/**
 * ORACLE 4 — nothing reachable is still pending after a commit.
 *
 * Only the SUBTREE question (`hasPendingWork`) is asserted, and that scope is exact rather than
 * lazy: `renderableChildren` clears just that one for a skipped child, leaving its prop and
 * structure entries standing. That asymmetry predates the buffer — the old code set
 * `child.dirty = false` and left `propsDirty` alone — so asserting the other two here would report
 * long-standing, harmless behaviour as a regression of the change that only renamed it.
 */
function findUndrainedNode(surface: SymbioteSurface): string | undefined {
  for (const node of reachable(surface)) {
    if (hasPendingWork(node)) {
      return `${node.component} still carries pending work after a commit`;
    }
  }
  return undefined;
}

/** All four, in the order that makes a failure most readable: structure first, then payloads. */
function findViolation(
  recorder: ReturnType<typeof installFabric>,
  surface: SymbioteSurface,
): string | undefined {
  const expected = describeExpected(expectedChildren(rootOf(surface), false));
  const actual = describeCommitted(recorder.appRoot().children);
  if (expected !== actual) {
    return `ORACLE 1 (structure)\n  expected=${expected}\n  actual  =${actual}`;
  }
  const stale = findStaleMirror(surface);
  if (stale !== undefined) return `ORACLE 2 (freshness)\n  ${stale}`;
  const diverged = findMirrorFabricDivergence(surface);
  if (diverged !== undefined) return `ORACLE 3 (mirror)\n  ${diverged}`;
  const undrained = findUndrainedNode(surface);
  if (undrained !== undefined) return `ORACLE 4 (drain)\n  ${undrained}`;
  return undefined;
}

// ── THE RUNNER ──────────────────────────────────────────────────────────────────────────────────

const fabric = installFabric();
let nextRootTag = 1000;

/**
 * Execute a program against a fresh surface and return the first violation, or undefined.
 *
 * Pure with respect to the program: the same steps produce the same verdict, which is the property
 * the shrinker relies on. The process-global fake slot is reset per run for the same reason.
 */
function runProgram(steps: readonly IStep[]): string | undefined {
  fabric.reset();
  nextRootTag += 1;
  const surface = createSurface(nextRootTag);
  const pool: ISymbioteNode[] = [];

  for (let index = 0; index < steps.length; index += 1) {
    const step = steps[index];
    if (step === undefined) continue;
    applyStep(step, pool, surface);
    if (step.kind !== 'commit') continue;
    surface.commit();
    const violation = findViolation(fabric, surface);
    if (violation !== undefined) return `at step ${index}\n${violation}`;
  }

  // A final commit, so a program whose last step was a mutation is still checked.
  surface.commit();
  const violation = findViolation(fabric, surface);
  return violation === undefined
    ? undefined
    : `at the final commit\n${violation}`;
}

function applyStep(
  step: IStep,
  pool: ISymbioteNode[],
  surface: SymbioteSurface,
): void {
  switch (step.kind) {
    case 'commit':
      return;
    case 'createView':
    case 'createText':
    case 'createAnchor': {
      const node =
        step.kind === 'createAnchor'
          ? createAnchor()
          : step.kind === 'createText'
            ? createElement(TEXT_COMPONENT, true)
            : createElement('RCTView');
      const parent = at(containers(pool), step.a);
      if (parent === undefined) surface.appendChild(node);
      else appendChild(parent, node);
      pool.push(node);
      return;
    }
    // Raw text under a text container, which is the only legal home for one.
    case 'rawText': {
      const parent = at(
        pool.filter(node => node.isText),
        step.a,
      );
      if (parent === undefined) return;
      const node = createRawText(`t${step.value}`);
      appendChild(parent, node);
      pool.push(node);
      return;
    }
    // The op most likely to desync order if a mark is missed.
    case 'insertBefore': {
      const parent = at(
        containers(pool).filter(node => node.children.length > 0),
        step.a,
      );
      if (parent === undefined) return;
      const before = at(parent.children, step.b);
      if (before === undefined) return;
      const node = createElement('RCTView');
      insertBefore(parent, node, before);
      pool.push(node);
      return;
    }
    case 'remove': {
      const node = at(pool, step.a);
      if (node === undefined) return;
      const parent = node.parent;
      if (parent !== undefined) removeChild(parent, node);
      else surface.removeChild(node);
      // The whole subtree leaves with it, so it leaves the pool too — a later step addressing a
      // detached node would be testing the harness, not the engine.
      const gone = new Set<ISymbioteNode>();
      const collect = (current: ISymbioteNode): void => {
        gone.add(current);
        current.children.forEach(collect);
      };
      collect(node);
      for (let index = pool.length - 1; index >= 0; index -= 1) {
        const candidate = pool[index];
        if (candidate !== undefined && gone.has(candidate))
          pool.splice(index, 1);
      }
      return;
    }
    // MOVE, spelled as remove-then-reinsert, which is how every framework spells it.
    case 'move': {
      const node = at(
        pool.filter(candidate => candidate.parent !== undefined),
        step.a,
      );
      if (node === undefined) return;
      const target = at(
        containers(pool).filter(
          candidate => candidate !== node && !isDescendant(node, candidate),
        ),
        step.b,
      );
      if (target === undefined) return;
      appendChild(target, node);
      return;
    }
    case 'setProp': {
      const node = at(pool, step.a);
      if (node === undefined || node.component === RAW_TEXT_COMPONENT) return;
      setProp(node, 'testID', `id${step.value}`);
      return;
    }
    case 'setText': {
      const node = at(
        pool.filter(candidate => candidate.component === RAW_TEXT_COMPONENT),
        step.a,
      );
      if (node === undefined) return;
      setText(node, `t${step.value}`);
      return;
    }
  }
}

/**
 * Delete steps while the program still fails, then report the smallest one found.
 *
 * Greedy and re-checking rather than clever: a step's meaning depends on the pool, so removing an
 * earlier step can change what a later one touches. That means a shrink is a SEARCH — every
 * candidate is re-run and kept only if it still fails — and never a rewrite assumed to preserve the
 * failure. It also means the result is a local minimum, which is enough: a 60-step program routinely
 * shrinks to under ten, and the point is a reproduction a human can read.
 */
function shrink(
  steps: readonly IStep[],
  // Injected rather than closed over, so the shrinker's SEARCH can be tested against a synthetic
  // predicate. Without that seam it is only ever exercised when something else is already broken,
  // which is the worst moment to discover the search does not work.
  run: (candidate: readonly IStep[]) => string | undefined = runProgram,
): {
  steps: IStep[];
  violation: string;
} {
  let best = [...steps];
  let violation = run(best);
  if (violation === undefined) {
    throw new Error('shrink called on a program that passes');
  }

  let improved = true;
  // Bounded so a pathological case cannot hang the suite; the cap is far above what the programs
  // here need, and hitting it costs a longer reproduction rather than a wrong one.
  let budget = 400;
  while (improved && budget > 0) {
    improved = false;
    for (let index = 0; index < best.length && budget > 0; index += 1) {
      const candidate = [...best.slice(0, index), ...best.slice(index + 1)];
      budget -= 1;
      const candidateViolation = run(candidate);
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

// Defaults are a fixed set, so CI is deterministic and a red is reproducible. Both are overridable
// for a deep local run: SYMBIOTE_FUZZ_SEEDS=2000 SYMBIOTE_FUZZ_STEPS=200 pnpm vitest run <file>
const SEED_COUNT = Number(process.env.SYMBIOTE_FUZZ_SEEDS ?? '40');
const STEP_COUNT = Number(process.env.SYMBIOTE_FUZZ_STEPS ?? '60');

describe('commit fuzz — four oracles over a seeded mutation program', () => {
  it(`holds over ${SEED_COUNT} programs of ${STEP_COUNT} steps`, () => {
    const failures: string[] = [];
    for (let seed = 1; seed <= SEED_COUNT; seed += 1) {
      const program = generateProgram(seed, STEP_COUNT);
      if (runProgram(program) === undefined) continue;
      const minimal = shrink(program);
      failures.push(
        `seed ${seed} — shrunk from ${STEP_COUNT} to ${minimal.steps.length} steps\n` +
          `${describeProgram(minimal.steps)}\n${minimal.violation}`,
      );
      // One reproduction is what a reader acts on; twenty is a wall.
      break;
    }
    expect(failures.join('\n\n')).toBe('');
  });

  // ── BREAK ARMS ────────────────────────────────────────────────────────────────────────────────
  // Each reproduces a defect one oracle exists for, WITHOUT touching the engine — so these run in
  // CI beside everything else and prove the oracles can still fail. An oracle whose only evidence
  // is a temporary source edit somebody made once is an oracle nobody can re-verify.

  it('ORACLE 1 catches a structural mark that never happened', () => {
    // What an adapter bypassing the mutation API would do: splice the child list directly.
    fabric.reset();
    const surface = createSurface(9001);
    const parent = createElement('RCTView');
    appendChild(parent, createElement('RCTView'));
    appendChild(parent, createElement('RCTView'));
    surface.appendChild(parent);
    surface.commit();
    expect(findViolation(fabric, surface)).toBeUndefined();

    parent.children.splice(0, 1);
    surface.commit();

    expect(findViolation(fabric, surface)).toMatch(/ORACLE 1/);
  });

  it('ORACLE 2 catches a prop write that never marked', () => {
    // The stale-UI class in its purest form, and the reason oracle 1 is not enough: the tree SHAPE
    // is still perfectly correct, so a structural comparison reports success.
    fabric.reset();
    const surface = createSurface(9002);
    const node = createElement('RCTView');
    setProp(node, 'testID', 'before');
    surface.appendChild(node);
    surface.commit();
    expect(findViolation(fabric, surface)).toBeUndefined();

    // Straight into the bag, bypassing setProp and therefore the mark.
    node.props.nativeID = 'written-without-a-mark';
    surface.commit();

    const violation = findViolation(fabric, surface);
    expect(violation).toMatch(/ORACLE 2/);
    // And pin that oracle 1 is genuinely blind to it, or this row proves nothing about the split.
    const expected = describeExpected(expectedChildren(rootOf(surface), false));
    expect(describeCommitted(fabric.appRoot().children)).toBe(expected);
  });

  it('ORACLE 3 catches a mirror that claims a payload Fabric never received', () => {
    // A commit that updates its own record without emitting the clone passes oracle 2 — the mirror
    // agrees with the retained tree — and is exactly the divergence this one exists for.
    //
    // Poisons `nativeID`, NOT `testID`, and that is load-bearing rather than arbitrary: oracle 1
    // reads testID, so a testID-shaped defect is caught by the STRUCTURE oracle first and this arm
    // then proves only that something refused. Written that way it failed for the wrong reason on
    // its first run (`.claude/rules/verify-the-deciding-side.md`, "a negative test can be satisfied
    // by an EARLIER guard"). `nativeID` is invisible to oracle 1 by construction.
    fabric.reset();
    const surface = createSurface(9003);
    const node = createElement('RCTView');
    setProp(node, 'testID', 'real');
    surface.appendChild(node);
    surface.commit();
    expect(findViolation(fabric, surface)).toBeUndefined();

    const record = node.committed;
    if (record === undefined) throw new Error('the node did not commit');
    // Both sides moved, so the mirror agrees with the retained tree and oracle 2 is satisfied. Only
    // the Fabric node was never told.
    node.props.nativeID = 'claimed';
    record.props = { ...record.props, nativeID: 'claimed' };

    expect(findViolation(fabric, surface)).toMatch(/ORACLE 3/);
  });

  it('ORACLE 4 detects a node carrying pending work', () => {
    // NAMED for what it proves, which is narrower than the other three: this exercises the
    // DETECTOR, not the engine. Leaving an entry undrained after a commit is precisely what the
    // engine does not do, so the state cannot be reached without editing the engine — and the
    // engine-side break-test for the drain lives in `edit-buffer.test.ts`, where the sweep is
    // disabled for real and named rows go red. Here the subject is `findUndrainedNode`.
    //
    // `markDirty` alone, so no payload moves and oracles 1-3 all pass: a defect that changed props
    // would be caught earlier and this arm would report someone else's guard.
    fabric.reset();
    const surface = createSurface(9004);
    const node = createElement('RCTView');
    surface.appendChild(node);
    surface.commit();
    expect(findViolation(fabric, surface)).toBeUndefined();

    markDirty(node);

    expect(findViolation(fabric, surface)).toMatch(/ORACLE 4/);
  });

  it('the shrinker searches down to the one step that fails', () => {
    // Run against a SYNTHETIC predicate rather than the engine, because the property under test is
    // the search itself: does deleting steps while the failure persists converge on the culprit.
    // Using the engine would make this a test of whichever defect happened to be injected, and
    // there is no defect to inject without editing the engine.
    const POISON = 777;
    const run = (candidate: readonly IStep[]): string | undefined =>
      candidate.some(step => step.value === POISON) ? 'poisoned' : undefined;

    const program = generateProgram(7, 40).map(step => ({ ...step, value: 1 }));
    program.splice(17, 0, {
      kind: 'setProp',
      a: 0.5,
      b: 0.5,
      value: POISON,
    });

    const minimal = shrink(program, run);
    expect(minimal.steps).toHaveLength(1);
    expect(minimal.steps[0]?.value).toBe(POISON);
    expect(minimal.violation).toBe('poisoned');

    // And it refuses a program that passes, rather than looping or reporting a false minimum.
    expect(() => shrink(program, () => undefined)).toThrow(/passes/);
  });
});

// The surface's top-level children, shaped as a node so the oracle has one entry point. Not a real
// engine node — only `children` is ever read off it.
function rootOf(surface: SymbioteSurface): ISymbioteNode {
  return { children: surface.children } as unknown as ISymbioteNode;
}
