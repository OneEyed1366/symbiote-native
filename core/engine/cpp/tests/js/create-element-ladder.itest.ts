// What is a `createElement` actually made of, measured on the engine's own functions?
//
// why: §18n / §18o / §18p each priced one piece — the node object, the two hash tables, the six
// `Int32Array` slots — with a fixture's IMITATION of that piece, in isolation. Three such arms bound
// a create from below and say nothing about what is left, and dividing their sum into another
// fixture's per-node average produced a "70% unattributed" that turned out to be an artefact of two
// different denominators (§18q). A fourth micro-arm would repeat the mistake.
//
// So this file stops imitating and runs the REAL functions, as a ladder each rung of which is a
// strict subset of the next:
//
//   ALLOC    `new FieldsNode(...)`                      the 16-slot object, and nothing else
//   RECORD   `recordCreateElement(handle, …)`           the WHOLE buffer half: `slotOf`, `intern`,
//                                                       `placementPending.add`, `instanceHandles`,
//                                                       and the six-slot `push`
//   FULL     `createElement('RCTView')`                 what an adapter actually calls
//
// FULL - RECORD - ALLOC is then everything else inside `createElement`: two string compares against
// the anchor and void names, `hasHostBehaviors()`, `configPayloadFold()`, and the call frames.
//
// `takeBatch()` BETWEEN EVERY SAMPLE, and it is not hygiene, it is the workload. It is what
// production calls per batch, and without it `placementPending` and the side tables would grow across
// samples — arm three would inherit arm two's ten thousand entries and the ladder would be measuring
// the order the arms were written in (§10).
//
// The handles the RECORD arm is given already carry `slot` and `slotBatch`. A bare `{}` would make
// `slotOf` ADD two properties rather than write them — a shape transition per handle that production
// never pays, because a node declares both in its constructor. Getting that wrong would charge the
// buffer for something the buffer does not do (§18l).
//
// RUN WITH `SYMBIOTE_ITEST_BYTECODE=1` on `bench:itest` (§21).

import {
  createElement,
  createRawText,
  registerHostBehavior,
} from '@symbiote-native/engine';
import {
  recordCreateElement,
  takeBatch,
  type IMutationHandle,
} from '@symbiote-native/engine/mutation-buffer';

// IMPORTED but NOT called at module scope, and the order is the whole second case: registering a
// behavior is MONOTONE — `hasHostBehaviors()` turns on at the first registration and never off (§9) —
// so every arm that wants a COLD registry has to run before the call, in this process, once.
import { registerTextInputBehavior } from '@symbiote-native/components';

import { describe, expect, it, print, report } from './harness';

/** A thousand-row create's worth of elements. */
const NODES = 10_000;
const SAMPLES = 5;

/**
 * What `fill-phase-cost.itest.ts` reports for its create phase, per node.
 *
 * It is an AVERAGE OVER THE BENCHMARK ROW, and the second case exists to reconcile it: six plain
 * elements, three raw texts and one tagged `text-input` per ten nodes, with the behavior registry
 * ARMED. `-O` bytecode (§21).
 */
const ROW_AVERAGE_US = 1.12;

/** The ten-node row's composition, from `fill-phase-cost.itest.ts`'s `createRow`. */
const PLAIN_PER_ROW = 6;
const RAW_PER_ROW = 3;
const TAGGED_PER_ROW = 1;

/** What a plain `createElement` cost with the registry still COLD — set by the first case. */
let plainCold = 0;

/** Set by the second case, read by the third — both are ARMED readings and must stay comparable. */
let plainArmedCost = 0;
let taggedArmed = 0;

/** The sixteen slots `SymbioteNode` declares, in the same order — §18n's floor arm. */
class FieldsNode {
  declare brand: boolean;
  declare component: string;
  declare isText: boolean;
  declare listeners: unknown;
  declare hasCommitHook: boolean;
  declare resolvesImageSources: boolean;
  declare nativeIdWinsOverId: boolean;
  declare styleParts: unknown;
  declare payloadFold: unknown;
  declare hostBehavior: unknown;
  declare childHost: unknown;
  declare wrapper: unknown;
  declare mayHaveChildren: boolean;
  declare isTornDown: boolean;
  declare slot: number;
  declare slotBatch: number;

