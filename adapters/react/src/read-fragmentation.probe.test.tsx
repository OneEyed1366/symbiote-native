// React's column of the batch-fragmentation and opcode census. See
// `adapters/solid/src/read-fragmentation.probe.test.tsx` for the shape and why it exists.
//
// React is here for the opposite reason to Angular. A source census says it NEVER navigates — no
// `parentOf` / `childrenOf` / `nextSiblingOf` anywhere in its renderer — so it should be the
// whole-batch case, one drain per commit, and that half is a control rather than a question.
//
// The question is the op HISTOGRAM. The project's own baseline has carried an unexplained line for
// months: for an identical tree and a byte-identical Fabric payload, `WRITES` on a create reads
// solid 15001/0, vue 15003/2 and react 17037/**16000** — sixteen thousand of react's writes are
// no-ops. A count of writes cannot say what they are; the opcode census keyed by prop NAME and
// VALUE can.

import { useState } from 'react';
import { beforeEach, describe, expect, it } from 'vitest';
import { setTreeHost, treeHost } from '@symbiote-native/engine';
import {
  OP_APPEND_CHILD,
  OP_CREATE_ANCHOR,
  OP_CREATE_ELEMENT,
  OP_CREATE_RAW_TEXT,
  OP_INSERT_BEFORE,
  OP_REMOVE_CHILD,
  OP_SET_COMPONENT,
  OP_SET_PROP,
  OP_SET_TEXT,
  OP_STRIDE,
} from '@symbiote-native/engine/mutation-buffer';
import { installRecordingFabric } from '@symbiote-native/test-utils';
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { mount, unmount } from './render';

const ROOT_TAG = 8818;
const ROWS = 1_000;
const SWAP_WIDTHS = [250, 500, 1_000, 2_000];

const fabric = installRecordingFabric();

const tick = (): Promise<void> =>
  new Promise(resolve => setTimeout(resolve, 0));

/**
 * Wait until the commit has actually landed, not for one macrotask.
 *
 * A single `setTimeout(0)` is enough for every other adapter here and is NOT enough for React: its
 * work goes through its own scheduler, and under a loaded full-suite run a step could return with
 * the render still queued. The assertion at the bottom then read `drains === 0` for that step and
 * the file failed — but only in the full suite, never alone, which is the shape that gets written
 * off as flake instead of fixed. Ticking until a tick adds no drains is the condition the fixed
 * timeout was standing in for.
 *
 * AND A ROUND CAP IS A TIMEOUT IN DISGUISE, which is why that fix did not hold. Twenty macrotasks
 * is a duration dressed as a condition: under a loaded suite React's scheduler simply needs more of
 * them, the loop gives up, and `drains` reads 0 again — the same failure the same file, with the
 * same "passes alone" signature. The wait now has TWO phases and a bound big enough to be a
 * backstop rather than a limit: first until the step has drained at all, then until a tick stops
 * adding drains. Only the first phase can be starved by load, and it is the one with a condition.
 */
async function settle(): Promise<void> {
  const before = drains;
  for (let round = 0; round < 500 && drains === before; round += 1) {
    await tick();
  }
  let seen = -1;
  for (let round = 0; round < 500 && seen !== drains; round += 1) {
    seen = drains;
    await tick();
  }
}

type IRow = { id: number; label: string };

function makeRows(from: number, count: number): IRow[] {
  return Array.from({ length: count }, (_value, index) => ({
    id: from + index,
    label: `row ${from + index}`,
  }));
}

type IDriver = {
  setRows: (rows: readonly IRow[]) => void;
  setSelectedId: (id: number) => void;
};
let driver: IDriver | undefined;

function BenchmarkRow({
  row,
  isSelected,
}: {
  row: IRow;
  isSelected: boolean;
}): React.ReactElement {
  return (
    <view style={isSelected ? { backgroundColor: 'blue' } : undefined}>
      <text>{String(row.id)}</text>
      <pressable>
        <text>{row.label}</text>
      </pressable>
      <pressable>
        <text>{'x'}</text>
      </pressable>
    </view>
  );
}

/** How many rows the next mount builds — set by the swap sweep. */
let mountRows = ROWS;

/** The same list with the second and second-to-last rows exchanged, and nothing else touched. */
function swapEnds(rows: readonly IRow[]): IRow[] {
  const next = [...rows];
  const low = 1;
  const high = next.length - 2;
  const held = next[low];
  next[low] = next[high];
  next[high] = held;
  return next;
}

