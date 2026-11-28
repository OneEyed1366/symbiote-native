// Svelte's column of the five-adapter anchor census, mirroring `adapters/react` so numbers line up
// Real `.svelte` source is compiled at run time, as `mount-pipeline.smoke.test.ts` does

// The row composes a local Pressable stub over the raw `view` tag, not the adapter's own
// The adapter's components are `.svelte` files, which vitest cannot parse without a svelte plugin
// The stub keeps the counts equal: one host view per Pressable and nine host tags per row

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { compile } from 'svelte/compiler';
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { Component } from 'svelte';
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

// The RN-runtime stand-in every Svelte smoke needs, as `init_operations()` reads both on mount
if (globalThis.window === undefined) {
  Object.assign(globalThis, { window: globalThis });
}
if (globalThis.navigator === undefined) {
  Object.assign(globalThis, { navigator: { product: 'ReactNative' } });
}

const ROOT_TAG = 8_805;
const ROWS = 1_000;
const NATIVE_VIEWS_PER_ROW = 9;
const UPDATE_STRIDE = 10;
// Two composed Pressables at two anchors each
const ANCHORS_PER_ROW = 4;
// The list view and the root view `mount()` builds for Svelte to attach to
const VIEWS_ABOVE_ROWS = 2;
// The each-block's own two empty text nodes, which the commit skips
const EACH_BLOCK_BLANK_TEXTS = 2;

// Its own subfolder, as vitest runs files in parallel and a shared dir lets one cleanup hit another
const TMP_DIR = join(__dirname, '../build/__smoke__/anchor-flatten-cost');

const fabric = installRecordingFabric();

const flush = (): Promise<void> =>
  new Promise(resolve => setTimeout(resolve, 0));

type IRow = {
  id: number;
  label: string;
};

function makeRows(from: number, count: number): IRow[] {
  return Array.from({ length: count }, (_value, index) => ({
    id: from + index,
    label: `row ${from + index}`,
  }));
}

type IDriver = {
  setRows: (rows: readonly IRow[]) => void;
  setSelectedId: (id: number) => void;
  rows: () => readonly IRow[];
};
let driver: IDriver | undefined;

function isDriver(value: unknown): value is IDriver {
  return (
    typeof value === 'object' &&
    value !== null &&
    typeof Reflect.get(value, 'setRows') === 'function'
  );
}

async function compileComponent(
  source: string,
  file: string,
): Promise<Component> {
  const result = compile(source, {
    generate: 'client',
    filename: file,
    fragments: 'tree',
    css: 'external',
  });
  const path = join(TMP_DIR, `${file}.mjs`);
  writeFileSync(path, result.js.code);
  const mod: unknown = await import(`file://${path}`);
  if (mod === null || typeof mod !== 'object' || !('default' in mod))
    throw new Error(`compiled ${file} produced no default export`);
  const component: unknown = mod.default;
  if (typeof component !== 'function')
    throw new Error(`compiled ${file} default export is not a component`);
  return component;
}

const PRESSABLE_SOURCE = `
<script>
  let { children } = $props();
</script>

<view p={{}}>{@render children()}</view>
`;

const ROW_SOURCE = `
<script>
  import Pressable from './Pressable.mjs';
  let { row, isSelected } = $props();
</script>

<view p={{ style: isSelected ? { backgroundColor: 'blue' } : undefined }}>
  <text p={{}}>{String(row.id)}</text><Pressable>
    <text p={{}}>{row.label}</text>
  </Pressable><Pressable>
    <text p={{}}>x</text>
  </Pressable>
</view>
`;

const LIST_SOURCE = `
<script>
  import BenchmarkRow from './BenchmarkRow.mjs';
  let { seed, register } = $props();
  let rows = $state(seed);
  let selectedId = $state(-1);
  register({
    setRows: next => { rows = next; },
    setSelectedId: next => { selectedId = next; },
    rows: () => rows,
  });
</script>

<view p={{ testID: 'list' }}>
  {#each rows as row (row.id)}<BenchmarkRow {row} isSelected={row.id === selectedId} />{/each}
</view>
`;

function drive(): IDriver {
  if (driver === undefined) throw new Error('list was never mounted');
  return driver;
}

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
    `ANCHOR-COST ${JSON.stringify({ adapter: 'svelte', op, ...readCommitProfile() })}`,
  );
}

beforeEach(() => {
  fabric.reset();
  driver = undefined;
  mkdirSync(TMP_DIR, { recursive: true });
  readCommitProfile();
});
afterEach(() => {
  unmount(ROOT_TAG);
  rmSync(TMP_DIR, { recursive: true, force: true });
});

describe('svelte anchor flattening cost', () => {
  it('reports the anchor census and per-operation flatten counts', async () => {
    await compileComponent(PRESSABLE_SOURCE, 'Pressable');
    await compileComponent(ROW_SOURCE, 'BenchmarkRow');
    const List = await compileComponent(LIST_SOURCE, 'List');

    mount(ROOT_TAG, List, {
      seed: makeRows(1, ROWS),
      register: (value: unknown): void => {
        if (!isDriver(value)) throw new Error('the list handed back no driver');
        driver = value;
      },
    });
    await flush();
    report('create');

    const census = censusLive(retainedRoot());
    dlog(
      `ANCHOR-CENSUS ${JSON.stringify({
        adapter: 'svelte',
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

    // The row shape has to be the canary's, or every column measures a different list
    expect(
      census.nonAnchors,
      'the benchmark row must expand to nine native views',
    ).toBe(
      ROWS * NATIVE_VIEWS_PER_ROW + VIEWS_ABOVE_ROWS + EACH_BLOCK_BLANK_TEXTS,
    );
    // The structural claim for Svelte: a component allocates no host node, only anchors
    // The renderer maps Svelte's comments to engine anchors, two per composed component
    // Pinned exactly, as a range would survive losing most of them
    expect(
      census.anchors,
      'svelte allocates render-tag anchors, not per-component host nodes',
    ).toBe(ROWS * ANCHORS_PER_ROW);
  });
});
