// Vue's column of the batch-fragmentation count. See
// `adapters/solid/src/read-fragmentation.probe.test.tsx` for what the shape measures and why.
//
// Vue is here because it navigates DIFFERENTLY and the difference is the point. Solid's renderer
// asks `getFirstChild`, which on a build is a question about a node that has none — so the
// `mayHaveChildren` guard answers it without a crossing. Vue's `nextSibling` asks `parentOf` FIRST
// and only then reads the parent's child list, and `parentOf` has no such guard. A fix measured on
// one adapter is a fix for one adapter until the others are counted.
//
// Written with h() rather than an SFC for the reason the anchor census gives: this repo compiles
// SFCs in Metro, not in Vitest.

import { beforeEach, describe, expect, it } from 'vitest';
import {
  defineComponent,
  Fragment,
  h,
  ref,
  type VNode,
} from '@vue/runtime-core';
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
import './register';

const ROOT_TAG = 8816;
const ROWS = 1_000;
const WIDTHS = [250, 500, 1_000, 2_000];

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

function isRow(value: unknown): value is IRow {
  if (typeof value !== 'object' || value === null) return false;
  return typeof Reflect.get(value, 'id') === 'number';
}

const rowsRef = ref<IRow[]>([]);
const selectedIdRef = ref(-1);

const BenchmarkRow = defineComponent({
  name: 'BenchmarkRow',
  props: {
    row: { type: Object, required: true },
    isSelected: { type: Boolean, required: true },
  },
  setup(props) {
    return (): VNode => {
      const row: unknown = props.row;
      if (!isRow(row)) throw new Error('row prop lost its shape');
      return h(
        'view',
        { style: props.isSelected ? { backgroundColor: 'blue' } : undefined },
        [
          h('text', null, String(row.id)),
          h('pressable', null, [h('text', null, row.label)]),
          h('pressable', null, [h('text', null, 'x')]),
        ],
      );
    };
  },
});

const List = defineComponent({
  name: 'List',
  setup() {
    return (): VNode =>
      h('view', { testID: 'list' }, [
        h(
          Fragment,
          null,
          rowsRef.value.map(row =>
            h(BenchmarkRow, {
              key: row.id,
              row,
              isSelected: row.id === selectedIdRef.value,
            }),
          ),
        ),
      ]);
  },
});

// ── the counter ────────────────────────────────────────────────────────────────────────────────

let drains = 0;
let opsSeen = 0;
let childListReads = 0;
let parentReads = 0;
let handlesReturned = 0;

// Which opcodes the adapter emits, so an ops total can be compared across adapters by CAUSE. The
// same tree costs angular ~35 000 ops and vue ~25 000, and a difference in ops for one tree is work
// the adapter is generating rather than a cost of the platform.
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

function countOpcodes(ops: ArrayLike<number>): void {
  for (let at = 0; at + OP_STRIDE <= ops.length; at += OP_STRIDE) {
    const name = OP_NAMES[ops[at]];
    if (name === undefined) continue;
    opCounts[name] = (opCounts[name] ?? 0) + 1;
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
      countOpcodes(batch.ops);
      base.applyOps(batch);
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
  });
}

type ITally = {
  drains: number;
  ops: number;
  childListReads: number;
  parentReads: number;
  handles: number;
  byOpcode: Record<string, number>;
};

function tally(): ITally {
  const measured = {
    drains,
    ops: opsSeen,
    childListReads,
    parentReads,
    handles: handlesReturned,
    byOpcode: opCounts,
  };
  drains = 0;
  opsSeen = 0;
  childListReads = 0;
  parentReads = 0;
  handlesReturned = 0;
  opCounts = {};
  return measured;
}

const HEADER =
  'step'.padStart(18) +
  'drains'.padStart(9) +
  'ops'.padStart(9) +
  'listReads'.padStart(11) +
  'parentReads'.padStart(13) +
  'handles'.padStart(10);

function row(name: string, measured: ITally): string {
  return (
    name.padStart(18) +
    String(measured.drains).padStart(9) +
    String(measured.ops).padStart(9) +
    String(measured.childListReads).padStart(11) +
    String(measured.parentReads).padStart(13) +
    String(measured.handles).padStart(10)
  );
}

beforeEach(() => {
  fabric.reset();
});

describe('how far vue fragments the batch', () => {
  it('counts host drains, child-list reads and parent reads', async () => {
    countCrossings();
    tally();

    const steps: (readonly [string, ITally])[] = [];
    rowsRef.value = makeRows(1, ROWS);
    selectedIdRef.value = -1;
    mount(ROOT_TAG, List);
    await flush();
    steps.push(['create 1000', tally()]);

    selectedIdRef.value = 500;
    await flush();
    steps.push(['select one row', tally()]);

    rowsRef.value = makeRows(1, ROWS * 2);
    await flush();
    steps.push(['append 1000', tally()]);

    rowsRef.value = makeRows(1, ROWS);
    await flush();
    steps.push(['remove 1000', tally()]);
    unmount(ROOT_TAG);

    const sweep: (readonly [number, ITally])[] = [];
    for (const width of WIDTHS) {
      fabric.reset();
      rowsRef.value = makeRows(1, width);
      selectedIdRef.value = -1;
      tally();
      mount(ROOT_TAG + width, List);
      await flush();
      sweep.push([width, tally()]);
      unmount(ROOT_TAG + width);
    }

    writeFileSync(
      fileURLToPath(
        new URL('../../../.docs/read-fragmentation-vue.txt', import.meta.url),
      ),
      `${[
        'vue — one drain per commit is the ideal',
        '',
        HEADER,
        ...steps.map(([name, measured]) => row(name, measured)),
        '',
        'create, by width',
        HEADER,
        ...sweep.map(([width, measured]) => row(`${width} rows`, measured)),
        '',
        'ops by opcode',
        ...steps.map(
          ([name, measured]) =>
            `${name.padStart(18)}  ${JSON.stringify(measured.byOpcode)}`,
        ),
        '',
      ].join('\n')}\n`,
    );

    expect(steps).toHaveLength(4);
    expect(sweep).toHaveLength(WIDTHS.length);
    for (const [, measured] of steps)
      expect(measured.drains).toBeGreaterThan(0);
  });
});
