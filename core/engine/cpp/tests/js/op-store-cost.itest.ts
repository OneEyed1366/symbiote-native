// What does WRITING an op cost, and does the `Int32Array` we write it into charge for itself?
//
// FOUND IN HERMES'S OWN WORDS. Asked why typed arrays are not faster than objects, the maintainers
// answer that **typed-array element access goes through the generic object-lookup path rather than a
// special case**, and that even Static Hermes "doesn't know about typed arrays and integers, so the
// compiler isn't able to emit efficient code for those cases"
// (facebook/hermes discussions #1634, #1685). That is a named mechanism landing on the single
// hottest line we own.
//
// `push` (`mutation-buffer.ts:401`) writes `OP_STRIDE` = **6 `Int32Array` slots per op**, and a
// thousand-row create emits 12 005 ops — about **72 000 typed-array stores**, all interpreted. If
// that storage charges several times what a plain array charges, the buffer is paying for a choice
// made for the FAR side of the boundary, on the near side, per element.
//
// Four ways to hold the same 12 000 ops, plus the loop alone as a control:
//
//   INT32   `Int32Array`, indexed stores — what `push` does today
//   PLAIN   a pre-sized `number[]`, indexed stores
//   PUSH    a `number[]` grown by `.push()`
//   COPY    PLAIN, then ONE `Int32Array.prototype.set(plain)` — the buy-back, because C++ must still
//           receive a contiguous typed array and that copy is what it would cost to keep it
//
// **COPY is the arm that decides anything.** A win in PLAIN alone is not a win: the `Int32Array` is
// not a preference, it is the contract with `applyOps`, which reads one JSI array element by element.
// Only PLAIN + the copy back is a change that could actually ship.
//
// RUN WITH `SYMBIOTE_ITEST_BYTECODE=1` on `bench:itest` (§21). Without it the arms are compared under
// a compiler no device runs, and §18n is the standing example of a micro-shape reading BACKWARDS
// that way.

import { describe, expect, it, print, report } from './harness';

/** One thousand-row create's worth of ops, and the stride `mutation-buffer.ts` actually uses. */
const OPS = 12_000;
const STRIDE = 6;
const SLOTS = OPS * STRIDE;
const SAMPLES = 5;

/** Best of `SAMPLES` — timing noise is one-sided, so the minimum is the reading (§6). */
function best(run: () => void): number {
  let lowest = Infinity;
  for (let sample = 0; sample < SAMPLES; sample += 1) {
    const startedAt = performance.now();
    run();
    lowest = Math.min(lowest, performance.now() - startedAt);
  }
  return lowest;
}

describe('what the op buffer pays for its storage', () => {
  // why: THE HYPOTHESIS, priced. The buffer is the one part of the create path that is entirely our
  // design rather than the platform's, and 74% of a create is still unattributed (§18o). Six
  // interpreted typed-array stores per op is the largest single thing left inside it.
  it('charges more for a typed array than for a plain one', () => {
    // Allocated OUTSIDE every clock: §18i already priced growth, and an allocation inside the timed
    // loop would price the allocator instead of the store.
    const int32 = new Int32Array(SLOTS);
    const plain: number[] = new Array(SLOTS).fill(0);
    const grown: number[] = [];

    // THE CONTROL, and it is not optional here: a store is a few nanoseconds and the `for` around it
    // is not negligible against that. Every arm runs this same loop shape, so subtracting it leaves
    // the store.
    let sink = 0;
    const control = best(() => {
      for (let at = 0; at < SLOTS; at += STRIDE) {
        sink += at + 1 + 2 + 3 + 4 + 5;
      }
    });

    const int32Loop = best(() => {
      for (let at = 0; at < SLOTS; at += STRIDE) {
        int32[at] = at;
        int32[at + 1] = 1;
        int32[at + 2] = 2;
        int32[at + 3] = 3;
        int32[at + 4] = 4;
        int32[at + 5] = 5;
      }
    });

    const plainLoop = best(() => {
      for (let at = 0; at < SLOTS; at += STRIDE) {
        plain[at] = at;
        plain[at + 1] = 1;
        plain[at + 2] = 2;
        plain[at + 3] = 3;
        plain[at + 4] = 4;
        plain[at + 5] = 5;
      }
    });

    // A FRESH ARRAY PER SAMPLE, because `.push` onto an array that already holds 72 000 entries is a
    // different workload from filling an empty one — which is the workload production has, since
    // `takeBatch` resets.
    const pushLoop = best(() => {
      grown.length = 0;
      for (let at = 0; at < SLOTS; at += STRIDE) {
        grown.push(at, 1, 2, 3, 4, 5);
      }
      sink += grown.length;
    });

    // THE BUY-BACK. `set` from an array-like is implemented in C++, so this prices what it would cost
    // to keep the contract with `applyOps` while writing into a plain array.
    const copyLoop = best(() => {
      for (let at = 0; at < SLOTS; at += STRIDE) {
        plain[at] = at;
        plain[at + 1] = 1;
        plain[at + 2] = 2;
        plain[at + 3] = 3;
        plain[at + 4] = 4;
        plain[at + 5] = 5;
      }
      int32.set(plain);
    });

    if (sink === -1)
      throw new Error('unreachable, and it keeps the loops alive');

    const perOp = (wall: number): string =>
      `${(((wall - control) * 1_000) / OPS).toFixed(3)}`;
    print(
      `DEBUG OPSTORE control ${control.toFixed(2)} ms · ` +
        `int32 ${int32Loop.toFixed(2)} (${perOp(int32Loop)} us/op) · ` +
        `plain ${plainLoop.toFixed(2)} (${perOp(plainLoop)}) · ` +
        `push ${pushLoop.toFixed(2)} (${perOp(pushLoop)}) · ` +
        `plain+set ${copyLoop.toFixed(2)} (${perOp(copyLoop)}) · ` +
        `over ${OPS} ops of ${STRIDE} slots`,
    );

    // NO COMPARATIVE ASSERTION, for the reason `hash-table-cost.itest.ts` records at length: arms of
    // a fraction of a millisecond inside a 117-process run are not orderable, best-of-N does not
    // reach a descheduled process, and a bar built from in-arm spread cannot see a uniformly slow
    // arm. §18h reached the same place.
    //
    // THE STRUCTURAL GATE INSTEAD, which no machine load can overturn: the buffer must actually hold
    // what the arms wrote. An arm hoisted out of its loop or folded away lands here.
    expect(int32[SLOTS - 1]).toBe(5);
    expect(plain[SLOTS - 1]).toBe(5);
    expect(grown.length).toBe(SLOTS);
  });
});

report();
