// What a commit asks the host AFTER it has committed, and whether that grows with the tree.
//
// `runCommittedHooks` and `runDeferredAttaches` are handed `isNodeCommitted`, which is
// `getNativeTag(node) !== undefined` — and that is `committedRecordOf`, which calls `flushOps()`
// and then CROSSES TO THE HOST. Both hooks iterate a set of nodes rather than a set of changes:
// every node whose behavior declared `afterCommit` is in `committedEachTime` for as long as it is
// mounted.
//
// So the question this file answers is the one this investigation keeps asking in new places: is
// the work proportional to the CHANGE or to the TREE? A `<text-input>` declares `afterCommit`, so
// the benchmark row puts one in every row — and if the predicate is asked per node per commit, a
// thousand-row list pays a thousand host crossings to select one row.
//
// Counted rather than timed, and counted at the HOST rather than at the call site: a crossing is
// the quantity this architecture exists to remove, and headless prices one at zero (the file's
// opening rule). The count is deterministic; the clock would say nothing.

import { beforeEach, describe, expect, it } from 'vitest';
import { installRecordingFabric } from '@symbiote-native/test-utils';
import {
  appendChild,
  createElement,
  createSurface,
  registerHostBehavior,
  routeProp,
  setTreeHost,
  treeHost,
  type ISymbioteNode,
} from '../index';

const fabric = installRecordingFabric();
const ROOT_TAG = 6620;
const VIEW = 'RCTView';
// A view name nothing else registers a behavior for, so this file cannot be perturbed by — or
// perturb — the real Pressable / TextInput machines.
const SUBJECT_VIEW = 'RCTProbeAfterCommitView';

let recordReads = 0;

function countRecordReads(): void {
  const base = treeHost();
  if (base === undefined) throw new Error('no host installed');
  setTreeHost({
    ...base,
    committedRecordOf: node => {
      recordReads += 1;
      return base.committedRecordOf(node);
    },
  });
}

/**
 * Which nodes the hook reached, not how many times it fired.
 *
 * A count is the wrong unit here: `committedEachTime` is process-wide and nothing in this file
 * unmounts, so every case's nodes are still live for the next one and a total is the whole file's
 * history rather than this case's result. Asking whether THESE fifty were reached is the question,
 * and it is unaffected by what a previous case left mounted.
 */
let hookReached = new Set<ISymbioteNode>();

function registerSubjectBehavior(): void {
  registerHostBehavior(SUBJECT_VIEW, {
    // `attach` is required — the registry calls it unconditionally on every node it claims.
    attach: () => {},
    afterCommit: node => {
      hookReached.add(node);
    },
  });
}

function buildList(rows: number): {
  surface: ReturnType<typeof createSurface>;
  first: ISymbioteNode;
  subjects: ISymbioteNode[];
} {
  const surface = createSurface(ROOT_TAG + rows);
  const list = createElement(VIEW);
  surface.appendChild(list);
  const subjects: ISymbioteNode[] = [];
  let first: ISymbioteNode | undefined;
  for (let at = 0; at < rows; at += 1) {
    const row = createElement(VIEW);
    // One behaviour-carrying node per row, exactly as the benchmark row carries one `<text-input>`.
    // The free function, not a method. `row.appendChild?.(…)` typechecks and silently does nothing,
    // which built an EMPTY list and made the hook count read zero — the same shape of instrument
    // defect this investigation has found four times in its own probes.
    const subject = createElement(SUBJECT_VIEW);
    subjects.push(subject);
    appendChild(row, subject);
    appendChild(list, row);
    if (first === undefined) first = row;
  }
  if (first === undefined) {
    throw new Error('an empty list has nothing to select');
  }
  surface.commit();
  return { surface, first, subjects };
}

beforeEach(() => {
  fabric.reset();
  recordReads = 0;
  hookReached = new Set();
});

describe('what a commit asks the host after committing', () => {
  it('does not ask once per mounted behavior when one node changes', () => {
    countRecordReads();
    registerSubjectBehavior();

    const narrow = buildList(50);
    recordReads = 0;
    routeProp(narrow.first, 'testID', 'changed');
    narrow.surface.commit();
    const askedAt50 = recordReads;

    const wide = buildList(500);
    recordReads = 0;
    routeProp(wide.first, 'testID', 'changed');
    wide.surface.commit();
    const askedAt500 = recordReads;

    // The tree grew ten-fold and the CHANGE did not. Measured before the fix: 50 and 550 — one
    // crossing per mounted behavior, across every surface in the process, on a commit that moved
    // one prop. A predicate asked once per NODE instead reads zero both times, since every node
    // here committed when its list was built.
    expect(askedAt50).toBe(0);
    expect(askedAt500).toBe(0);
  });

  // The control, and without it the assertion above passes just as well on a hook that stopped
  // running altogether. It asserts the FIRST commit rather than every commit, and that is the
  // contract change: the beat used to reach every mounted behavior on every commit, which is what
  // made it cost `propOf` × 1 000 per select. Every node still gets its beat when it lands — the
  // seeding case every behavior depends on — and after that only when something on it moves.
  it('runs the hook for every node on the commit that lands it', () => {
    countRecordReads();
    registerSubjectBehavior();

    hookReached = new Set();
    const list = buildList(50);

    for (const subject of list.subjects) {
      expect(hookReached.has(subject)).toBe(true);
    }
  });

  // THE BEAT IS NARROWED, and this states the new contract rather than the old one.
  //
  // `afterCommit` used to run for every mounted behavior on every commit, and the hook BODY is
  // where the remaining cost is: TextInput's asks the host for its `value` to compare against its
  // native mirror, which the ledger measures at `propOf` × 1 000 per commit in all four adapters
  // (F-67). Narrowing the population is what removes it, and the narrowing is sound because both
  // behaviors that document why they need the beat need it for the SAME event — a prop written on
  // their own node:
  //
  //   switch.ts        "a check scheduled only from `onChange` never re-runs for a prop change with
  //                     no preceding native event — e.g. the app moves `value` on its own
  //                     initiative … `afterCommit` costs nothing extra (it fires only on a commit
  //                     that already changed something) and closes that one case"
  //   text-input.ts    the controlled handshake: either the app moved `value`, or the user typed —
  //                    and typing writes `mostRecentEventCount`, so both are prop writes
  //
  // A fold that STRIPS a prop is covered too: the write happened, and it is the PAYLOAD that comes
  // out byte-identical, which is the case `IHostBehavior.afterCommit` was split out for.
  it('reaches a node whose props changed and skips one whose did not', () => {
    countRecordReads();
    registerSubjectBehavior();

    const list = buildList(20);
    const [touched, untouched] = list.subjects;
    hookReached = new Set();

    routeProp(touched, 'testID', 'moved');
    list.surface.commit();

    expect(hookReached.has(touched)).toBe(true);
    expect(hookReached.has(untouched)).toBe(false);
  });

  // And the half the cache could plausibly break: a node that has NOT committed yet must not be
  // remembered as committed. It enters the set when its behavior attaches, which is at
  // `createElement` — before any commit — so an uncommitted node is asked again next time rather
  // than skipped forever.
  it('reaches a node that only commits later', () => {
    countRecordReads();
    registerSubjectBehavior();

    const list = buildList(10);
    const late = createElement(SUBJECT_VIEW);
    hookReached = new Set();
    // Created but not yet in the tree: it has no Fabric record, so the first commit after this
    // must not reach it — and must not write it off either.
    list.surface.commit();
    expect(hookReached.has(late)).toBe(false);

    appendChild(list.first, late);
    list.surface.commit();
    expect(hookReached.has(late)).toBe(true);
  });
});
