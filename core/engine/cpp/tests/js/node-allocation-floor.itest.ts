// How much of a `createElement` is just ALLOCATING the node, on the engine a device runs?
//
// why: §18c closes with "the fill is dominated by allocating a node object and recording an op per
// node, which is what the buffer IS — there is no trick that removes it". That is an assertion, not
// a reading, and the two halves it names have never been separated. The Hermes split says a create
// is **1.12 us and 53% of the fill** (`fill-phase-cost.itest.ts`), so whichever half dominates it is
// the largest single line we own anywhere.
//
// `SymbioteNode` is not exported and should not be, so this file prices its FLOOR instead: an
// ordinary JS object of the same shape, built the same way. Three arms, one process:
//
//   EMPTY   `{}`                          — what an allocation costs before any field
//   LITERAL a 16-field object literal      — the shape, declared at once
//   FIELDS  a constructor writing 16 fields — the shape production actually builds
//                                            (`node.ts:366`, every slot assigned up front so the
//                                            class keeps ONE hidden class)
//
// **This is a floor and it is meant to be below the real thing** — it records no op, touches no side
// table, asks no registry and has no brand symbol. §18l is why that is stated rather than assumed: a
// floor arm that quietly does something the thing it stands for does not is worse than no floor. The
// error here runs the safe way — the arms do strictly LESS than `createElement`, so whatever they
// cost is a lower bound on its allocation half, and the remainder is at most what is left.
//
// RUN ON `bench:itest` (Release, Hermes).

import { describe, expect, it, print, report } from './harness';

const NODES = 10_000;
const SAMPLES = 5;

/**
 * What one `createElement` costs, from `fill-phase-cost.itest.ts` — the denominator every share
 * below is quoted against.
 *
 * **It is an `hermesc -O` figure and this file must be run the same way** (§21): the harness's
 * default runtime compile does not optimize, reads 2.35 here, and would make every percentage a
 * comparison between two different compilers. `SYMBIOTE_ITEST_BYTECODE=1`.
 */
const CREATE_US = 1.12;

// The same sixteen slots `SymbioteNode` declares, in the same order, with the same initial values.
// Order matters to a hidden class, so a reordering here would price a different shape.
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
 * Time `make` over `NODES` iterations, keeping every result reachable until the clock stops.
 *
 * THE SINK IS NOT DECORATION. An allocation whose result is dropped immediately is an allocation a
 * collector can serve from the youngest generation over and over; production holds every node in a
 * tree, so the arm has to hold them too or it prices a workload nobody runs.
 */
function time(make: () => unknown): number {
  const sink: unknown[] = [];
  const startedAt = performance.now();
  for (let at = 0; at < NODES; at += 1) sink.push(make());
  const wall = performance.now() - startedAt;
  // Read after the clock so the array cannot be optimised away, and so the read itself is not timed.
  if (sink.length !== NODES) throw new Error('the sink lost an entry');
  return wall;
}

/** Best of `SAMPLES`, because timing noise is one-sided and the minimum is the reading (§6). */
function best(make: () => unknown): number {
  let lowest = Infinity;
  for (let sample = 0; sample < SAMPLES; sample += 1) {
    lowest = Math.min(lowest, time(make));
  }
  return lowest;
}

describe('what a node allocation costs before any engine work', () => {
  // why: THE SPLIT §18c asserts. A create is 1.12 us on `-O` Hermes; if the object itself is a small
  // part of that, the op recording is the line to look at and "there is no trick that removes it" is
  // a claim about the buffer rather than about allocation. If it is most of it, the opposite.
  it('is a small part of what a create costs', () => {
    // DISCARDED: the first arm in a process pays a cold allocator, and it would land on EMPTY, which
    // is the arm every other number is read against.
    best(() => ({}));

    const empty = best(() => ({}));
    const literal = best(() => ({
      brand: true,
      component: 'RCTView',
      isText: false,
      listeners: undefined,
      hasCommitHook: false,
      resolvesImageSources: false,
      nativeIdWinsOverId: false,
      styleParts: undefined,
      payloadFold: undefined,
      hostBehavior: undefined,
      childHost: undefined,
      wrapper: undefined,
      mayHaveChildren: false,
      isTornDown: false,
      slot: 0,
      slotBatch: 0,
    }));
    const fields = best(() => new FieldsNode('RCTView', false));

    const each = (wall: number): string =>
      `${((wall * 1_000) / NODES).toFixed(3)}`;
    print(
      `DEBUG ALLOCFLOOR empty ${each(empty)} us · literal ${each(literal)} us · ` +
        `constructor ${each(fields)} us over ${NODES} nodes · ` +
        `a create costs ${CREATE_US} us, so the object is at most ` +
        `${(((fields * 1_000) / NODES / CREATE_US) * 100).toFixed(0)}% of it`,
    );

    // THE GATE: sixteen fields must cost SEVERAL TIMES none, not merely more. The bare
    // `toBeGreaterThan(empty)` this started as did not fail its own break-test — hoisting the
    // instance out of the loop so the arm allocated nothing still read 0.032 against empty's 0.031
    // and passed, because two arms a hair apart order themselves at random. Measured, the arms are
    // 0.28 against 0.031, so a 3x floor sits an order of magnitude inside the true margin and an
    // arm that stopped allocating lands outside it. That is what catches a literal hoisted out of
    // the loop or a constructor optimised away. The per-node figures above stay a PRINT; a bound on
    // them would be a bound on the machine.
    expect(fields).toBeGreaterThan(empty * 3);
  });
});

report();
