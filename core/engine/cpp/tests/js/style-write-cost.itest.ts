// What does the class+style machinery cost a plain `style` write, on the engine a device runs?
//
// why: `fill-phase-cost.itest.ts` reads the same fixture on both rulers and one operation does not
// behave like the others — a style write goes 1.19 -> 2.41 us from JavaScriptCore to Hermes, a 2.03x
// where every neighbour pays the 1.3-1.5x an interpreter costs across the board. It is also the
// dearest single operation in the fill and 24% of it. A cost that doubles when the JIT goes away is
// work that was being hidden, not work that is intrinsically expensive.
//
// `routeProp` is where it lives: every adapter writes style through it, and it carries the slot
// redirect, the id aliases, the animated-value resolution, the class merge and the published-parts
// bookkeeping (`core/engine/src/node.ts`). `setProp` is the floor underneath — the same write with
// none of that. The distance between them is what the machinery costs, and it is the number that
// decides whether a fast path is worth writing.
//
// The product rule under it: **a node with no class, no slot, no animation and no previous style is
// the overwhelmingly common case, and it should pay for none of the four.**
//
// Read on BOTH rulers. The JavaScriptCore figure is not the one that matters — the point of the file
// is that the two disagree — but taking only the Hermes one would leave the disagreement unmeasured.
//
// RUN ON `bench:itest` (Hermes, the ruler) and `bench:itest:jsc`. The assert build's list append is
// O(N^2).

import {
  appendChild,
  createElement,
  createSurface,
  routeProp,
  setProp,
} from '@symbiote-native/engine';

import { describe, expect, it, print, report } from './harness';

const ROOT_TAG = 1;
const NODES = 10_000;

// The suite's own row style, so the key count is the one the benchmark writes rather than a
// convenient one: four keys, one of them a string.
const ROW_STYLE = {
  height: 44,
  flexDirection: 'row',
  paddingLeft: 10,
  backgroundColor: 0xff13243a,
} as const;

type IWriter = (node: ReturnType<typeof createElement>) => void;

/**
 * Time `NODES` fresh nodes written by `write`, with the tree building excluded.
 *
 * Fresh nodes on every arm and a FIRST write on each, because that is what a create does: the
 * published-parts guard has nothing to compare against, so what is being timed is the machinery on
 * its cheapest path rather than its diff.
 */
function timeWrites(label: string, write: IWriter, warmUp?: IWriter): number {
  const surface = createSurface(ROOT_TAG);
  // Under a CONTAINER, not straight on the surface: a surface is not a node, so the node-level
  // `appendChild` does not record the op the commit then looks for and every arm dies with
  // "applyOps: names a node this batch never created" — which reads as a buffer fault and is a
  // misuse of the two APIs.
  const container = createElement('RCTView');
  routeProp(container, 'nativeID', 'container');
  surface.appendChild(container);
  const nodes = [];
  for (let at = 0; at < NODES; at += 1) {
    const node = createElement('RCTView');
    nodes.push(node);
    appendChild(container, node);
  }

  // An arm that wants the node's style PARTS to exist before the clock starts says so here. The
  // parts object is allocated by the first style write and never again, so a warmed arm measures the
  // same branch without its allocation — which is the whole of the bisection below.
  if (warmUp !== undefined) for (const node of nodes) warmUp(node);

  const startedAt = performance.now();
  for (const node of nodes) write(node);
  const wall = performance.now() - startedAt;

  // COMMITTED, so an arm that wrote nothing the host would accept cannot read as the fastest. The
  // commit is outside the clock; what it protects is the meaning of the number, not its size.
  surface.commit();
  print(
    `DEBUG ${label.padEnd(10)} ${wall.toFixed(1)} ms · ${((wall * 1_000) / NODES).toFixed(2)} us/write`,
  );
  return wall;
}

let direct: number | undefined;

