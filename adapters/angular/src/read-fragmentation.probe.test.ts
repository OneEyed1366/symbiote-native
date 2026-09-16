// Angular's column of the batch-fragmentation count. See
// `adapters/solid/src/read-fragmentation.probe.test.tsx` for what the shape measures and why.
//
// Angular is here for two reasons. It NAVIGATES — `parentNode` and `nextSibling` are Renderer2
// members and its `removeChild` asks `parentOf` for the authoritative link rather than trusting the
// parent Angular hands it — and it is the slowest adapter on device by a wide margin, with a `Clear`
// that reads 44.2 ms against React's 8.7 while the engine's own window is 0.1 ms. If a teardown
// crosses once per removed node, this is where it shows.
//
// Counting three adapters rather than one is the lesson of F-19: the quadratic was looked for on
// Solid, correctly ruled out there, and was sitting in Vue.

import '@angular/compiler';
import { Component, Input, signal } from '@angular/core';
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
import { Text, View } from './components';
import { PressableElement } from './elements';
import { registerComposedComponent } from './anchor-host-registry';

// Without these the composed hosts fall through to a real `createNode` and the probe measures a
// different tree — see the anchor census for the full explanation.
registerComposedComponent('BenchmarkRow');
registerComposedComponent('fragmentation-list');

const ROOT_TAG = 8817;
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

@Component({
  selector: 'BenchmarkRow',
  standalone: true,
  imports: [PressableElement, Text, View],
  template: `
    <view [style]="rowStyle">
      <text>{{ rowId }}</text>
      <pressable>
        <text>{{ row.label }}</text>
      </pressable>
      <pressable>
        <text>x</text>
      </pressable>
    </view>
  `,
})
class BenchmarkRow {
  @Input({ required: true }) row!: IRow;
  @Input({ required: true }) isSelected = false;

  get rowStyle(): Record<string, unknown> | undefined {
    return this.isSelected ? { backgroundColor: 'blue' } : undefined;
  }

  get rowId(): string {
    return String(this.row.id);
  }
}

let mounted: List | undefined;

@Component({
  selector: 'fragmentation-list',
  standalone: true,
  imports: [BenchmarkRow, View],
  template: `
    <view testID="list">
      @for (row of rows(); track row.id) {
        <BenchmarkRow [row]="row" [isSelected]="row.id === selectedId()" />
      }
    </view>
  `,
})
class List {
  readonly rows = signal<IRow[]>(makeRows(1, ROWS));
  readonly selectedId = signal(-1);

  constructor() {
    // eslint-disable-next-line @typescript-eslint/no-this-alias
    mounted = this;
  }
}

function drive(): List {
  if (mounted === undefined) throw new Error('list was never mounted');
  return mounted;
}

// ── the counter ────────────────────────────────────────────────────────────────────────────────

let drains = 0;
let opsSeen = 0;
let childListReads = 0;
let parentReads = 0;
let siblingReads = 0;
let handlesReturned = 0;
/**
 * Time inside the host's apply, and nothing else.
 *
 * A clock around the whole step measures the ADAPTER's work too, which is most of it — the react
 * probe's first swap sweep did exactly that and its per-op figure mixed two halves (F-23). Bracketing
 * `applyOps` is what makes "how much of this is the engine" answerable.
 */
let applyMs = 0;

// Which opcodes the adapter actually emits. The drain count says how the batch is CUT; this says how
// much work is in it, and the two are independent questions — angular emits ~35 000 ops for the tree
// vue builds in ~25 000, and a difference in ops for an identical tree is work the ADAPTER is
// generating.
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
/** Which prop NAMES the extra writes carry — an op count says how many, this says which. */
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
    // Keyed by name AND value: two writes of one key can be one writer repeating itself or two
    // writers disagreeing, and only the value tells them apart.
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
      const children = base.childrenOf(handle);
      childListReads += 1;
      handlesReturned += children.length;
      return children;
    },
    parentOf: handle => {
      parentReads += 1;
      return base.parentOf(handle);
    },
    nextSiblingOf: handle => {
      siblingReads += 1;
      return base.nextSiblingOf(handle);
    },
  });
}