function List(): React.ReactElement {
  const [rows, setRows] = useState<readonly IRow[]>(() =>
    makeRows(1, mountRows),
  );
  const [selectedId, setSelectedId] = useState(-1);
  driver = { setRows, setSelectedId };
  return (
    <view testID="list">
      {rows.map(row => (
        <BenchmarkRow
          key={row.id}
          row={row}
          isSelected={row.id === selectedId}
        />
      ))}
    </view>
  );
}

function drive(): IDriver {
  if (driver === undefined) throw new Error('list was never mounted');
  return driver;
}

// ── the counter ────────────────────────────────────────────────────────────────────────────────

let drains = 0;
let opsSeen = 0;
let navigationReads = 0;
/**
 * Time spent INSIDE the host's apply, and nothing else.
 *
 * A clock around `setRows` + flush measures react's reconciliation as well as ours, so it cannot
 * attribute anything — the first version of the sweep below did exactly that and its `us/op` mixed
 * two halves. This one brackets `applyOps`, which is the half this investigation is about.
 */
let applyMs = 0;

const OP_NAMES: Record<number, string> = {
  [OP_CREATE_ELEMENT]: 'createElement',
  [OP_CREATE_RAW_TEXT]: 'createRawText',
  [OP_CREATE_ANCHOR]: 'createAnchor',
  [OP_APPEND_CHILD]: 'appendChild',
  [OP_INSERT_BEFORE]: 'insertBefore',
  [OP_REMOVE_CHILD]: 'removeChild',
  [OP_SET_PROP]: 'setProp',
  [OP_SET_TEXT]: 'setText',
  [OP_SET_COMPONENT]: 'setComponent',
};
let opCounts: Record<string, number> = {};
let propKeys: Record<string, number> = {};

function countOpcodes(
  ops: ArrayLike<number>,
  strings: readonly string[],
  values: readonly unknown[],
): void {
  for (let at = 0; at + OP_STRIDE <= ops.length; at += OP_STRIDE) {
    const name = OP_NAMES[ops[at]];
    if (name === undefined) continue;
    opCounts[name] = (opCounts[name] ?? 0) + 1;
    if (ops[at] !== OP_SET_PROP) continue;
    // Keyed by name AND value: one writer repeating itself and two writers disagreeing are the same
    // count and different bugs, and only the value tells them apart.
    const key = `${strings[ops[at + 2]] ?? '?'}=${String(values[ops[at + 3]])}`;
    propKeys[key] = (propKeys[key] ?? 0) + 1;
  }
}

function countCrossings(): void {
  const base = treeHost();
  if (base === undefined) throw new Error('no host installed');
  setTreeHost({
    ...base,
    applyOps: batch => {
      drains += 1;
      opsSeen += batch.ops.length / OP_STRIDE;
      countOpcodes(batch.ops, batch.strings, batch.values);
      const startedAt = performance.now();
      base.applyOps(batch);
      applyMs += performance.now() - startedAt;
    },
    childrenOf: handle => {
      navigationReads += 1;
      return base.childrenOf(handle);
    },
    parentOf: handle => {
      navigationReads += 1;
      return base.parentOf(handle);
    },
    nextSiblingOf: handle => {
      navigationReads += 1;
      return base.nextSiblingOf(handle);
    },
  });
}

type ITally = {
  drains: number;
  ops: number;
  navigationReads: number;
  byOpcode: Record<string, number>;
  byPropKey: Record<string, number>;
};

function tally(): ITally {
  const measured = {
    drains,
    ops: opsSeen,
    navigationReads,
    byOpcode: opCounts,
    byPropKey: propKeys,
  };
  drains = 0;
  opsSeen = 0;
  navigationReads = 0;
  opCounts = {};
  propKeys = {};
  return measured;
}

const HEADER =
  'step'.padStart(18) +
  'drains'.padStart(9) +
  'ops'.padStart(9) +
  'navReads'.padStart(10);

function row(name: string, measured: ITally): string {
  return (
    name.padStart(18) +
    String(measured.drains).padStart(9) +
    String(measured.ops).padStart(9) +
    String(measured.navigationReads).padStart(10)
  );
}

beforeEach(() => {
  fabric.reset();
  driver = undefined;
});

