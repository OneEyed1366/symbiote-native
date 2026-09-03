// Vue's column of the five-adapter anchor census. See adapters/react/src/anchor-flatten-cost.
// test.tsx for what the shape measures and why; this file mirrors it so the numbers line up.
//
// Written with h() rather than an SFC because this repo compiles SFCs in Metro, not in Vitest. The
// Fragment is explicit for exactly that reason: a `v-for` compiles to `createElementBlock(Fragment,
// …)`, and the fragment's own start/end anchors are part of what is being counted here — an h()
// call returning a bare array would produce the same Fragment implicitly and hide why.

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  defineComponent,
  Fragment,
  h,
  ref,
  type VNode,
} from '@vue/runtime-core';
import {
  censusRetainedTree,
  dlog,
  isSymbioteNode,
  readCommitProfile,
  type ISymbioteNode,
} from '@symbiote-native/engine';
import { installFabric } from '@symbiote-native/test-utils';

import { mount, unmount } from './render';
import { View, Text } from './components';
import { Pressable } from './components/pressable';

const ROOT_TAG = 8803;
const ROWS = 1000;
const NATIVE_VIEWS_PER_ROW = 9;
const UPDATE_STRIDE = 10;

const fabric = installFabric();

const flush = (): Promise<void> =>
  new Promise(resolve => setTimeout(resolve, 0));

interface IRow {
  id: number;
  label: string;
}

function makeRows(from: number, count: number): IRow[] {
  return Array.from({ length: count }, (_value, index) => ({
    id: from + index,
    label: `row ${from + index}`,
  }));
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
        View,
        { style: props.isSelected ? { backgroundColor: 'blue' } : undefined },
        () => [
          h(Text, null, () => String(row.id)),
          h(Pressable, null, () => [h(Text, null, () => row.label)]),
          h(Pressable, null, () => [h(Text, null, () => 'x')]),
        ],
      );
    };
  },
});

function isRow(value: unknown): value is IRow {
  if (typeof value !== 'object' || value === null) return false;
  return typeof Reflect.get(value, 'id') === 'number';
}

const List = defineComponent({
  name: 'List',
  setup() {
    return (): VNode =>
      h(View, { testID: 'list' }, () => [
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

function retainedRoot(): ISymbioteNode {
  const seed = fabric.created.find(node => node.props.testID === 'list');
  if (seed === undefined) throw new Error('the list node was never created');
  const handle: unknown = seed.instanceHandle;
  if (!isSymbioteNode(handle))
    throw new Error('the list node carries no retained handle');
  let current: ISymbioteNode = handle;
  while (current.parent !== undefined) current = current.parent;
  return current;
}

function report(op: string): void {
  dlog(
    `ANCHOR-COST ${JSON.stringify({ adapter: 'vue', op, ...readCommitProfile() })}`,
  );
}

beforeEach(() => {
  fabric.reset();
  rowsRef.value = makeRows(1, ROWS);
  selectedIdRef.value = -1;
  readCommitProfile();
});
afterEach(() => unmount(ROOT_TAG));

describe('vue anchor flattening cost', () => {
  it('reports the anchor census and per-operation flatten counts', async () => {
    mount(ROOT_TAG, List);
    await flush();
    report('create');

    const census = censusRetainedTree([retainedRoot()]);
    dlog(
      `ANCHOR-CENSUS ${JSON.stringify({
        adapter: 'vue',
        nodes: census.nodes,
        anchors: census.anchors,
        emptyRawTexts: census.emptyRawTexts,
        renderable: census.renderable,
        flattenSites: census.flattenWidths.length,
        widest: census.flattenWidths.slice(0, 5),
      })}`,
    );

    selectedIdRef.value = 2;
    await flush();
    report('select');

    rowsRef.value = rowsRef.value.map((row, index) =>
      index % UPDATE_STRIDE === 0 ? { ...row, label: `${row.label} !!!` } : row,
    );
    await flush();
    report('partial');

    rowsRef.value = [...rowsRef.value, ...makeRows(ROWS + 1, ROWS)];
    await flush();
    report('append');

    // why: the row shape has to be the canary's, or every column is measuring a different list.
    expect(
      census.renderable,
      'the benchmark row must expand to nine native views',
    ).toBe(ROWS * NATIVE_VIEWS_PER_ROW + 1);
    // why: THE structural claim for Vue. A component allocates no node — but a FRAGMENT does, two
    // of them, and a v-for is a fragment. So Vue's anchors scale with the number of fragments in
    // the template, not with the number of component instances.
    expect(
      census.anchors,
      'a Vue component allocates no engine node; its v-for fragment allocates two anchors',
    ).toBe(2);
  });
});
