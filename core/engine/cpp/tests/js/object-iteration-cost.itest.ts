// `Object.entries` on a per-node path, priced — the generalisation of §18v.
//
// FOUND BY SWEEPING FOR THE PATTERN THAT PAID LAST TIME. `installListeners` iterated a `Map` and
// destructured every entry, which built a two-element array per step; replacing the `Map` with an
// array of pairs took 0.7 us off every `<TextInput>`. `Object.entries` has the same shape and a
// worse one — it allocates the outer array AND one pair array per key, eagerly, before the loop
// starts.
//
// The sweep found it on React's own hot path. `adapters/react/src/host-config.ts:58`:
//
//   function applyProps(node, props) {
//     for (const [key, value] of Object.entries(props)) { … routeProp(node, key, value) }
//   }
//
// That runs ONCE PER NODE CREATED — ten thousand times on a benchmark create — and the sibling
// `applyUpdate` right below it already walks `Object.keys` for its first loop, so the two spellings
// sit four lines apart.
//
// THREE SHAPES over the same bag, and the third is here to be REJECTED with a number rather than on
// principle: `for…in` is cheapest and walks the prototype chain, which a props object from a
// reconciler does not have — but "does not have one today" is not a contract, and the engine would
// silently route an inherited key as a prop.
//
// RUN WITH `SYMBIOTE_ITEST_BYTECODE=1` on `bench:itest` (§21). Gates are STRUCTURAL: every shape must
// visit every key. A timing comparison inside a 117-process suite is a print (§11, §18h).

import { describe, expect, it, print, report } from './harness';

/** A thousand-row create's worth of nodes. */
const NODES = 10_000;
const SAMPLES = 5;

/**
 * The props a benchmark row's node actually carries, after the reconciler has stripped nothing.
 *
 * FOUR KEYS, not one: `Object.entries` allocates per key, so the shape of the win depends on how
 * wide the bag is, and a one-key bag would flatter the current spelling.
 */
const PROPS: Record<string, unknown> = {
  style: { height: 44, flexDirection: 'row', paddingLeft: 10 },
  testID: 'row-1',
  accessible: true,
  children: undefined,
};

/** Best of `SAMPLES` — timing noise is one-sided, so the minimum is the reading (§6). */
function best(run: () => void): number {
  let lowest = Infinity;
  for (let at = 0; at < SAMPLES; at += 1) {
    const startedAt = performance.now();
    run();
    lowest = Math.min(lowest, performance.now() - startedAt);
  }
  return lowest;
}

describe('what walking a props bag costs per node', () => {
  // why: `applyProps` is the React adapter's per-node entry point and the only thing it does is walk
  // this bag. If `Object.entries` is a readable share of a create, the fix is four characters and
  // the sibling function already uses it.
  it('pays for Object.entries what it need not', () => {
    let visited = 0;
    let sink = 0;

    const entriesWall = best(() => {
      visited = 0;
      for (let at = 0; at < NODES; at += 1) {
        for (const [key, value] of Object.entries(PROPS)) {
          sink += key.length + (value === undefined ? 0 : 1);
          visited += 1;
        }
      }
    });

    const keysWall = best(() => {
      visited = 0;
      for (let at = 0; at < NODES; at += 1) {
        for (const key of Object.keys(PROPS)) {
          const value = PROPS[key];
          sink += key.length + (value === undefined ? 0 : 1);
          visited += 1;
        }
      }
    });

    // PRICED TO BE REJECTED, and the number is the point: `for…in` walks the prototype chain, so an
    // inherited key would be routed as a prop. Kept in the print so nobody re-derives it as a win.
    const forInWall = best(() => {
      visited = 0;
      for (let at = 0; at < NODES; at += 1) {
        for (const key in PROPS) {
          const value = PROPS[key];
          sink += key.length + (value === undefined ? 0 : 1);
          visited += 1;
        }
      }
    });

    if (sink === -1)
      throw new Error('unreachable, and it keeps the loops alive');

    const keyCount = Object.keys(PROPS).length;
    const each = (wall: number): number => (wall * 1_000) / NODES;
    print(
      `DEBUG OBJITER entries ${each(entriesWall).toFixed(3)} us/node · ` +
        `keys ${each(keysWall).toFixed(3)} · for-in ${each(forInWall).toFixed(3)} (rejected) · ` +
        `entries costs ${each(entriesWall - keysWall).toFixed(3)} us/node more over ${keyCount} keys`,
    );

    // STRUCTURAL: the last shape to run must have visited every key of every node. An arm whose loop
    // was hoisted or folded lands here, and no machine load can overturn it.
    expect(visited).toBe(NODES * keyCount);
  });
});

report();
