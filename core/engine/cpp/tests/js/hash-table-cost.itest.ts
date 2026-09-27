// What do the two hash tables on the create path cost, at the volume a create runs them?
//
// FOUND BY READING OUR OWN HOT PATH AFTER §18n LEFT MOST OF A CREATE UNSPLIT. `recordCreateElement`
// (`mutation-buffer.ts:465`) runs TWO hash-table operations per node and nothing else that is not a
// plain array write:
//
//   placementPending.add(handle)   a `Set<object>` that grows to one entry per created node
//   intern(viewName)               `stringIds.get(text)` — a `Map<string, number>` over ~6 names
//
// and `recordAppendChild` adds to the same Set again, so a thousand-row create runs ~10 000 Map
// lookups and ~20 000 Set inserts.
//
// THE SYMPTOM THAT SENT ME HERE: Hermes's own release notes for the next stable say "Map and Set are
// faster — the backing hash table (OrderedHashMap) was reworked around a contiguous data table, with
// the index moved off the GC heap". That is an admission that the version we run has a slower one,
// and it is the only named Hermes weakness that lands squarely on a line we execute per node. §18m's
// rule applies to it as much as to anything else, so it is priced rather than assumed.
//
// **A FLOOR, and deliberately below the real thing** (§18l): these arms run the table operations and
// nothing around them — no op push, no `slotOf`, no string compare. Whatever they cost is a lower
// bound on that part of a create, and the error runs the safe way.
//
// The LOOP ITSELF is measured and subtracted, because at a few tens of nanoseconds per operation the
// `for` is not negligible against the thing being timed.
//
// RUN ON `bench:itest` (Release, Hermes).

import { describe, expect, it, print, report } from './harness';

// One create's worth of each, as the benchmark runs them.
const LOOKUPS = 10_000;
const INSERTS = 20_000;
const SAMPLES = 5;

/**
 * What a `createElement` spends OUTSIDE the node object: 1.12 us total (`fill-phase-cost`) minus the
 * 0.18 the object floor costs (`node-allocation-floor`).
 *
 * **Both are `hermesc -O` figures and this file must be run the same way** (§21) —
 * `SYMBIOTE_ITEST_BYTECODE=1`. Under the harness's default runtime compile the same quantities read
 * 2.35 and 0.27, and mixing the two compilers into one percentage compares nothing.
 */
const OUTSIDE_OBJECT_US = 0.94;

// The view names a benchmark row actually interns, and the whole point is that they REPEAT: the Map
// answers from its table every time after the first six, which is the cheap case. A miss would
// allocate and push, and pricing the cheap case is what makes this a floor.
const NAMES = [
  'RCTView',
  'RCTText',
  'RCTRawText',
  'RCTSinglelineTextInputView',
  'RCTImageView',
  'RCTScrollView',
];

/**
 * Best of `SAMPLES`, and THIS RUN'S OWN RESOLUTION — the gap to the second best.
 *
 * Timing noise is one-sided, so the minimum is the reading (§6); the resolution is what makes the
 * gates below honest inside the parallel suite. These arms are a fraction of a millisecond each and
 * the runner spawns 117 processes, so a stalled process moves a ratio further than the thing it
 * guards. A bound tighter than the spread is not a claim (§11), and a FIXED margin cannot know how
 * quiet the machine was — so a verdict is taken only outside the bar.
 */
function best(run: () => void): { wall: number; resolution: number } {
  const walls: number[] = [];
  for (let sample = 0; sample < SAMPLES; sample += 1) {
    const startedAt = performance.now();
    run();
    walls.push(performance.now() - startedAt);
  }
  walls.sort((left, right) => left - right);
  return {
    wall: walls[0] ?? 0,
    resolution: (walls[1] ?? walls[0] ?? 0) - (walls[0] ?? 0),
  };
}

