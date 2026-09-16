// What the C++ applier PAYS PER OP that it could pay per distinct thing.
//
// `mutation-buffer.ts` interns every string and says why: "a 1 000-row create emits about a dozen
// distinct view names across 10 000 elements, and every prop KEY is drawn from a set of a few
// hundred". The far side does not spend that. `SymbioteTree.cpp`'s `stringAt` is a lambda that
// reads the JSI array and allocates a fresh `std::string` on EVERY op naming a string, so the
// interning saves a slot in the table and nothing at all in the applier.
//
// The same shape a second time on the value side, and it took a wrong first cut to see. `values`
// has no dedup, so the guess was that a style object a class registry memoizes to ONE object for
// the whole app would arrive once per node and be deep-copied once per node — catchable by hashing
// the top-level value by identity. It is not: this probe's first run read 1 001 object values for
// 1 001 DISTINCT objects, ratio 1.0x.
//
// The reason is `pushClassStyle`, which publishes a FRESH `[classStyle, explicitStyle]` array on
// every write. So the shared object is one level down, wrapped in a per-node array, and no
// top-level identity check can ever see it. That fresh array is the same mechanism F-22 records for
// defeating `setProp`'s `Object.is` guard — it defeats value dedup on the wire for the same reason.
//
// What is actually paid is therefore counted in ENTRIES, the unit `boundedDynamicFrom`'s own bound
// counts: one per key of every object the walk expands.
//
// Neither is visible to a clock here — headless runs the TS applier, where a string is already a
// value and an object is already an object. This is the F-15 class exactly: the two appliers agree
// byte for byte on the tree and disagree on what it costs to build it. So the instrument is a
// COUNT, the way `childrenAdopted` was for F-25.
//
// The ratios this prints are the per-batch multiplier the C++ side is currently paying.

import { beforeEach, describe, expect, it } from 'vitest';
import { createSignal, For } from 'solid-js';
import { setTreeHost, treeHost } from '@symbiote-native/engine';
import {
  OP_CREATE_ELEMENT,
  OP_CREATE_RAW_TEXT,
  OP_SET_COMPONENT,
  OP_SET_PROP,
  OP_SET_TEXT,
  OP_STRIDE,
} from '@symbiote-native/engine/mutation-buffer';
import { installRecordingFabric } from '@symbiote-native/test-utils';
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { mount, unmount } from './render';

const ROOT_TAG = 8821;
const ROWS = 1_000;

const fabric = installRecordingFabric();

const flush = (): Promise<void> =>
  new Promise(resolve => setTimeout(resolve, 0));

type IRow = { id: number; label: string };

function makeRows(from: number, count: number): IRow[] {
  return Array.from({ length: count }, (_value, index) => ({
    id: from + index,
    label: `row ${from + index}`,
  }));
}

const ROW_POOL = makeRows(1, ROWS * 2);

// Hoisted exactly the way a class registry memoizes one: ONE object, every row. This is the value
// the census is about — the engine resolves a class string to the same object every time, which is
// what makes a per-node conversion pure waste.
const ROW_STYLE = { paddingHorizontal: 12, flexDirection: 'row' } as const;
const SELECTED_STYLE = { backgroundColor: 'blue' } as const;

type IDriver = {
  setRows: (rows: readonly IRow[]) => void;
  setSelectedId: (id: number) => void;
};
let driver: IDriver | undefined;

function BenchmarkRow(props: {
  row: IRow;
  isSelected: boolean;
}): ReturnType<typeof View> {
  return (
    <view style={props.isSelected ? SELECTED_STYLE : ROW_STYLE}>
      <text>{String(props.row.id)}</text>
      <pressable>
        <text>{props.row.label}</text>
      </pressable>
      <pressable>
        <text>x</text>
      </pressable>
    </view>
  );
}

function List(): ReturnType<typeof View> {
  const [rows, setRows] = createSignal<readonly IRow[]>(
    ROW_POOL.slice(0, ROWS),
  );
  const [selectedId, setSelectedId] = createSignal(-1);
  driver = { setRows, setSelectedId };
  return (
    <view testID="list">
      <For each={rows()}>
        {row => <BenchmarkRow row={row} isSelected={row.id === selectedId()} />}
      </For>
    </view>
  );
}

function drive(): IDriver {
  if (driver === undefined) throw new Error('list was never mounted');
  return driver;
}

// ── the census ─────────────────────────────────────────────────────────────────────────────────

/** Ops that name a string operand, i.e. one `stringAt` call each in the C++ applier. */
const STRING_NAMING = new Set([
  OP_CREATE_ELEMENT,
  OP_CREATE_RAW_TEXT,
  OP_SET_TEXT,
  OP_SET_COMPONENT,
  OP_SET_PROP,
]);

type ITally = {
  batches: number;
  /** `stringAt` calls the C++ applier makes: one per string-naming op. */
  stringReads: number;
  /** Entries in the batch's `strings` table: what a decode-once would cost instead. */
  stringEntries: number;
  /** `boundedDynamicFrom` calls: one per setProp carrying a value. */
  valueConversions: number;
  /**
   * `folly::dynamic` entries the batch builds — one per key of every object the walk expands, the
   * unit `boundedDynamicFrom`'s own ceiling counts.
   */
  entries: number;
  /** The same count with every object converted once per IDENTITY instead of once per mention. */
  distinctEntries: number;
};