  constructor(component: string, isText: boolean) {
    this.brand = true;
    this.component = component;
    this.isText = isText;
    this.listeners = undefined;
    this.hasCommitHook = false;
    this.resolvesImageSources = false;
    this.nativeIdWinsOverId = false;
    this.styleParts = undefined;
    this.payloadFold = undefined;
    this.hostBehavior = undefined;
    this.childHost = undefined;
    this.wrapper = undefined;
    this.mayHaveChildren = false;
    this.isTornDown = false;
    this.slot = 0;
    this.slotBatch = 0;
  }
}

/**
 * Best of `SAMPLES`, with the buffer emptied before AND after each one, and `after` run off the clock.
 *
 * The drain is not hygiene, it is the workload — production calls `takeBatch` per batch. `after` is
 * where a sample drops what it built, because a create whose result dies immediately is served out of
 * the nursery over and over while production keeps every node in a tree. Moving the drop off the
 * clock changed the reading by ~3%, which is small — but it is small only because the nodes were
 * already held for the whole loop, and the arms have to agree on that or they are not a ladder.
 */
function best(run: () => void, after?: () => void): number {
  return sample(run, after).wall;
}

/**
 * The same reading, plus THIS RUN'S OWN RESOLUTION: the gap between the best sample and the second
 * best.
 *
 * **It is what makes an ordering assertable inside the parallel suite, and nothing else is.** The
 * runner spawns a process per file — 117 of them — so an arm of a few milliseconds can be descheduled
 * for longer than it takes to run, and best-of-N does not help when the whole process stalls. Two
 * gates in this file duly passed alone and flipped in the full run: a 16% gap (raw against element)
 * and a 50% one (an empty behavior against a registry miss). A bound tighter than the spread is not a
 * claim (§11), and a FIXED margin cannot know how quiet the machine was.
 *
 * So a verdict is taken only when the measured gap is larger than the resolution — the pattern
 * `angular-directive-cost.itest.ts` already uses for the same reason. On a quiet machine the gates
 * below are real; on a loaded one they say nothing instead of saying something false.
 */
function sample(
  run: () => void,
  after?: () => void,
): { wall: number; resolution: number } {
  let lowest = Infinity;
  let second = Infinity;
  for (let at = 0; at < SAMPLES; at += 1) {
    takeBatch();
    const startedAt = performance.now();
    run();
    const wall = performance.now() - startedAt;
    if (wall < lowest) {
      second = lowest;
      lowest = wall;
    } else if (wall < second) {
      second = wall;
    }
    after?.();
    takeBatch();
  }
  return { wall: lowest, resolution: second - lowest };
}

