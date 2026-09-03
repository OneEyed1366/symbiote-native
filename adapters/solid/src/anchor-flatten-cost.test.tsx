// Solid's column of the five-adapter anchor census. See adapters/react/src/anchor-flatten-cost.
// test.tsx for what the shape measures and why; this file mirrors it so the numbers line up.

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createSignal, For } from 'solid-js';
import {
  censusRetainedTree,
  dlog,
  isSymbioteNode,
  readCommitProfile,
  type ISymbioteNode,
} from '@symbiote-native/engine';
import { installFabric } from '@symbiote-native/test-utils';

import { mount, unmount } from './render';
import { View, Text, Pressable } from './components';

const ROOT_TAG = 8802;
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

interface IDriver {
  setRows: (rows: IRow[]) => void;
  setSelectedId: (id: number) => void;
  rows: () => readonly IRow[];
}
let driver: IDriver | undefined;

function BenchmarkRow(props: {
  row: IRow;
  isSelected: boolean;
}): ReturnType<typeof View> {
  return (
    <View style={props.isSelected ? { backgroundColor: 'blue' } : undefined}>
      <Text>{String(props.row.id)}</Text>
      <Pressable>
        <Text>{props.row.label}</Text>
      </Pressable>
      <Pressable>
        <Text>x</Text>
      </Pressable>
    </View>
  );
}

function List(): ReturnType<typeof View> {
  const [rows, setRows] = createSignal<IRow[]>(makeRows(1, ROWS));
  const [selectedId, setSelectedId] = createSignal(-1);
  driver = { setRows, setSelectedId, rows };
  return (
    <View testID="list">
      <For each={rows()}>
        {row => <BenchmarkRow row={row} isSelected={row.id === selectedId()} />}
      </For>
    </View>
  );
}

function drive(): IDriver {
  if (driver === undefined) throw new Error('list was never mounted');
  return driver;
}

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
    `ANCHOR-COST ${JSON.stringify({ adapter: 'solid', op, ...readCommitProfile() })}`,
  );
}

beforeEach(() => {
  fabric.reset();
  driver = undefined;
  readCommitProfile();
});
afterEach(() => unmount(ROOT_TAG));

describe('solid anchor flattening cost', () => {
  it('reports the anchor census and per-operation flatten counts', async () => {
    mount(ROOT_TAG, List);
    await flush();
    report('create');

    const census = censusRetainedTree([retainedRoot()]);
    dlog(
      `ANCHOR-CENSUS ${JSON.stringify({
        adapter: 'solid',
        nodes: census.nodes,
        anchors: census.anchors,
        emptyRawTexts: census.emptyRawTexts,
        renderable: census.renderable,
        flattenSites: census.flattenWidths.length,
        widest: census.flattenWidths.slice(0, 5),
      })}`,
    );

    drive().setSelectedId(2);
    await flush();
    report('select');

    drive().setRows(
      drive()
        .rows()
        .map((row, index) =>
          index % UPDATE_STRIDE === 0
            ? { ...row, label: `${row.label} !!!` }
            : row,
        ),
    );
    await flush();
    report('partial');

    drive().setRows([...drive().rows(), ...makeRows(ROWS + 1, ROWS)]);
    await flush();
    report('append');

    // why: the row shape has to be the canary's, or every column is measuring a different list.
    expect(
      census.renderable,
      'the benchmark row must expand to nine native views',
    ).toBe(ROWS * NATIVE_VIEWS_PER_ROW + 1);
    // why: THE structural claim. A Solid component is a function returning nodes; it binds to no
    // host element, so composing three components per row allocates no engine node.
    expect(
      census.anchors,
      'a Solid component allocates no engine node of its own',
    ).toBe(0);
  });
});
