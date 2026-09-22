// What does growing the buffer's four side tables from empty cost, once per commit?
//
// FOUND BY READING HERMES'S OWN TRACKER FIRST. Hermes is built for constrained memory and its array
// storage has historically been segmented, with the project's own wording that "this adds cost to
// every array operation" (facebook/hermes discussion #1634). `static_h` allocates array storage with
// `CanBeLarge::Yes` so the segmentation is gone, but the growth policy is not: an `ArrayStorage`
// still reallocates and COPIES when a push runs past capacity.
//
// `mutation-buffer.ts` already treats that as real for the op spine — "Capacity DOUBLES and is never
// given back: a commit that needed 210 042 slots once will need them again" — and keeps the
// `Int32Array` across commits for exactly this reason. The four SIDE TABLES get the opposite
// treatment: `takeBatch()` replaces `strings`, `values`, `instanceHandles` and `handles` with fresh
// empty arrays, so each one re-grows from zero on every commit. On a thousand-row create that is
// ~10 000 handles, ~10 000 instance handles and ~12 000 values, each reached by doubling from a
// capacity of nothing.
//
// The reason they are fresh is stated there and is not a mistake: the batch OUTLIVES the call —
// `applyOps` reads `handles` while attaching native state — so a recycled array would be mutated
// under the consumer by the next adapter mutation. This file does not propose recycling them; it
// prices what the freshness costs, so that any future proposal has a number to beat.
//
// Three arms, same element count, same values:
//
//   grown      push onto a fresh empty array        what the buffer does today
//   presized   new Array(N), assign by index        the floor: no reallocation at all
//   reused     length = 0 on a warm array, push     what recycling COULD cost, if it were safe
//
// RUN ON `bench:itest`. The assert build's numbers carry no verdict.

import { describe, expect, it, print, report } from './harness';

// The real counts from a thousand-row create (`FILL SPLIT` / the census): ~10 000 nodes, one handle
// and one instance handle each, and a value per prop write.
const HANDLES = 10_000;
const VALUES = 12_000;

// Objects rather than numbers, because that is what three of the four tables hold — and an array of
// pointers is what the GC has to scan.
const payload: object[] = [];
for (let at = 0; at < VALUES; at += 1) payload.push({ at });

function timeGrown(count: number): number {
  const startedAt = performance.now();
  const table: unknown[] = [];
  for (let at = 0; at < count; at += 1) table.push(payload[at]);
  const wall = performance.now() - startedAt;
  // READ AFTER THE CLOCK, so the loop cannot be optimised away as dead.
  if (table.length !== count) throw new Error('the grown table lost entries');
  return wall;
}

function timePresized(count: number): number {
  const startedAt = performance.now();
  const table = new Array<unknown>(count);
  for (let at = 0; at < count; at += 1) table[at] = payload[at];
  const wall = performance.now() - startedAt;
  if (table.length !== count)
    throw new Error('the presized table lost entries');
  return wall;
}

function timeReused(count: number, rounds: number): number {
  const table: unknown[] = [];
  // WARMED to full size before the clock: the point of this arm is the cost once the capacity
  // already exists, which is the only thing recycling could buy.
  for (let at = 0; at < count; at += 1) table.push(payload[at]);

  const startedAt = performance.now();
  for (let round = 0; round < rounds; round += 1) {
    table.length = 0;
    for (let at = 0; at < count; at += 1) table.push(payload[at]);
  }
  const wall = (performance.now() - startedAt) / rounds;
  if (table.length !== count) throw new Error('the reused table lost entries');
  return wall;
}

describe('what a commit pays to re-grow the side tables', () => {
  // why: the three shapes side by side. A commit builds FOUR of these, so a per-table millisecond
  // is multiplied before it means anything — which is the counting mistake §18d records paying for,
  // and the reason the arithmetic is printed rather than left to the reader.
  it('prices growing, presizing and reusing one table', () => {
    // Best of three: timing noise is one-sided, so the minimum is the reading (§6).
    const best = (take: () => number): number =>
      Math.min(take(), take(), take());

    const grown = best(() => timeGrown(HANDLES));
    const presized = best(() => timePresized(HANDLES));
    const reused = best(() => timeReused(HANDLES, 3));

    print(
      `DEBUG ${HANDLES} entries · grown ${grown.toFixed(2)} ms · ` +
        `presized ${presized.toFixed(2)} ms · reused ${reused.toFixed(2)} ms`,
    );
    print(
      `DEBUG per entry · grown ${((grown * 1_000_000) / HANDLES).toFixed(0)} ns · ` +
        `presized ${((presized * 1_000_000) / HANDLES).toFixed(0)} ns · ` +
        `reused ${((reused * 1_000_000) / HANDLES).toFixed(0)} ns`,
    );
    print(
      `DEBUG a commit builds FOUR tables (~${HANDLES} + ~${HANDLES} + ~${VALUES} + a few strings): ` +
        `growth costs ${(grown - presized).toFixed(2)} ms per ${HANDLES}-entry table`,
    );

    // PRINTED, NOT BOUNDED — these are attribution numbers, not a gate (§5 on reproducibility).
    // What is asserted is that all three did the same amount of work.
    expect(grown).toBeGreaterThan(0);
    expect(presized).toBeGreaterThan(0);
    expect(reused).toBeGreaterThan(0);
  });

  // why: THE SHAPE OF THE GROWTH, which decides whether presizing is worth anything at all. A
  // doubling reallocation makes the per-entry cost FLAT in the table's size — the copies are
  // geometric and amortise — while a fixed-step growth would make it climb. Two widths say which,
  // and §7's rule applies: read the factor, not the millisecond.
  it('says whether the per-entry cost climbs with the table size', () => {
    const narrow = Math.min(timeGrown(3_000), timeGrown(3_000));
    const wide = Math.min(timeGrown(12_000), timeGrown(12_000));

    const narrowPer = (narrow * 1_000_000) / 3_000;
    const widePer = (wide * 1_000_000) / 12_000;
    print(
      `DEBUG GROWTH 3 000 -> ${narrowPer.toFixed(0)} ns/entry · ` +
        `12 000 -> ${widePer.toFixed(0)} ns/entry · ` +
        `factor ${(widePer / narrowPer).toFixed(2)}x for 4x the entries`,
    );
    expect(wide).toBeGreaterThan(0);
  });
});

report();
