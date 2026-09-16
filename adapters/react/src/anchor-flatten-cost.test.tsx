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
//
// The count comes from `censusLive`, NOT from the engine's `censusRetainedTree`, and the swap is
// the point rather than a detail. `censusRetainedTree` delegates to `treeHost().census()` — which
// the TypeScript applier answers truthfully and nothing else does. The native host returns zeroes
// on purpose (census is deliberately off the ABI; `native-tree-host.ts` says why), so every one of
// these numbers read on a device has always been a zero. A figure only the stand-in can produce is
// a mirror measurement, whatever it is measuring.
//
// `censusLive` reads the engine's own child links and its own `isAnchor` instead, so the two
// assertions below mean the same thing under every host. What it does NOT carry across is the
// applier's `renderable` (which also subtracts empty raw texts — a COMMIT rule, settled in
// `empty-raw-text.itest.ts`) and its `flattenWidths` (the commit walk's own bookkeeping). Neither
// was ever asserted here; both were logged, and what they logged was the stand-in's work.

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { useState } from 'react';
import {
  dlog,
  parentOf,
  readCommitProfile,
  type ISymbioteNode,
} from '@symbiote-native/engine';
import {
  censusLive,
  installRecordingFabric,
} from '@symbiote-native/test-utils';

import { mount, unmount } from './render';

const ROOT_TAG = 8801;
const ROWS = 1000;
const NATIVE_VIEWS_PER_ROW = 9;
const UPDATE_STRIDE = 10;

const fabric = installRecordingFabric();

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

function List(): React.ReactElement {
  const [rows, setRows] = useState<readonly IRow[]>(() => makeRows(1, ROWS));
  const [selectedId, setSelectedId] = useState(-1);
  driver = { setRows, setSelectedId, rows: () => rows };
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

// The census needs the RETAINED tree. The recording names the node the app authored and hands back
// the engine node itself, so one recorded node plus a walk up the parent chain reaches the surface
// root — no unwrapping of an instanceHandle, and no guess about what the renderer did with it.
function retainedRoot(): ISymbioteNode {
  const seed = fabric.find(node => node.props.testID === 'list');
  if (seed === undefined) throw new Error('the list node was never created');
  let current: ISymbioteNode = seed.handle;
  let above = parentOf(current);
  while (above !== undefined) {
    current = above;
    above = parentOf(current);
  }
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

    const census = censusLive(retainedRoot());
    dlog(
      `ANCHOR-CENSUS ${JSON.stringify({
        adapter: 'react',
        nodes: census.nodes,
        anchors: census.anchors,
        nonAnchors: census.nonAnchors,
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
      census.nonAnchors,
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
