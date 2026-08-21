// One of five: the same 1000-row benchmark list, built by each adapter's REAL reconciler, so the
// per-adapter anchor count and what it costs `renderableChildren` (core/engine/src/commit.ts) are
// runtime figures rather than a grep over adapter sources. The twin files in
// adapters/{vue,svelte,solid,angular}/src/anchor-flatten-cost.test.* share this shape deliberately,
// so the columns line up.
//
// The row is examples/react/screens/BenchmarkScreen.tsx's BenchmarkRow: a composed component
// wrapping a View over a Text and two Pressables — nine native views. Composition IS the shape
// under test: an adapter whose component binds to a host element allocates an engine node per
// instance, one whose component is a function returning children allocates none, and only a live
// tree tells them apart.
//
// Numbers are emitted through dlog (DEBUG=1 to read them), never asserted loosely: the assertions
// below pin the two structural facts, and the log carries the profile a comparison run needs.

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { useState } from 'react';
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

const ROOT_TAG = 8801;
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
  setRows: (rows: readonly IRow[]) => void;
  setSelectedId: (id: number) => void;
  rows: () => readonly IRow[];
}
let driver: IDriver | undefined;

function BenchmarkRow({
  row,
  isSelected,
}: {
  row: IRow;
  isSelected: boolean;
}): React.ReactElement {
  return (
    <View style={isSelected ? { backgroundColor: 'blue' } : undefined}>
      <Text>{String(row.id)}</Text>
      <Pressable>
        <Text>{row.label}</Text>
      </Pressable>
      <Pressable>
        <Text>{'x'}</Text>
      </Pressable>
    </View>
  );
}

function List(): React.ReactElement {
  const [rows, setRows] = useState<readonly IRow[]>(() => makeRows(1, ROWS));
  const [selectedId, setSelectedId] = useState(-1);
  driver = { setRows, setSelectedId, rows: () => rows };
  return (
    <View testID="list">
      {rows.map(row => (
        <BenchmarkRow
          key={row.id}
          row={row}
          isSelected={row.id === selectedId}
        />
      ))}
    </View>
  );
}

function drive(): IDriver {
  if (driver === undefined) throw new Error('list was never mounted');
  return driver;
}

// The census needs the RETAINED tree, and the fake slot is a test's only handle on it: every
// createNode carries its retained node as the instanceHandle, so one created node plus a walk up
// the parent chain reaches the surface root.
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
    `ANCHOR-COST ${JSON.stringify({ adapter: 'react', op, ...readCommitProfile() })}`,
  );
}

beforeEach(() => {
  fabric.reset();
  driver = undefined;
  readCommitProfile();
});
afterEach(() => unmount(ROOT_TAG));

describe('react anchor flattening cost', () => {
  it('reports the anchor census and per-operation flatten counts', async () => {
    mount(ROOT_TAG, <List />);
    report('create');

    const census = censusRetainedTree([retainedRoot()]);
    dlog(
      `ANCHOR-CENSUS ${JSON.stringify({
        adapter: 'react',
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

    // why: the row shape has to be the canary's, or every column below is measuring a different
    // list. Nine native views per row, plus the list node itself.
    expect(
      census.renderable,
      'the benchmark row must expand to nine native views',
    ).toBe(ROWS * NATIVE_VIEWS_PER_ROW + 1);
    // why: THE structural claim. A React component is a function that returns children; it binds
    // to no host element, so composing three components per row allocates no engine node.
    expect(
      census.anchors,
      'a React component allocates no engine node of its own',
    ).toBe(0);
  });
});