describe('what the class+style machinery costs a plain style write', () => {
  // why: the FLOOR — the same key and the same object straight into the buffer, with no slot
  // redirect, no id alias, no animated resolution, no class merge and no parts bookkeeping. Nothing
  // an app writes takes this path; it exists to say how much of the number above is machinery.
  it('writes style through setProp, which is the floor', () => {
    direct = timeWrites('setProp', node => setProp(node, 'style', ROW_STYLE));
    expect(direct).toBeGreaterThan(0);
  });

  // why: SEPARATES THE PROLOGUE FROM THE BRANCH. A scalar takes the same `routeProp` entry — the
  // dev-prop set, the slot field, the two id aliases, the animated gate, the class-key set — and
  // then falls straight through to `setProp` without touching `styleParts` or `pushClassStyle`. Its
  // distance from the floor is what the generic entry costs; everything above that belongs to the
  // style branch alone, and a fast path aimed at the wrong one of those two buys nothing.
  it('writes a scalar through routeProp, which skips the style branch', () => {
    const scalar = timeWrites('scalar', node =>
      routeProp(node, 'accessibilityLabel', 'x'),
    );

    if (direct === undefined) throw new Error('the floor arm did not run');
    print(
      `DEBUG PROLOGUE  setProp=${direct.toFixed(1)} scalar=${scalar.toFixed(1)} ms · ` +
        `routeProp's generic entry costs ` +
        `${(((scalar - direct) * 1_000) / NODES).toFixed(2)} us/write`,
    );
    expect(scalar).toBeGreaterThan(0);
  });

  // why: the path every adapter actually takes, on the commonest node there is — no class, no slot,
  // no animation, no previous style.
  it('writes style through routeProp, which is what an app pays', () => {
    const routed = timeWrites('routeProp', node =>
      routeProp(node, 'style', ROW_STYLE),
    );

    if (direct === undefined) throw new Error('the floor arm did not run');
    print(
      `DEBUG MACHINERY setProp=${direct.toFixed(1)} routeProp=${routed.toFixed(1)} ms · ` +
        `the machinery costs ${(routed - direct).toFixed(1)} ms ` +
        `= ${(((routed - direct) * 1_000) / NODES).toFixed(2)} us/write ` +
        `(${(((routed - direct) / routed) * 100).toFixed(0)}% of the write)`,
    );

    // PRINTED, NOT BOUNDED. The two arms are not interchangeable — `setProp` skips behaviour an app
    // needs — so a ratio between them is a budget for a fast path, never a regression gate. The gate
    // that does belong here is that both arms did the same amount of work.
    expect(routed).toBeGreaterThan(0);
  });

  // why: THE BISECTION. The parts object is allocated by the FIRST style write and never again, so
  // an arm whose nodes were already written once measures the same branch minus that allocation.
  // A second write of a DIFFERENT object also pays the shallow compare the first one skipped, so
  // this is an upper bound on the warm path rather than a clean isolation — and that is enough to
  // say whether the allocation is where the microsecond went.
  it('writes style a second time, with the parts already allocated', () => {
    // BUILT OUTSIDE THE CLOCK. The first version of this arm spread a fresh literal inside the timed
    // loop and billed the allocation to the engine — it read 5.87 us against a 2.05 us cold write,
    // which is the shape of an instrument measuring its own fixture.
    const other = { ...ROW_STYLE, paddingLeft: 11 };
    const warm = timeWrites(
      'style warm',
      node => routeProp(node, 'style', other),
      node => routeProp(node, 'style', ROW_STYLE),
    );
    expect(warm).toBeGreaterThan(0);
  });

  // why: the other half of the warm path — the same object again, which the published guard turns
  // away. It is the floor of the style branch: parts exist, nothing is republished, and what is left
  // is the walk down to the guard.
  it('writes the same style object again, which the guard turns away', () => {
    const deduped = timeWrites(
      'style dedup',
      node => routeProp(node, 'style', ROW_STYLE),
      node => routeProp(node, 'style', ROW_STYLE),
    );
    expect(deduped).toBeGreaterThan(0);
  });
});

report();
