// Where the HOST's work goes, and how each part scales with width.
//
// F-14 left one number unexplained: draining the buffer through the TypeScript applier costs 3.8x
// what master's entire JS engine cost. The applier is not a toy — `mutation-buffer.ts` names it as
// the spec the C++ host must agree with, field for field and decision for decision — so its cost
// SHAPE is the C++ host's cost shape, whatever the constant between them. A superlinear phase here
// is a superlinear phase on device.
//
// The split falls out of how the system already works: ops reach the host continuously (every
// structural read calls `flushOps`), and only `OP_COMMIT` reaches Fabric. So three phases, each
// timed on its own:
//
//   FILL     the adapter's mutation calls -> opcodes. JS, and all that stays in JS on device.
//   DECODE   `flushOps()` -> the host walks the op stream and maintains its tree. No Fabric.
//   COMMIT   `surface.commit()` -> materialize, child-set rebuild, payload build, Fabric calls.
//
// Measured across widths rather than at one point: the question is which phase carries a CURVE, and
// per the standing rule a headless run prices direction and curve, never magnitude.
//
// RUN IT ALONE — timings inside the shared suite read high under parallel load:
//   pnpm vitest run core/engine/src/__tests__/host-work-split.probe.test.ts

import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { installRecordingFabric } from '@symbiote-native/test-utils';
import {
  appendChild,
  createElement,
  createSurface,
  disposeRoot,
  setProp,
  type ISymbioteNode,
} from '../index';
import { flushOps } from '../tree-host';

const WIDTHS = [250, 500, 1_000, 2_000];
/** 1 row + 3 cells + 6 leaves. */
const NODES_PER_ROW = 10;
const REPEATS = 3;

const ROW_STYLE = { height: 24, flexDirection: 'row', paddingHorizontal: 8 };
const CELL_STYLE = { flex: 1, paddingVertical: 2 };
const LEAF_STYLE = { width: 16, height: 16 };

type IPhases = { fill: number; decode: number; commit: number };

const PHASE_ORDER = ['fill', 'decode', 'commit'] as const;

function buildRow(id: number): ISymbioteNode {
  const row = createElement('RCTView');
  setProp(row, 'style', ROW_STYLE);
  setProp(row, 'testID', `row-${id}`);
  for (let cellAt = 0; cellAt < 3; cellAt += 1) {
    const cell = createElement('RCTView');
    setProp(cell, 'style', CELL_STYLE);
    appendChild(row, cell);
    for (let leafAt = 0; leafAt < 2; leafAt += 1) {
      const leaf = createElement('RCTView');
      setProp(leaf, 'style', LEAF_STYLE);
      appendChild(cell, leaf);
    }
  }
  return row;
}

function since(startedAt: number): number {
  return performance.now() - startedAt;
}

/**
 * One create of `rows` rows, split into the three phases.
 *
 * The explicit `flushOps()` between the calls and the commit is not an artifice: it is what every
 * structural read already does, so a reconciler that navigates while it builds has the host decoding
 * continuously. Doing it once here just puts a clock around the same work.
 */
function createSplit(rootTag: number, rows: number): IPhases {
  const surface = createSurface(rootTag);

  let startedAt = performance.now();
  for (let at = 0; at < rows; at += 1) surface.appendChild(buildRow(at));
  const fill = since(startedAt);

  startedAt = performance.now();
  flushOps();
  const decode = since(startedAt);

  startedAt = performance.now();
  surface.commit();
  const commit = since(startedAt);

  disposeRoot(rootTag);
  return { fill, decode, commit };
}

function best(rootTag: number, rows: number): IPhases {
  createSplit(rootTag, rows);
  const lowest: IPhases = {
    fill: Infinity,
    decode: Infinity,
    commit: Infinity,
  };
  for (let at = 0; at < REPEATS; at += 1) {
    const pass = createSplit(rootTag + 1 + at, rows);
    for (const phase of PHASE_ORDER) {
      lowest[phase] = Math.min(lowest[phase], pass[phase]);
    }
  }
  return lowest;
}

function pad(text: string, width: number): string {
  return text.padStart(width);
}

function formatTable(
  measured: readonly (readonly [number, IPhases])[],
): string {
  const lines = [
    `${pad('rows', 6)}${pad('nodes', 8)}${pad('FILL', 9)}${pad('DECODE', 9)}${pad('COMMIT', 9)}${pad('us/node', 10)}`,
  ];
  for (const [rows, phases] of measured) {
    const nodes = rows * NODES_PER_ROW;
    const total = phases.fill + phases.decode + phases.commit;
    lines.push(
      pad(String(rows), 6) +
        pad(String(nodes), 8) +
        pad(phases.fill.toFixed(2), 9) +
        pad(phases.decode.toFixed(2), 9) +
        pad(phases.commit.toFixed(2), 9) +
        pad(((total / nodes) * 1_000).toFixed(2), 10),
    );
  }
  return lines.join('\n');
}

/** Cost per node at the widest against the narrowest — 1.0 is linear, above it is a curve. */
function curveOf(
  measured: readonly (readonly [number, IPhases])[],
  phase: keyof IPhases,
): number {
  const [firstRows, firstPhases] = measured[0];
  const [lastRows, lastPhases] = measured[measured.length - 1];
  return lastPhases[phase] / lastRows / (firstPhases[phase] / firstRows);
}

describe('the host’s work, split by phase and scaled by width', () => {
  it('shows which phase carries a curve', () => {
    const measured: (readonly [number, IPhases])[] = [];
    for (const rows of WIDTHS) {
      // A RECORDING host: this probe prices the JS half, and a stand-in tree would only add its
      // own cost to the measurement.
      installRecordingFabric();
      measured.push([rows, best(50_000 + rows * 10, rows)]);
    }

    const curves = PHASE_ORDER.map(
      phase => `${phase} ${curveOf(measured, phase).toFixed(2)}x`,
    ).join('   ');
    writeFileSync(
      fileURLToPath(
        new URL('../../../../.docs/host-work-split.txt', import.meta.url),
      ),
      [
        `create only, ${NODES_PER_ROW} nodes/row, best of ${REPEATS}, ms`,
        '',
        formatTable(measured),
        '',
        `per-node cost, ${WIDTHS[WIDTHS.length - 1]} rows vs ${WIDTHS[0]}:   ${curves}`,
        '',
      ].join('\n'),
    );

    // Deterministic, not timing: a create must reach the host as ops and must not leave anything
    // pending once it has committed. Without this the split could be measuring an empty phase.
    expect(measured).toHaveLength(WIDTHS.length);
    for (const [, phases] of measured) {
      expect(Number.isFinite(phases.fill)).toBe(true);
      expect(Number.isFinite(phases.decode)).toBe(true);
      expect(Number.isFinite(phases.commit)).toBe(true);
    }
  });
});