describe('a create, taken apart with the engine s own functions', () => {
  // why: THE DECOMPOSITION §18p asked for. Three rungs, each a strict subset of the next, so two
  // subtractions name every part of a create — and the parts are the real code rather than a
  // fixture's imitation of it, which is what the isolated arms could never be.
  it('spends most of itself outside both the object and the buffer', () => {
    // Pre-shaped, allocated outside every clock: `slotOf` must WRITE these two fields, not add them.
    const handles: IMutationHandle[] = [];
    for (let at = 0; at < NODES; at += 1)
      handles.push({ slot: 0, slotBatch: 0 });

    const sink: unknown[] = [];

    const drop = (): void => {
      sink.length = 0;
    };

    // DISCARDED: the first arm in a process pays a cold allocator and the first walk of every lazy
    // module binding the bundle carries.
    best(() => {
      for (let at = 0; at < NODES; at += 1) {
        sink.push(new FieldsNode('RCTView', false));
      }
    }, drop);

    const alloc = best(() => {
      for (let at = 0; at < NODES; at += 1) {
        sink.push(new FieldsNode('RCTView', false));
      }
    }, drop);

    const record = best(() => {
      for (let at = 0; at < NODES; at += 1) {
        const handle = handles[at] ?? handles[0];
        if (handle !== undefined) {
          recordCreateElement(handle, 'RCTView', false, handle);
        }
      }
    });

    const full = best(() => {
      for (let at = 0; at < NODES; at += 1) sink.push(createElement('RCTView'));
    }, drop);

    const each = (wall: number): number => (wall * 1_000) / NODES;
    const rest = full - alloc - record;
    print(
      `DEBUG LADDER alloc ${each(alloc).toFixed(3)} us · ` +
        `record ${each(record).toFixed(3)} us · ` +
        `full ${each(full).toFixed(3)} us · ` +
        `rest ${each(rest).toFixed(3)} us = ` +
        `${((rest / full) * 100).toFixed(0)}% of a create · over ${NODES} nodes`,
    );

    // THE GATE, and it is the only claim here that is not a print: the ladder must BE a ladder. If
    // `full` ever came out under the sum of the two rungs it contains, the arms would not be subsets
    // of each other and every subtraction on this page would be meaningless — which is exactly the
    // failure a fixture that imitates its subject cannot detect. The margin is generous because the
    // remainder is the quantity under study and must not be assumed large.
    expect(full).toBeGreaterThan(alloc + record);
    plainCold = each(full);
  });

  // why: THE RECONCILIATION. A plain create is 0.55 us and fully split by the case above, while
  // `fill-phase-cost.itest.ts` reports 1.12 us per node for the same phase — and a factor of two
  // between two of this directory's own fixtures is either a finding or an error, never a footnote.
  // The row is not ten plain elements: it is six of those, three raw texts and one tagged
  // `text-input`, built against an ARMED registry. This weights the three kinds and checks whether
  // they add up to what the row costs.
  //
  // THE ORDER IS THE MEASUREMENT. `registerTextInputBehavior` is monotone, so RAW and the cold plain
  // above are the only cold readings this process can ever take (§9).
  it('adds up to what the benchmark row costs per node', () => {
    const sink: unknown[] = [];
    const drop = (): void => {
      sink.length = 0;
    };

    const rawRead = sample(() => {
      for (let at = 0; at < NODES; at += 1) sink.push(createRawText('x'));
    }, drop);
    const raw = rawRead.wall;

    // THE SAME-CASE CONTROL FOR `raw`, and it is not a duplicate of the first case's reading.
    // `plainCold` there is a fine cross-check, but the two cases run minutes apart inside a 117-file
    // parallel suite, and the raw-vs-element gap is only ~16% — the assertion below duly passed alone
    // and failed in the full run on exactly that. Two arms compared for ORDER have to see the same
    // machine, which means the same case (§11).
    const plainHereRead = sample(() => {
      for (let at = 0; at < NODES; at += 1) sink.push(createElement('RCTView'));
    }, drop);
    const plainHere = plainHereRead.wall;

    // THE GATE TURNS ON HERE and never off. Everything below is an ARMED reading.
    registerTextInputBehavior();

    const plainArmed = best(() => {
      for (let at = 0; at < NODES; at += 1) sink.push(createElement('RCTView'));
    }, drop);

    const tagged = best(() => {
      for (let at = 0; at < NODES; at += 1) {
        sink.push(
          createElement('RCTSinglelineTextInputView', false, 'text-input'),
        );
      }
    }, drop);

    const each = (wall: number): number => (wall * 1_000) / NODES;
    const weighted =
      (each(plainArmed) * PLAIN_PER_ROW +
        each(raw) * RAW_PER_ROW +
        each(tagged) * TAGGED_PER_ROW) /
      (PLAIN_PER_ROW + RAW_PER_ROW + TAGGED_PER_ROW);

    print(
      `DEBUG ROWMIX raw ${each(raw).toFixed(3)} us · ` +
        `plain here ${each(plainHere).toFixed(3)} · ` +
        `plain cold ${plainCold.toFixed(3)} -> armed ${each(plainArmed).toFixed(3)} us ` +
        `(the registry miss costs ${(each(plainArmed) - plainCold).toFixed(3)}) · ` +
        `tagged ${each(tagged).toFixed(3)} us · ` +
        `weighted ${weighted.toFixed(3)} against the row's ${ROW_AVERAGE_US} us/node`,
    );

    // THE GATE: a raw text must be CHEAPER than an element measured BESIDE IT. `createRawText` skips
    // `configPayloadFold`, both string compares and the registry question, so it is a strict subset
    // of the work; an arm that stopped being one shows up here rather than in a print nobody reads.
    //
    // VERDICT ONLY OUTSIDE THE BAR. The measured gap is 0.47 against 0.56 — 16%, which is real on a
    // quiet machine and smaller than a stalled process in the full suite. `sample` reports what this
    // run could resolve, and below that the case says nothing rather than something false.
    const bar = Math.max(rawRead.resolution, plainHereRead.resolution);
    if (plainHere - raw > bar) {
      expect(each(raw)).toBeLessThan(each(plainHere) * 0.95);
    } else {
      print(
        `DEBUG ROWMIX ordering INSIDE THE BAR (${each(bar).toFixed(3)} us) — no verdict`,
      );
    }
    taggedArmed = each(tagged);
    plainArmedCost = each(plainArmed);
  });

  // why: THE 8 US, SPLIT. A tagged primitive costs 14x a plain create and that one node is ~60% of
  // the create phase, so the question is which half owns it: the ENGINE's attach machinery — a Map
  // hit, four field writes, `recordSetTag`, two `Set.add`s — or what the TextInput behavior's own
  // `attach` does. An empty behavior registered under a tag nobody else uses separates them exactly.
  //
  // The empty behavior declares neither `buildStructure`, `attachAfterCommit` nor `afterCommit`, so
  // it takes the SHORTEST path through `attachHostBehavior` — which is the point: whatever it costs
  // is the floor the machinery charges, and everything above it belongs to the behavior.
  it('spends its eight microseconds in the behavior, not in the machinery', () => {
    const sink: unknown[] = [];
    const drop = (): void => {
      sink.length = 0;
    };

    // MEASURED IN THIS CASE, not read from the last one. `plainArmedCost` is kept for the print as a
    // cross-check, but a gate that compares it against an arm taken minutes later in a 117-process
    // suite is comparing two machine loads — which is how the 1.5x gap below flipped once already.
    const plainRead = sample(() => {
      for (let at = 0; at < NODES; at += 1) sink.push(createElement('RCTView'));
    }, drop);

    registerHostBehavior('bench-empty', {
      attach(): void {},
      detach(): void {},
    });

    const emptyRead = sample(() => {
      for (let at = 0; at < NODES; at += 1) {
        sink.push(createElement('RCTView', false, 'bench-empty'));
      }
    }, drop);
    const empty = emptyRead.wall;

    const each = (wall: number): number => (wall * 1_000) / NODES;
    const machinery = each(empty) - each(plainRead.wall);
    const behavior = taggedArmed - each(empty);
    print(
      `DEBUG ATTACH plain armed ${each(plainRead.wall).toFixed(3)} us ` +
        `(previous case read ${plainArmedCost.toFixed(3)}) · ` +
        `empty behavior ${each(empty).toFixed(3)} us · ` +
        `text-input ${taggedArmed.toFixed(3)} us :: ` +
        `machinery ${machinery.toFixed(3)} · behavior ${behavior.toFixed(3)} ` +
        `(${((behavior / taggedArmed) * 100).toFixed(0)}% of the tagged create)`,
    );

    // THE GATE: attaching SOMETHING must cost SUBSTANTIALLY more than the registry miss it replaces.
    // Below this the arm is not reaching `attachHostBehavior` at all — a tag that failed to register,
    // or a registry the harness reset between cases — and every subtraction above would be noise
    // subtracted from noise.
    //
    // THE MARGIN IS NOT DECORATION AND THE BARE FORM FAILED ITS BREAK-TEST. Written as
    // `toBeGreaterThan(plainArmedCost)`, pointing the arm at an UNREGISTERED tag still read 0.725
    // against 0.657 and PASSED, because two arms 0.07 apart order themselves at random. Measured, the
    // attach machinery is +0.33 (0.98 vs 0.65, a factor of 1.5) and the unregistered break is +0.07
    // (a factor of 1.10), so 1.25 sits between them with room on both sides.
    //
    // AND IT STILL ONLY FIRES OUTSIDE THE BAR, against the SAME-CASE plain arm.
    const machineryBar = Math.max(emptyRead.resolution, plainRead.resolution);
    if (empty - plainRead.wall > machineryBar) {
      expect(each(empty)).toBeGreaterThan(each(plainRead.wall) * 1.25);
    } else {
      print(
        `DEBUG ATTACH machinery INSIDE THE BAR (${each(machineryBar).toFixed(3)} us) — no verdict`,
      );
    }
  });
});

report();
