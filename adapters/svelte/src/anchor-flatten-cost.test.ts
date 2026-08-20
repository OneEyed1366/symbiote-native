// Svelte's column of the five-adapter anchor census. See adapters/react/src/anchor-flatten-cost.
// test.tsx for what the shape measures and why; this file mirrors it so the numbers line up.
//
// Real `.svelte` source compiled at run time and dynamic-imported, the same way
// mount-pipeline.smoke.test.ts does it and for the same reason: no vite-plugin-svelte is wired
// into this repo's vitest config, and an each-block hand-written against the runtime would not be
// the thing under test. Svelte's each-block anchors are exactly what is being counted.
//
// One deliberate deviation from the other four columns: the row composes a LOCAL Pressable stub
// over the raw `symbiote-view` host tag instead of importing `@symbiote-native/svelte`'s. That
// package's components are themselves `.svelte` files, and with no svelte plugin in the vitest
// config Vite cannot parse them. The stub keeps what this file measures identical — one host view
// per Pressable, three composed components per row, nine host tags in total — and the adapter's
// real Pressable adds nothing to either count (it is one `symbiote-view` unless android_ripple is
// set, which the canary row does not set).

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { compile } from 'svelte/compiler';
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { Component } from 'svelte';
import {
  censusRetainedTree,
  dlog,
  isSymbioteNode,
  readCommitProfile,
  type ISymbioteNode,
} from '@symbiote-native/engine';
import { installFabric } from '@symbiote-native/test-utils';

import { mount, unmount } from './render';

// Same one-time RN-runtime stand-in every Svelte smoke needs: svelte's init_operations() reads
// both at first mount, and patchGlobals() deliberately does not set them.
if (globalThis.window === undefined) {
  Object.assign(globalThis, { window: globalThis });
}
if (globalThis.navigator === undefined) {
  Object.assign(globalThis, { navigator: { product: 'ReactNative' } });
}

const ROOT_TAG = 8805;
const ROWS = 1000;
const NATIVE_VIEWS_PER_ROW = 9;
const UPDATE_STRIDE = 10;
// Two composed Pressables at two anchors each. Measured — see the assertion at the bottom.
const ANCHORS_PER_ROW = 4;

// Its own subfolder: vitest runs test files in parallel and a shared temp dir lets one file's
// cleanup delete another's freshly written module (mount-pipeline.smoke.test.ts's note).
const TMP_DIR = join(__dirname, '../build/__smoke__/anchor-flatten-cost');

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

<symbiote-view p={{}}>{@render children()}</symbiote-view>
`;

const ROW_SOURCE = `
<script>
  import Pressable from './Pressable.mjs';
  let { row, isSelected } = $props();
</script>

<symbiote-view p={{ style: isSelected ? { backgroundColor: 'blue' } : undefined }}>
  <symbiote-text p={{}}>{String(row.id)}</symbiote-text><Pressable>
    <symbiote-text p={{}}>{row.label}</symbiote-text>
  </Pressable><Pressable>
    <symbiote-text p={{}}>x</symbiote-text>
  </Pressable>
</symbiote-view>
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

<symbiote-view p={{ testID: 'list' }}>
  {#each rows as row (row.id)}<BenchmarkRow {row} isSelected={row.id === selectedId} />{/each}
</symbiote-view>
`;

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

    const census = censusRetainedTree([retainedRoot()]);
    dlog(
      `ANCHOR-CENSUS ${JSON.stringify({
        adapter: 'svelte',
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
    // Two above the rows rather than one: the list node, plus the root shim element mount()
    // builds for svelte to attach to (createRootShimElement), which the other adapters have no
    // equivalent of.
    expect(
      census.renderable,
      'the benchmark row must expand to nine native views',
    ).toBe(ROWS * NATIVE_VIEWS_PER_ROW + 2);
    // why: THE structural claim for Svelte, and the number that makes it the heaviest anchor user
    // of the five — heavier than Angular. A svelte component allocates no host node, but the DOM
    // shim maps svelte's own comment / empty-text anchors onto real engine anchors: TWO per
    // composed component with a render tag (measured — replacing one of the row's two Pressables
    // with a bare host tag takes the total from 4002 to 2002), plus two for the each-block itself.
    // Pinned exactly rather than `> 0`: the whole point of the file is the count, and a range
    // assertion would survive losing most of them.
    expect(
      census.anchors,
      'svelte allocates each-block and render-tag anchors, not per-component host nodes',
    ).toBe(ROWS * ANCHORS_PER_ROW + 2);
  });
});
