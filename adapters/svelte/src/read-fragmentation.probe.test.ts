// Svelte's column of the batch-fragmentation and opcode census. See
// `adapters/solid/src/read-fragmentation.probe.test.tsx` for the shape and why it exists.
//
// Svelte is the last of the five and the one that matters most: the device regression under
// investigation was measured on `examples/svelte`, and a source census says this adapter never
// navigates the host tree — so it should be the whole-batch case. That prediction is worth checking
// rather than trusting, which is exactly what F-19 cost: the quadratic was ruled out on Solid by
// source AND by measurement, and was sitting in Vue.
//
// Real `.svelte` source compiled at run time and dynamic-imported, the same way
// `anchor-flatten-cost.test.ts` does it and for the same reason: no vite-plugin-svelte is wired into
// this repo's vitest config, and an each-block hand-written against the runtime would not be the
// thing under test. The row composes a LOCAL Pressable stub over the raw `view` host tag for the
// reason that file gives — the adapter's own Pressable is itself a `.svelte` file.

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { compile } from 'svelte/compiler';
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import type { Component } from 'svelte';
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

import { mount, unmount } from './render';

// The same one-time RN-runtime stand-in every Svelte smoke needs: svelte's `init_operations()` reads
// both at first mount, and `patchGlobals()` deliberately does not set them.
if (globalThis.window === undefined) {
  Object.assign(globalThis, { window: globalThis });
}
if (globalThis.navigator === undefined) {
  Object.assign(globalThis, { navigator: { product: 'ReactNative' } });
}

const ROOT_TAG = 8819;
const ROWS = 1_000;
// Its own subfolder: vitest runs test files in parallel and a shared temp dir lets one file's
// cleanup delete another's freshly written module.
const TMP_DIR = join(__dirname, '../build/__smoke__/read-fragmentation');

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

// One pool handed out as slices, so an each-block keyed by id PATCHES rather than rebuilding. The
// Solid probe measured a rebuild as an append until this was fixed there (F-21).
const ROW_POOL = makeRows(1, ROWS * 2);

type IDriver = {
  setRows: (rows: readonly IRow[]) => void;
  setSelectedId: (id: number) => void;
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

// ── the counter ────────────────────────────────────────────────────────────────────────────────

let drains = 0;
let opsSeen = 0;
let navigationReads = 0;

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
      base.applyOps(batch);
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
  mkdirSync(TMP_DIR, { recursive: true });
});
afterEach(() => {
  unmount(ROOT_TAG);
  rmSync(TMP_DIR, { recursive: true, force: true });
});

describe('how far svelte fragments the batch, and what it emits', () => {
  it('counts drains and every opcode on a 1 000-row list', async () => {
    await compileComponent(PRESSABLE_SOURCE, 'Pressable');
    await compileComponent(ROW_SOURCE, 'BenchmarkRow');
    const List = await compileComponent(LIST_SOURCE, 'List');

    countCrossings();
    tally();

    const steps: (readonly [string, ITally])[] = [];
    mount(ROOT_TAG, List, {
      seed: ROW_POOL.slice(0, ROWS),
      register: (value: unknown): void => {
        if (!isDriver(value)) throw new Error('the list handed back no driver');
        driver = value;
      },
    });
    await flush();
    steps.push(['create 1000', tally()]);

    drive().setSelectedId(500);
    await flush();
    steps.push(['select one row', tally()]);

    drive().setRows(ROW_POOL.slice(0, ROWS * 2));
    await flush();
    steps.push(['append 1000', tally()]);

    drive().setRows(ROW_POOL.slice(0, ROWS));
    await flush();
    steps.push(['remove 1000', tally()]);

    writeFileSync(
      fileURLToPath(
        new URL(
          '../../../.docs/read-fragmentation-svelte.txt',
          import.meta.url,
        ),
      ),
      `${[
        'svelte — one drain per commit is the ideal',
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
      ].join('\n')}\n`,
    );

    expect(steps).toHaveLength(4);
    for (const [, measured] of steps)
      expect(measured.drains).toBeGreaterThan(0);
  });
});
