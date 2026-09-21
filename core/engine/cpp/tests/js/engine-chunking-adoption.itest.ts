// Investigating F-5's chunking claim against the real engine, round 3 — round 2 (order-swap
// control) confirmed chunked-with-`display:contents` is genuinely slower than flat, not an
// artifact of measurement order. This round isolates WHY: is the cost the flattening itself, or
// just having an extra nesting level?
//
// TRIED splitting `commitMs` from a `diffMs` (RN's own `TransactionTelemetry::getDiffStartTime/
// getDiffEndTime`, same forwarding pattern as `commitMs`) to see whether the Differentiator's
// flattening walk (`sliceChildShadowNodeViewPairsRecursively`, `.vendors/react-native/.../
// mounting/internal/sliceChildShadowNodeViewPairs.cpp`) runs in a separately-timed phase.
// `getDiffStartTime()` asserts and CRASHES the whole process for any commit this engine produces —
// `willDiff()`/`didDiff()` are never called on this commit path at all, so `diffStartTime_` is
// never stamped. Reverted immediately (`.docs/mirror-elimination.md` Round 21) — a field that
// crashes on the engine's own surfaces has no place in shared telemetry. The flattening cost, if
// `commitMs` sees any of it, is entirely folded into the commit window measured below; RN's own
// diff/mount timing is not separately observable on this engine's own commits.
//
// THE MECHANISM, found by reading Yoga-core rather than RN's wrapper: `display:contents` is not
// only `ForceFlattenView` (the mounting-layer flag Round 19 found, consumed by
// `sliceChildShadowNodeViewPairs.cpp`). It is ALSO a real Yoga style value (`YGDisplayContents`),
// and Yoga's own layout iterator (`yoga/yoga/node/LayoutableChildren.h`, `skipContentsNodes()`)
// walks THROUGH a flattened node during layout, hoisting its children into the parent's traversal.
// `updateYogaChildren()`'s clone/re-adopt cost (what this file measures) genuinely only touches a
// chunked list's DIRECT children — a real, measured win for PLAIN grouping. But Yoga's layout pass
// still walks every row through the flattened groups via the skip iterator, so layout-affecting
// traversal cost stays proportional to the ROW count regardless of chunking, and the group wrappers
// still pay their own allocation despite contributing nothing visually. `display:contents` pays the
// wrapper overhead without collecting the traversal saving that makes plain grouping worth it.

import {
  appendChild,
  createElement,
  createSurface,
  readSurfaceTelemetry,
  routeProp,
  type ISymbioteNode,
} from '@symbiote-native/engine';

import { describe, expect, it, mounted, print, report } from './harness';

const ROOT_TAG = 1;
const ROWS = 1_000;
const APPEND_ROWS = 1_000;
const CHUNK = 50;

const CONTENTS = { display: 'contents' } as const;

function buildRow(id: number): ISymbioteNode {
  const row = createElement('RCTView');
  routeProp(row, 'testID', `row-${id}`);
  const label = createElement('RCTText');
  routeProp(label, 'testID', `label-${id}`);
  appendChild(row, label);
  return row;
}

function commitMsOnAppend(rootTag: number): number {
  const telemetry = readSurfaceTelemetry(rootTag);
  if (telemetry === undefined) throw new Error('no telemetry for this surface');
  return telemetry.commitMs;
}

function flatArm(rootTag: number): number {
  const surface = createSurface(rootTag);
  const list = createElement('RCTView');
  routeProp(list, 'testID', 'list');
  for (let id = 0; id < ROWS; id += 1) appendChild(list, buildRow(id));
  surface.appendChild(list);
  surface.commit();
  mounted();
  commitMsOnAppend(rootTag);

  for (let id = ROWS; id < ROWS + APPEND_ROWS; id += 1)
    appendChild(list, buildRow(id));
  surface.commit();
  mounted();
  return commitMsOnAppend(rootTag);
}

function chunkedArm(rootTag: number, flattened: boolean): number {
  const surface = createSurface(rootTag);
  const list = createElement('RCTView');
  routeProp(list, 'testID', 'list');

  const groupOf = (from: number, count: number): ISymbioteNode => {
    const group = createElement('RCTView');
    if (flattened) routeProp(group, 'style', CONTENTS);
    for (let id = from; id < from + count; id += 1)
      appendChild(group, buildRow(id));
    return group;
  };

  for (let at = 0; at < ROWS; at += CHUNK)
    appendChild(list, groupOf(at, CHUNK));
  surface.appendChild(list);
  surface.commit();
  mounted();
  commitMsOnAppend(rootTag);

  for (let at = ROWS; at < ROWS + APPEND_ROWS; at += CHUNK) {
    appendChild(list, groupOf(at, CHUNK));
  }
  surface.commit();
  mounted();
  return commitMsOnAppend(rootTag);
}

// A throwaway cycle, same shape as every arm, run before anything is measured — eats whatever
// one-time cost the FIRST commit in this process pays (allocator/static-init warmup) so it cannot
// land on whichever arm happens to run first.
function warmup(rootTag: number): void {
  flatArm(rootTag);
}

let flat = -1;
let chunkedFlattened = -1;
let chunkedPlain = -1;

describe('F-5 re-checked: is the cost the flattening, or just the extra nesting level', () => {
  it('warms up the process before anything is measured', () => {
    warmup(ROOT_TAG);
    expect(true).toBe(true);
  });

  it('flat: no groups at all', () => {
    flat = flatArm(ROOT_TAG);
    expect(flat > 0).toBe(true);
  });

  it('chunked, flattened: display:contents groups', () => {
    chunkedFlattened = chunkedArm(ROOT_TAG, true);
    expect(chunkedFlattened > 0).toBe(true);
  });

  it('chunked, PLAIN: ordinary (non-flattened) groups, same nesting', () => {
    chunkedPlain = chunkedArm(ROOT_TAG, false);
    expect(chunkedPlain > 0).toBe(true);
  });

  it('reports all three', () => {
    print(
      `DEBUG flat=${flat}ms chunked-flattened=${chunkedFlattened}ms chunked-plain=${chunkedPlain}ms`,
    );
    expect(true).toBe(true);
  });
});

report();