type ITally = {
  drains: number;
  ops: number;
  childListReads: number;
  parentReads: number;
  siblingReads: number;
  handles: number;
  byOpcode: Record<string, number>;
  byPropKey: Record<string, number>;
};

function tally(): ITally {
  const measured = {
    drains,
    ops: opsSeen,
    childListReads,
    parentReads,
    siblingReads,
    handles: handlesReturned,
    byOpcode: opCounts,
    byPropKey: propKeys,
  };
  drains = 0;
  opsSeen = 0;
  childListReads = 0;
  parentReads = 0;
  siblingReads = 0;
  handlesReturned = 0;
  opCounts = {};
  propKeys = {};
  return measured;
}

const HEADER =
  'step'.padStart(18) +
  'drains'.padStart(9) +
  'ops'.padStart(9) +
  'listReads'.padStart(11) +
  'parentReads'.padStart(13) +
  'siblingReads'.padStart(14) +
  'handles'.padStart(10);

function row(name: string, measured: ITally): string {
  return (
    name.padStart(18) +
    String(measured.drains).padStart(9) +
    String(measured.ops).padStart(9) +
    String(measured.childListReads).padStart(11) +
    String(measured.parentReads).padStart(13) +
    String(measured.siblingReads).padStart(14) +
    String(measured.handles).padStart(10)
  );
}

beforeEach(() => {
  fabric.reset();
  mounted = undefined;
});

describe('how far angular fragments the batch', () => {
  it('counts host crossings per step on a 1 000-row list', async () => {
    countCrossings();
    tally();

    const steps: (readonly [string, ITally])[] = [];
    // The split. `stepMs` is everything the adapter does plus everything we do; `applyMs` is only
    // ours, so the difference is the framework's own reconciliation.
    const split: (readonly [string, number, number])[] = [];
    const timeStep = async (name: string, act: () => void): Promise<void> => {
      applyMs = 0;
      const startedAt = performance.now();
      act();
      await flush();
      split.push([name, applyMs, performance.now() - startedAt]);
      steps.push([name, tally()]);
    };

    await timeStep('create 1000', () => mount(ROOT_TAG, List));
    await timeStep('select one row', () => drive().selectedId.set(500));
    await timeStep('append 1000', () =>
      drive().rows.set(makeRows(1, ROWS * 2)),
    );
    await timeStep('remove 1000', () => drive().rows.set(makeRows(1, ROWS)));
    await timeStep('clear', () => drive().rows.set([]));
    unmount(ROOT_TAG);

    writeFileSync(
      fileURLToPath(
        new URL(
          '../../../.docs/read-fragmentation-angular.txt',
          import.meta.url,
        ),
      ),
      `${[
        'angular — one drain per commit is the ideal',
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
        'adapter vs engine — applyMs is ours, the rest of stepMs is angular',
        `${'step'.padStart(18)}${'applyMs'.padStart(10)}${'stepMs'.padStart(10)}${'ours'.padStart(8)}`,
        ...split.map(
          ([name, apply, whole]) =>
            name.padStart(18) +
            apply.toFixed(3).padStart(10) +
            whole.toFixed(3).padStart(10) +
            `${((apply / Math.max(whole, 0.001)) * 100).toFixed(0)}%`.padStart(
              8,
            ),
        ),
        '',
        'setProp by key, create',
        ...Object.entries(steps[0][1].byPropKey)
          .sort((left, right) => right[1] - left[1])
          .map(([key, count]) => `${key.padStart(28)}  ${count}`),
        '',
      ].join('\n')}\n`,
    );

    expect(steps).toHaveLength(5);
    for (const [, measured] of steps)
      expect(measured.drains).toBeGreaterThan(0);
  });
});