const EMPTY: ITally = {
  batches: 0,
  stringReads: 0,
  stringEntries: 0,
  valueConversions: 0,
  entries: 0,
  distinctEntries: 0,
};

let tallied: ITally = { ...EMPTY };

function reset(): void {
  tallied = { ...EMPTY };
}

/**
 * Entries one `boundedDynamicFrom` builds, counted the way its own ceiling does.
 *
 * `seen` is the counterfactual and it is per BATCH, not per value: an object already converted in
 * this batch would be a cache hit, and everything under it comes for free. Handing `undefined`
 * instead prices the walk as the applier pays it today.
 */
function entriesOf(value: unknown, seen: Set<object> | undefined): number {
  if (typeof value !== 'object' || value === null) return 0;
  if (seen !== undefined) {
    if (seen.has(value)) return 0;
    seen.add(value);
  }
  let count = 0;
  for (const nested of Array.isArray(value) ? value : Object.values(value)) {
    count += 1 + entriesOf(nested, seen);
  }
  return count;
}

function census(
  ops: ArrayLike<number>,
  strings: readonly string[],
  values: readonly unknown[],
): void {
  tallied.batches += 1;
  tallied.stringEntries += strings.length;
  for (let at = 0; at + OP_STRIDE <= ops.length; at += OP_STRIDE) {
    if (STRING_NAMING.has(ops[at])) tallied.stringReads += 1;
  }
  // Counted off the VALUES table rather than the ops, because that is what the applier converts:
  // one entry, one `boundedDynamicFrom`. A delete carries no entry at all.
  const seen = new Set<object>();
  for (const value of values) {
    tallied.valueConversions += 1;
    tallied.entries += entriesOf(value, undefined);
    tallied.distinctEntries += entriesOf(value, seen);
  }
}

function countDecodes(): void {
  const base = treeHost();
  if (base === undefined) throw new Error('no host installed');
  setTreeHost({
    ...base,
    applyOps: batch => {
      census(batch.ops, batch.strings, batch.values);
      base.applyOps(batch);
    },
  });
}

function take(): ITally {
  const measured = { ...tallied };
  reset();
  return measured;
}

const HEADER =
  'step'.padStart(16) +
  'stringReads'.padStart(13) +
  'strEntries'.padStart(12) +
  'x'.padStart(7) +
  'valueConv'.padStart(11) +
  'entries'.padStart(9) +
  'distinct'.padStart(10) +
  'x'.padStart(7);

function ratio(paid: number, needed: number): string {
  return needed === 0 ? '—' : `${(paid / needed).toFixed(1)}x`;
}

function row(name: string, measured: ITally): string {
  return (
    name.padStart(16) +
    String(measured.stringReads).padStart(13) +
    String(measured.stringEntries).padStart(12) +
    ratio(measured.stringReads, measured.stringEntries).padStart(7) +
    String(measured.valueConversions).padStart(11) +
    String(measured.entries).padStart(9) +
    String(measured.distinctEntries).padStart(10) +
    ratio(measured.entries, measured.distinctEntries).padStart(7)
  );
}

beforeEach(() => {
  fabric.reset();
  driver = undefined;
  reset();
});

describe('what the native applier decodes per op instead of per thing', () => {
  it('counts string reads and value conversions against the distinct sets', async () => {
    countDecodes();
    take();

    const steps: (readonly [string, ITally])[] = [];
    const step = async (name: string, act: () => void): Promise<void> => {
      act();
      await flush();
      steps.push([name, take()]);
    };

    await step('create 1000', () => mount(ROOT_TAG, List));
    await step('select one row', () => drive().setSelectedId(500));
    await step('append 1000', () => drive().setRows(ROW_POOL));
    await step('remove 1000', () => drive().setRows(ROW_POOL.slice(0, ROWS)));
    unmount(ROOT_TAG);

    const create = steps[0][1];
    writeFileSync(
      fileURLToPath(
        new URL('../../../.docs/batch-decode-census.txt', import.meta.url),
      ),
      `${[
        'solid, 1 000 rows — what SymbioteTree.cpp decodes per OP vs per distinct thing',
        'stringReads = stringAt() calls = JSI read + std::string alloc, one per string-naming op',
        'strEntries  = what one decode of the strings table would cost instead',
        'valueConv   = boundedDynamicFrom() calls; entries = folly::dynamic entries they build',
        'distinct    = the same with each object converted once per identity per batch',
        '',
        HEADER,
        ...steps.map(([name, measured]) => row(name, measured)),
        '',
        `create: ${create.stringReads} string decodes for ${create.stringEntries} distinct strings`,
        `create: ${create.entries} dynamic entries built for ${create.distinctEntries} distinct ones`,
        // F-29's "second deep copy into committedProps" column dropped when this probe moved off
        // `installFabric()`: that count came from the fake slot simulating what SymbioteTree.cpp's
        // create path does with the payload, the same derived-decision risk this doc's own
        // "TARGETED-REPLACE PROJECTION" finding already retired once — asking the real engine is
        // the honest way to revive it, not a TS re-simulation of a C++ internal.
        '',
      ].join('\n')}\n`,
    );

    // Deterministic, not timing. The claim is that the applier decodes strictly more often than the
    // batch has distinct things — if these ever became equal the finding would be gone, and that is
    // exactly what the test should notice.
    expect(create.stringReads).toBeGreaterThan(create.stringEntries);
    expect(create.entries).toBeGreaterThan(create.distinctEntries);
  });
});