// A BUDGET, not a guess, and the third distinct way this file has failed. The sweep mounts four
// lists of up to 2 000 rows and drives react's scheduler through each — ~4.2 s alone, against
// vitest's 5 s default. Under a full-suite run that headroom is gone, and the failure arrives as a
// timeout rather than as a wrong count, which reads as a broken probe instead of a loaded machine.
//
// Raising it is sound here in a way a round cap never was (see `settle`): what this probe measures
// is op COUNTS, which are deterministic and unaffected by how long the machine takes to produce
// them. Only the wall clock varies with load, so only the wall clock needs the room.
const SWEEP_BUDGET_MS = 60_000;

describe('how far react fragments the batch, and what it emits', () => {
  it(
    'counts drains and every opcode on a 1 000-row list',
    async () => {
      countCrossings();
      tally();

      const steps: (readonly [string, ITally])[] = [];
      mount(ROOT_TAG, <List />);
      await settle();
      steps.push(['create 1000', tally()]);

      drive().setSelectedId(500);
      await settle();
      steps.push(['select one row', tally()]);

      drive().setRows(makeRows(1, ROWS * 2));
      await settle();
      steps.push(['append 1000', tally()]);

      drive().setRows(makeRows(1, ROWS));
      await settle();
      steps.push(['remove 1000', tally()]);

      // TWO ROWS EXCHANGE PLACES, and nothing else changes. The benchmark's `Swap` row, and React's
      // standing anomaly on device: 35.3 ms against stock's 9.6 and Solid's 6.1, unexplained for
      // months. A swap is two moves; anything more than that is the reconciler, and an op census names
      // it without a device.
      drive().setRows(swapEnds(makeRows(1, ROWS)));
      await settle();
      steps.push(['swap two rows', tally()]);
      unmount(ROOT_TAG);

      // THE CURVE, and it is the point of this file now. The move COUNT is react's heuristic and grows
      // with the list; what each move COSTS is ours — `detachFromParent` scans the sibling vector,
      // `insertBefore` scans it again, and the insert shifts it. Linear ops times linear cost is
      // quadratic, and a suspected quadratic has been wrong here before (F-1), so it is measured
      // rather than argued.
      const sweep: (readonly [number, number, number, number])[] = [];
      for (const width of SWAP_WIDTHS) {
        fabric.reset();
        driver = undefined;
        mountRows = width;
        tally();
        mount(ROOT_TAG + width, <List />);
        await settle();
        tally();
        applyMs = 0;
        const startedAt = performance.now();
        drive().setRows(swapEnds(makeRows(1, width)));
        await settle();
        const wholeStep = performance.now() - startedAt;
        sweep.push([width, tally().ops, applyMs, wholeStep]);
        unmount(ROOT_TAG + width);
      }

      writeFileSync(
        fileURLToPath(
          new URL(
            '../../../.docs/read-fragmentation-react.txt',
            import.meta.url,
          ),
        ),
        `${[
          'react — one drain per commit is the ideal',
          '',
          HEADER,
          ...steps.map(([name, measured]) => row(name, measured)),
          '',
          'ops by opcode',
          ...steps.map(
            ([name, measured]) =>
              `${name.padStart(18)}  ${JSON.stringify(measured.byOpcode)}`,
          ),
          '',
          'setProp by key=value, create',
          ...Object.entries(steps[0][1].byPropKey)
            .sort((left, right) => right[1] - left[1])
            .slice(0, 12)
            .map(([key, count]) => `${key.padStart(34)}  ${count}`),
          '',
          'swap two rows, by width — ops is react, applyMs is OURS, stepMs is both',
          `${'rows'.padStart(8)}${'ops'.padStart(8)}${'applyMs'.padStart(10)}${'us/op'.padStart(9)}${'stepMs'.padStart(10)}`,
          ...sweep.map(
            ([width, ops, apply, whole]) =>
              String(width).padStart(8) +
              String(ops).padStart(8) +
              apply.toFixed(3).padStart(10) +
              ((apply * 1_000) / Math.max(ops, 1)).toFixed(2).padStart(9) +
              whole.toFixed(3).padStart(10),
          ),
          '',
        ].join('\n')}\n`,
      );

      expect(steps).toHaveLength(5);
      for (const [, measured] of steps)
        expect(measured.drains).toBeGreaterThan(0);
    },
    SWEEP_BUDGET_MS,
  );
});
