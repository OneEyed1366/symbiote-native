// Appending to a mounted list must not RE-CREATE the rows already standing.
//
// WHY THIS EXISTS. `examples/svelte` regressed against its baseline: Create, Append and Replace
// all got costlier with `WRITES` and the tree byte-identical — the same work, priced higher. The
// only thing separating Append from Create is that Append inserts into an already-standing list.
//
// Two candidate mechanisms were priced headless and neither is large enough to be it: the sibling
// scan in `OP_INSERT_BEFORE` (`core/engine/bench/sibling-scan.cpp`, 0.8 ms on a device-calibrated
// ruler) and the post-commit adopt pass (1.6 ms on the same ruler). Yoga was asked next and
// answered that appending re-measures nothing — 6 000 measurements for the arrivals, not 12 000
// (`core/engine/bench/yoga-relayout.cpp`, the APPEND arm).
//
// That leaves one thing on the list that IS the right size. Yoga only keeps the standing rows'
// measurements while the standing rows are the SAME NODES. If the commit stops reusing them and
// builds fresh ones, every leaf measures again — and a device text measurement costs 29.6 us, so
// six thousand extra ones are ~178 ms. The reuse fast path is therefore load-bearing for a cost
// that never appears in any counter this project prints, and nothing asserted it.
//
// WHAT IT PROVES AND WHERE. It runs against the TypeScript applier, which `mutation-buffer.ts` names
// as the spec the C++ must agree with. Green here does not clear the native host — it moves the
// question there, which is worth more than asking a device blind.

import { expect, it } from 'vitest';
import { installRecordingFabric } from '@symbiote-native/test-utils';
import {
  appendChild,
  createElement,
  createRawText,
  createSurface,
  routeProp,
} from '../index';

const fabric = installRecordingFabric();

// How many nodes the engine has asked to be CREATED so far — the length of the recording, which is
// the op stream's own answer rather than a count of somebody's protocol calls.
const createdSoFar = (): number => fabric.findAll(() => true).length;

// Ten layoutable-and-text nodes, the benchmark row's real shape. The exact markup does not matter
// to this assertion — only that a row is several nodes deep, so a lost reuse shows up as a multiple
// rather than as a couple of stray creates.
function buildRow(id: number): ReturnType<typeof createElement> {
  const row = createElement('RCTView');
  routeProp(row, 'class', 'bench-row');

  const idText = createElement('RCTText', true);
  appendChild(idText, createRawText(String(id)));
  appendChild(row, idText);

  for (let at = 0; at < 2; at += 1) {
    const box = createElement('RCTView');
    const text = createElement('RCTText', true);
    appendChild(text, createRawText(`row ${id}`));
    appendChild(box, text);
    appendChild(row, box);
  }

  const input = createElement('RCTSinglelineTextInputView');
  routeProp(input, 'value', `row ${id}`);
  appendChild(row, input);

  return row;
}

const ROWS = 100;
// Counted off `buildRow` above, not read back from a run: the row view, the id text and its raw
// text, two boxes each holding a text and a raw text, and the input.
const NODES_PER_ROW = 10;

it('creates only the arriving rows, and leaves the standing ones alone', () => {
  const surface = createSurface(98_101);
  for (let id = 0; id < ROWS; id += 1) surface.appendChild(buildRow(id));
  surface.commit();

  // The surface's own container is the `+ 1`, and it is built once — which is why the second
  // commit is NOT compared against this number. Both sides are counted off the markup instead.
  const afterFirst = createdSoFar();
  expect(afterFirst).toBe(ROWS * NODES_PER_ROW + 1);

  for (let id = ROWS; id < ROWS * 2; id += 1) surface.appendChild(buildRow(id));
  surface.commit();

  const created = createdSoFar() - afterFirst;

  // The whole point, as a two-sided check. Equal to the first commit's count means exactly the
  // arrivals were built; anything approaching DOUBLE means the standing rows were rebuilt with
  // them, which is invisible to `WRITES`, invisible to the tree, and on device costs a text
  // measurement per leaf.
  expect(created).toBe(ROWS * NODES_PER_ROW);
  expect(created).toBeLessThan(ROWS * NODES_PER_ROW * 2);
});
