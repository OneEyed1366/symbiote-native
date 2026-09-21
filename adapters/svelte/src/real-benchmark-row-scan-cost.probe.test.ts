// Closes an honest gap in F-83's verification: `each-append-scan-cost.probe.test.ts` used a
// simplified `<view><text>` stand-in row, not the real `examples/svelte/components/
// BenchmarkRow.svelte` (10 native views/row: two Pressables with their own children snippets, an
// unconditional TextInput). A component with a children snippet is exactly the shape CLAUDE.md's
// own anchor census (`svelte-adapter-dom-shim` §33) flags as anchor-bearing — so this file exists
// to rule out (or confirm) that BenchmarkRow's extra internal structure pushes the each-block's
// ref further from the end of the LIST's own `children` array than `TAIL_SCAN_WINDOW` (8) covers,
// which the simplified stand-in structurally cannot exercise (its row is a single flat element,
// BenchmarkRow is a whole component instance with its own subtree). Real source, real compiler,
// no mirror.
import { afterEach, describe, expect, it } from 'vitest';
import { compile } from 'svelte/compiler';
import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import type { Component } from 'svelte';
import { installRecordingFabric } from '@symbiote-native/test-utils';
import './register';
import { mount, unmount } from './render';

if (globalThis.window === undefined)
  Object.assign(globalThis, { window: globalThis });
if (globalThis.navigator === undefined)
  Object.assign(globalThis, { navigator: { product: 'ReactNative' } });

installRecordingFabric();

const ROOT_TAG = 91_888;
const TMP_DIR = join(__dirname, '../build/__smoke__/real-row-scan-cost');
const ROW_SOURCE_PATH = resolve(
  __dirname,
  '../../../examples/svelte/components/BenchmarkRow.svelte',
);

const tick = (): Promise<void> =>
  new Promise(resolve => setTimeout(resolve, 0));
const settle = async (): Promise<void> => {
  await tick();
  await tick();
  await tick();
};

afterEach(() => {
  unmount(ROOT_TAG);
  rmSync(TMP_DIR, { recursive: true, force: true });
});

function buildRows(
  start: number,
  count: number,
): { id: number; label: string }[] {
  return Array.from({ length: count }, (_unused, index) => ({
    id: start + index,
    label: `row ${String(start + index)}`,
  }));
}

async function compileFile(source: string, name: string): Promise<Component> {
  mkdirSync(TMP_DIR, { recursive: true });
  const file = join(TMP_DIR, `${name}.mjs`);
  writeFileSync(
    file,
    compile(source, {
      generate: 'client',
      filename: `${name}.svelte`,
      fragments: 'tree',
      css: 'external',
    }).js.code,
  );
  const { default: exported } = (await import(`file://${file}`)) as {
    default: Component;
  };
  return exported;
}

describe('real BenchmarkRow.svelte: shim-level scan cost under the actual production row shape', () => {
  it('appends 200 real rows onto 1000 standing without falling back to a full scan', async () => {
    const rowSource = readFileSync(ROW_SOURCE_PATH, 'utf8');
    const RowOut = join(TMP_DIR, 'BenchmarkRow.mjs');
    mkdirSync(TMP_DIR, { recursive: true });
    writeFileSync(
      RowOut,
      compile(rowSource, {
        generate: 'client',
        filename: 'BenchmarkRow.svelte',
        fragments: 'tree',
        css: 'external',
      }).js.code,
    );

    const APP_SOURCE = [
      '<script>',
      `  import BenchmarkRow from '${RowOut}';`,
      '  let { rows: initialRows } = $props();',
      '  let rows = $state(initialRows);',
      '  globalThis.__appendRows = (more) => { rows = rows.concat(more); };',
      '  const noop = () => {};',
      '</script>',
      '',
      '{#each rows as row (row.id)}',
      '  <BenchmarkRow {row} isSelected={false} onSelect={noop} onRemove={noop} />',
      '{/each}',
    ].join('\n');
    const App = await compileFile(APP_SOURCE, 'App');

    const STANDING = 1_000;
    const APPENDED = 200;

    mount(ROOT_TAG, App, { rows: buildRows(0, STANDING) });
    await settle();

    const { takeShimScanStats } = await import('./dom-shim/shim-node');
    const mountStats = takeShimScanStats();

    const appendRows = (
      globalThis as { __appendRows?: (more: unknown) => void }
    ).__appendRows;
    expect(typeof appendRows, 'the probe could drive an append').toBe(
      'function',
    );
    appendRows?.(buildRows(STANDING, APPENDED));
    await settle();

    const appendStats = takeShimScanStats();
    console.log(
      `DEBUG real BenchmarkRow: mount(calls=${String(mountStats.calls)} scanned=${String(mountStats.scanned)}) ` +
        `append(calls=${String(appendStats.calls)} scanned=${String(appendStats.scanned)})`,
    );

    // THE FINDING this file exists to establish: does a real, fully-featured row (Pressables with
    // children snippets, an unconditional TextInput) push the each-block's ref further from the
    // list's own array end than the simplified stand-in did? A nonzero reading here means yes —
    // `TAIL_SCAN_WINDOW` needs raising, not that the mechanism itself is wrong.
    expect(mountStats.calls).toBe(0);
    expect(appendStats.calls).toBe(0);
  });
});
