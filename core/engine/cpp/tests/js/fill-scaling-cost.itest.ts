// Is our fill paying ordinary interpretation, or is it sitting on an engine slow path?
//
// FOUND BY READING AN ISSUE AND REFUSING TO MATCH IT ON DIRECTION ALONE. facebook/hermes#1294
// reports a loop over a large array at **1400 ms on Hermes against 60 on JSC** — 23x. §18c has our
// fill at 34.1 against 22.4 — **1.5x**. Same direction, an order of magnitude apart, and the two
// have different causes: 1.5x is roughly what ordinary code costs without a JIT, while a 23x is a
// CLIFF — a specific slow path the workload fell into at size.
//
// A single ratio cannot tell those apart, so this file asks the question that can: **does our
// per-node fill cost stay flat as the tree grows?**
//
//   flat      ordinary interpretation. #1294 is not our situation and the 1.5x is the price of the
//             engine, not a defect to find.
//   climbing  we are on a slow path that engages at size, and #1294's class IS ours.
//
// §7 — for a claim about complexity, read a FACTOR, not a millisecond. The sizes step by 4x so
// linear work reads as 4x per step and the per-node column reads flat; anything super-linear shows
// up in the per-node column before it shows up in the wall.
//
// NOTHING IS FLUSHED INSIDE THE CLOCK. A read is a batch boundary, so a `flushOps` between sizes
// would put an `applyOps` crossing into a figure that exists to hold none. Each size commits AFTER
// its own timing, which is also what keeps the surface from carrying the previous size's tree into
// the next one's allocation behaviour.
//
// RUN ON `bench:itest` (Release, Hermes).

import {
  appendChild,
  createElement,
  createSurface,
  routeProp,
} from '@symbiote-native/engine';

import { describe, expect, it, mounted, print, report } from './harness';

const ROOT_TAG = 1;

// 4x per step, four steps: small enough that the first is dominated by nothing, large enough that
// the last is three doublings past the benchmark's own 10 000.
const SIZES = [500, 2_000, 8_000, 32_000];
const SAMPLES = 3;

// Children per container, chosen to clear Yoga's 16 384 debug ceiling with room rather than to sit
// under it — see `fill()`. Every arm is bucketed the same way, so the shape is constant across the
// ladder and only the count varies, which is what a scaling question needs.
const BUCKET = 4_000;

const NODE_STYLE = { height: 44, flexDirection: 'row', paddingLeft: 10 };

/**
 * Build a flat list of `count` nodes, timing ONLY the JS.
 *
 * Flat rather than the benchmark's ten-node row on purpose: a row mixes creates, prop writes,
 * appends and raw text in a fixed proportion, and a proportion is exactly what a scaling question
 * must not hold constant with the thing it is varying. One node, one style write, one append — the
 * unit the per-node column is denominated in.
 */
function fill(count: number): number {
  const surface = createSurface(ROOT_TAG);
  const list = createElement('RCTView');
  routeProp(list, 'style', { flex: 1 });

  // Yoga's debug build asserts that a child list stays under 16 384
  // (`YogaLayoutableShadowNode.cpp:1036`, `ensureYogaChildrenLookFine`), and the widest arm here is
  // 32 000 — so a flat list aborted `test:itest` while passing `bench:itest`, where the assert is
  // compiled out. The nodes are spread over buckets instead, BUILT BEFORE THE CLOCK STARTS so the
  // timed loop below is byte-for-byte the one it was: one create, one style write, one append per
  // node. Which parent receives the append cannot change its cost — the engine records an op and
  // keeps no child list in JS — so the per-node column is unaffected.
  const buckets = [];
  for (let at = 0; at < count; at += BUCKET) {
    const bucket = createElement('RCTView');
    routeProp(bucket, 'style', { flex: 1 });
    appendChild(list, bucket);
    buckets.push(bucket);
  }

  let remaining = count;
  const startedAt = performance.now();
  for (const bucket of buckets) {
    const upTo = remaining < BUCKET ? remaining : BUCKET;
    for (let at = 0; at < upTo; at += 1) {
      const node = createElement('RCTView');
      routeProp(node, 'style', NODE_STYLE);
      appendChild(bucket, node);
    }
    remaining -= upTo;
  }
  const wall = performance.now() - startedAt;

  // Outside the clock, and it is not housekeeping: an uncommitted tree would let the next size build
  // on top of a JS-side structure this one left standing.
  surface.appendChild(list);
  surface.commit();
  mounted();
  surface.clear();
  surface.commit();
  mounted();
  return wall;
}

describe('how our fill cost scales with the size of the tree', () => {
  // why: THE DISCRIMINATOR between #1294's cliff and the flat cost of an interpreter. A ratio
  // against another engine cannot separate them — only the SHAPE of our own curve can, and that is
  // readable on one build, which is the only build this investigation is allowed.
  it('stays flat per node as the tree grows 64x', () => {
    // DISCARDED: the first fill in a process pays lazy module state and a cold allocator, and it
    // would land on the smallest size, which is exactly where it would fake a falling curve.
    fill(SIZES[0] ?? 0);

    const perNode: number[] = [];
    const walls: number[] = [];
    for (const size of SIZES) {
      let best = Infinity;
      // A FRESH TREE PER SAMPLE, not a re-timed one (§6): the loop below rebuilds from nothing every
      // time, so a sample cannot be fast because the previous sample already did the work.
      for (let sample = 0; sample < SAMPLES; sample += 1) {
        best = Math.min(best, fill(size));
      }
      walls.push(best);
      perNode.push((best * 1_000) / size);
    }

    const lines = SIZES.map((size, at) => {
      const wall = walls[at];
      const each = perNode[at];
      if (wall === undefined || each === undefined) {
        throw new Error('a size produced no reading');
      }
      const previous = walls[at - 1];
      const factor =
        previous === undefined ? '    ' : `${(wall / previous).toFixed(2)}x`;
      return `${String(size).padStart(6)} ${wall.toFixed(1).padStart(7)} ms ${each.toFixed(3)} us/node  ${factor}`;
    });
    print(`DEBUG FILLSCALE\n${lines.join('\n')}`);

    const smallest = perNode[0];
    const largest = perNode[perNode.length - 1];
    if (smallest === undefined || largest === undefined) {
      throw new Error('the curve is empty');
    }

    // THE GATE, and it is deliberately loose. The claim is not "the curve is perfectly flat" — the
    // largest size allocates 64x the memory of the smallest and pays more collector time for it,
    // which is real work and not a slow path. The claim is that there is no CLIFF: a per-node cost
    // that grows with N would be super-linear, and at 64x even a mild one is far outside this.
    // #1294's own numbers are 23x on the wall of a workload that did not grow at all.
    //
    // WIDENED FROM 2x WHEN THE HARNESS LEARNED TO RUN BYTECODE, and the reason is worth the line.
    // On `-O0` the curve is flat to the last point (3.68 -> 3.84 us). On `hermesc -O` the JS halves
    // and the SAME absolute collector cost stops being hidden by it — flat to 8 000 (1.66 -> 1.77)
    // and +35% at 32 000 (2.34). Nothing about the code changed; a fixed cost became a visible
    // share. 3x still sits far under a genuine super-linear at this range.
    expect(largest).toBeLessThan(smallest * 3);
  });
});

report();