describe('what the create path pays its hash tables', () => {
  // why: THE SPLIT §18n left open. A create is 1.12 us/node on `-O` and the object is 0.18 of it; if
  // the two tables are a large share of the remaining 0.94 there is something to aim at, and if they
  // are not, the answer is somewhere else and the next fixture should look there instead.
  it('is a readable share of what a create spends outside the object', () => {
    // Built OUTSIDE every clock: allocating 20 000 handles inside the timed loop would price the
    // allocator, which §18n already measured separately.
    const handles: object[] = [];
    for (let at = 0; at < INSERTS; at += 1) handles.push({});

    const stringIds = new Map<string, number>();
    for (const [at, name] of NAMES.entries()) stringIds.set(name, at);

    // THE CONTROL. `sink` is read after each arm so the loop cannot be folded away, and the same
    // shape of loop runs in every arm — so subtracting this leaves the table operation alone.
    let sink = 0;
    const emptyLookupLoop = best(() => {
      for (let at = 0; at < LOOKUPS; at += 1) sink += at & 1;
    });
    const emptyInsertLoop = best(() => {
      for (let at = 0; at < INSERTS; at += 1) sink += at & 1;
    });

    // Counted rather than assumed: `looked` and `filled` below are what the structural gate asserts,
    // and they are the only claim this file makes that a busy machine cannot overturn.
    let looked = 0;
    const mapLoop = best(() => {
      looked = 0;
      for (let at = 0; at < LOOKUPS; at += 1) {
        sink += stringIds.get(NAMES[at % NAMES.length] ?? '') ?? 0;
        looked += 1;
      }
    });

    // A FRESH SET PER SAMPLE, and it is the whole shape of the workload: production clears
    // `placementPending` every batch, so the cost that matters is inserting into a table that GROWS
    // from empty to 20 000 — including whatever rehashing that involves. Re-adding into a full Set
    // would price the hit path and report a flattering number.
    let filled = 0;
    const setLoop = best(() => {
      const pending = new Set<object>();
      for (let at = 0; at < INSERTS; at += 1)
        pending.add(handles[at] ?? handles);
      filled = pending.size;
      sink += pending.size;
    });

    if (sink === -1)
      throw new Error('unreachable, and it keeps the loops alive');

    const mapEach = ((mapLoop.wall - emptyLookupLoop.wall) * 1_000) / LOOKUPS;
    const setEach = ((setLoop.wall - emptyInsertLoop.wall) * 1_000) / INSERTS;
    // Two inserts and one lookup per created node, which is what `recordCreateElement` plus the
    // `recordAppendChild` that follows it actually run.
    const perNode = mapEach + setEach * 2;

    print(
      `DEBUG HASHCOST Map.get ${mapEach.toFixed(3)} us · Set.add ${setEach.toFixed(3)} us · ` +
        `per created node ${perNode.toFixed(3)} us = ` +
        `${((perNode / OUTSIDE_OBJECT_US) * 100).toFixed(0)}% of the ${OUTSIDE_OBJECT_US} us a create spends outside the object · ` +
        `loop control ${emptyLookupLoop.wall.toFixed(2)}/${emptyInsertLoop.wall.toFixed(2)} ms`,
    );

    // THE GATE, with a MARGIN taken from the measured separation rather than a bare direction —
    // §18n's lesson, learned by watching a directional gate pass its own break-test. A hash table
    // must cost several times an `at & 1`, and an arm that stopped touching the table at all (a Set
    // hoisted so every add is a hit, a Map lookup folded to a constant) lands under this.
    //
    // NO COMPARATIVE ASSERTION SURVIVED, AND THAT IS THE RECORDED ANSWER RATHER THAN A RETREAT. Both
    // arms are fractions of a millisecond inside a 117-process run, and it is the CONTROL that
    // stalls: the `Map` gate failed at 0.84 against a 0.92 bound while the real separation is 4.7x,
    // because the control had inflated from 0.14 to 0.46. Best-of-N does not reach it (the whole
    // process is descheduled), and neither does a bar built from in-arm resolution — a UNIFORMLY slow
    // arm has a small spread and a wrong wall. Arms run sequentially, so the load between them is not
    // observable from inside either one. §18h reached the same place from the other direction and
    // removed its comparison too.
    //
    // WHAT IS LEFT IS A STRUCTURAL GATE, which is load-proof because it is not a timing: the tables
    // must actually have been filled. An arm hoisted, folded or skipped shows up here, and the
    // numbers above stay a print to be read from a SOLO invocation.
    expect(filled).toBe(INSERTS);
    expect(looked).toBe(LOOKUPS);
  });
});

report();
