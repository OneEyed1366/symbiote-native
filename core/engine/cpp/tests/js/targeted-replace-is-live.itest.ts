// `canReplaceInPlace` RUNS, and the cost of touching one row does not grow with the list it sits in.
//
// why: this path was disabled for eighteen months with a comment on the line above it claiming a
// 500x win, and **every test in this repository stayed green the whole time** — a fast path that
// silently stops firing is invisible to correctness. The fuzzer
// (`core/engine/cpp/tests/tree-through-jsi.cpp`, 300 random op programs against an oracle) answers
// "is it correct". Nothing answered "does it run". This file does, two ways that fail independently:
//
//   LIVENESS   `targetedReplaces` — our own counter, incremented where the path is taken. A guard
//              tightened by accident reads 0 here while every other suite stays green.
//   SHAPE      the cost of a one-prop change across four list widths at a CONSTANT node count. The
//              full-handover path re-adopts every standing child
//              (`YogaLayoutableShadowNode::updateYogaChildren`), so its cost tracks the width; the
//              targeted path rewrites only moved slots, so its cost does not.
//
// The shape assertion is deliberately a RATIO between two arms of one run and not a millisecond
// budget: this binary is built `-O0` with asserts on, so absolute figures mean nothing and a
// threshold in ms would either be noise or be tuned to this machine. What cannot be explained away
// is the widest arm costing many times the narrowest when the work is supposed to be identical.

import {
  appendChild,
  createElement,
  createSurface,
  readSurfaceTelemetry,
  routeProp,
  type ISymbioteNode,
} from '@symbiote-native/engine';
import { flushOps } from '@symbiote-native/engine/tree-host';

import { describe, expect, it, mounted, print, report } from './harness';

const ROOT_TAG = 1;
/** Every pair is 20 000 nodes; only the width of the list changes. */
const SHAPES = [
  [500, 40],
  [4_000, 5],
] as const;

/** Flips per arm — see the comment at the measurement; the clock here is millisecond-resolution. */
const ROUNDS = 25;

const ROW_STYLE = { height: 44, flexDirection: 'row' };
const CELL_STYLE = { flex: 1 };

let surface: ReturnType<typeof createSurface> | undefined;

function buildList(rows: number, perRow: number): ISymbioteNode[] {
  surface = createSurface(ROOT_TAG);
  const list = createElement('RCTView');
  routeProp(list, 'style', { flexDirection: 'column' });
  surface.appendChild(list);

  const built: ISymbioteNode[] = [];
  for (let id = 0; id < rows; id += 1) {
    const row = createElement('RCTView');
    routeProp(row, 'style', ROW_STYLE);
    for (let at = 1; at < perRow; at += 1) {
      const cell = createElement('RCTView');
      routeProp(cell, 'style', CELL_STYLE);
      appendChild(row, cell);
    }
    built.push(row);
    appendChild(list, row);
  }
  flushOps();
  surface.commit();
  mounted();
  return built;
}

function surfaceOf(): ReturnType<typeof createSurface> {
  if (surface === undefined) throw new Error('no surface open');
  return surface;
}

type IArm = { rows: number; perRow: number; wall: number; replaces: number };

const arms: IArm[] = [];

describe('the targeted replace is live, and its cost ignores the list width', () => {
  it('measures a one-prop change at two widths and the same node count', () => {
    for (const [rows, perRow] of SHAPES) {
      const built = buildList(rows, perRow);
      readSurfaceTelemetry(ROOT_TAG); // zero the counter; the mount is not what this measures

      // REPEATED, because `performance.now()` here is `Date.now()` — one flip of a 500-wide list
      // lands under the 1 ms resolution and a ratio taken off two sub-millisecond numbers measures
      // the clock. Twenty-five flips put both arms well clear of it without changing what is being
      // compared: the change is the same size every round, only the list width differs.
      const startedAt = performance.now();
      for (let round = 0; round < ROUNDS; round += 1) {
        routeProp(built[rows >> 1], 'style', {
          ...ROW_STYLE,
          backgroundColor: round % 2 === 0 ? '#f5a524' : '#3a2c10',
        });
        flushOps();
        surfaceOf().commit();
        mounted();
      }
      const wall = performance.now() - startedAt;

      arms.push({
        rows,
        perRow,
        wall,
        replaces: readSurfaceTelemetry(ROOT_TAG)?.targetedReplaces ?? 0,
      });
    }
    expect(arms.length).toBe(SHAPES.length);
  });

  // why: the counter is the only signal that survives the path being switched off — every other
  // assertion in this repository passes either way. A zero here means the guard turned the change
  // away, whatever the reason, and that is a regression even when the tree is still correct.
  it('took the targeted path on both widths', () => {
    for (const arm of arms) {
      print(
        `DEBUG width=${arm.rows} nodes/row=${arm.perRow} ` +
          `targetedReplaces=${arm.replaces} wall=${arm.wall.toFixed(1)}ms`,
      );
    }
    expect(arms.every(arm => arm.replaces > 0)).toBe(true);
  });

  // why: the full-handover path re-adopts and re-clones every standing child, so an 8x wider list
  // costs it roughly 34x at the same node count — 12 ms against 405 ms, measured on this harness
  // before the path came back on. The targeted path rewrites one slot either way, so the two arms
  // must stay close. The bar is set at 4x: far below the 34x a regression to handover produces, far
  // above the spread of two arms doing identical work on a `-O0` build.
  it('does not pay for siblings it did not touch', () => {
    const narrow = arms[0];
    const wide = arms[arms.length - 1];
    const ratio = (wide.wall + 1) / (narrow.wall + 1);
    print(
      `DEBUG width ${narrow.rows} -> ${wide.rows} at a constant 20 000 nodes, ` +
        `${ROUNDS} flips each: ${narrow.wall.toFixed(1)}ms -> ${wide.wall.toFixed(1)}ms ` +
        `(${ratio.toFixed(1)}x)`,
    );
    expect(ratio < 4).toBe(true);
  });
});

report();
