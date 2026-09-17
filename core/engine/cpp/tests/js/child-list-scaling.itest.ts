// Does removing and inserting children cost the LIST or the CHANGE?
//
// why: `Clear` is the one row where stock React Native is faster than every adapter of ours, on
// every device run this project has taken — 10.7 ms against 9.1-44.2. It is a small-ms row and this
// repo rightly refuses to read a verdict off one of those, so the row has been left alone. But a
// suspicious row plus a suspicious ALGORITHM is a different thing from a suspicious row alone, and
// the algorithm is right there in `SymbioteTree.cpp`:
//
//   detachFromParent    `std::remove` over the parent's whole child vector, then `erase`
//   kOpInsertBefore     `std::find` over the parent's whole child vector
//
// Both are O(width) per operation, so clearing N children is O(N²) — and a `find` that hits
// immediately still leaves the `erase` shifting the tail, so removing from EITHER end is quadratic,
// just in a different half of the work.
//
// THE MEASUREMENT IS A RATIO OF RATIOS, which is what makes it a shape rather than a timing: run the
// same step at N and at 2N and read the factor. Linear work doubles. Quadratic work quadruples.
// Nothing here asserts a millisecond, and the Debug-vs-optimized distinction that has bitten this
// file's neighbours cannot reach an exponent — but run it on `build-release` anyway
// (`pnpm run bench:itest`), because the assert build has quadratics of its own
// (`raw-fabric-vs-engine.itest.ts`).

import {
  appendChild,
  createElement,
  createSurface,
  insertBefore,
  removeChild,
  routeProp,
  type ISymbioteNode,
} from '@symbiote-native/engine';
import { flushOps } from '@symbiote-native/engine/tree-host';

import { describe, expect, it, mounted, print, report } from './harness';

const ROOT_TAG = 1;
const WIDTHS = [1_000, 2_000, 4_000] as const;

function since(startedAt: number): number {
  return performance.now() - startedAt;
}

/** A standing list of `width` single-node children, committed and mounted. */
function openList(width: number): {
  surface: ReturnType<typeof createSurface>;
  list: ISymbioteNode;
  children: ISymbioteNode[];
} {
  const surface = createSurface(ROOT_TAG);
  const list = createElement('RCTView');
  routeProp(list, 'style', { flex: 1 });
  const children: ISymbioteNode[] = [];
  for (let at = 0; at < width; at += 1) {
    const child = createElement('RCTView');
    routeProp(child, 'style', { height: 10 });
    appendChild(list, child);
    children.push(child);
  }
  surface.appendChild(list);
  flushOps();
  surface.commit();
  mounted();
  return { surface, list, children };
}

/** `apply` alone — the phase the child vector lives in. JS fill and the commit are not the subject. */
function timeApply(act: () => void): number {
  act();
  const startedAt = performance.now();
  flushOps();
  return since(startedAt);
}

describe('a child list under structural churn', () => {
  // why: removing every child is what `Clear` is, and it is the row stock wins. If the cost is the
  // list rather than the removals, an app's teardown gets worse the longer its list is — which is
  // exactly backwards from what a user expects of "close the screen".
  it('removes every child in time proportional to the list, not its square', () => {
    const measured: number[] = [];
    for (const width of WIDTHS) {
      const { list, children } = openList(width);
      const apply = timeApply(() => {
        for (const child of children) removeChild(list, child);
      });
      measured.push(apply);
      print(
        `DEBUG clear ${String(width).padStart(4)} apply=${apply.toFixed(2)} ms ` +
          `(${((apply * 1000) / width).toFixed(2)} us per removal)`,
      );
    }

    // Doubling the list doubles linear work and quadruples quadratic work. 3.0 sits far enough from
    // both to name one without reading a millisecond.
    const factors = [measured[1] / measured[0], measured[2] / measured[1]];
    print(
      `DEBUG clear doubling factors: ${factors.map(one => one.toFixed(2)).join(', ')}`,
    );
    for (const factor of factors) expect(factor < 3).toBe(true);
  });

  // [characterization — behavior not confirmed]
  //
  // QUESTION: should a keyed-list reorder be linear in the list, and is it worth a container change
  // to get there? This asserts what the engine DOES, not what it should do, and the number is a
  // finding rather than a requirement.
  //
  // why: `insertBefore` is every framework's keyed-list patch. Finding the anchor is O(1) now — the
  // anchor's own slot hint — but the `std::vector::insert` that follows shifts the tail, and that is
  // the container's, not the search's. Measured on `build-release`: 0.48 / 1.84 / 6.32 ms at
  // 1 000 / 2 000 / 4 000, doubling factors 3.9 and 3.4.
  //
  // Making it linear means a different structure for `node.children` — an intrusive doubly-linked
  // list would make insert, remove AND `nextSiblingOf` all O(1), and every reader of `children` in
  // `SymbioteTree.cpp` is already a forward walk. That is a real change to the core data structure
  // and it is not made on the strength of a row nobody has lost yet: the device table shows us
  // BEATING stock on `Swap` (6.1-8.7 against 9.6) and losing only on `Clear`, which is what this
  // file's first case fixed.
  //
  // The bound below is loose on purpose — it is a tripwire for a REGRESSION (a fifth power, an
  // accidental scan added on top), not an assertion that quadratic is right.
  it('reorders a keyed list quadratically, which is the container and not the search', () => {
    const measured: number[] = [];
    for (const width of WIDTHS) {
      const { list, children } = openList(width);
      // Move the tail half to the front, one at a time, anchored on the current head. Each insert
      // names an anchor that is already at index 0, so a hint-free implementation still has to scan
      // to find it and then shift everything after it.
      const apply = timeApply(() => {
        for (let at = width - 1; at >= width / 2; at -= 1) {
          insertBefore(list, children[at], children[0]);
        }
      });
      measured.push(apply);
      print(
        `DEBUG insert ${String(width).padStart(4)} apply=${apply.toFixed(2)} ms ` +
          `(${((apply * 2000) / width).toFixed(2)} us per insert)`,
      );
    }

    const factors = [measured[1] / measured[0], measured[2] / measured[1]];
    print(
      `DEBUG insert doubling factors: ${factors.map(one => one.toFixed(2)).join(', ')} ` +
        `[characterization — quadratic is what it does, not what it should do]`,
    );
    for (const factor of factors) expect(factor < 6).toBe(true);
  });
});

report();
