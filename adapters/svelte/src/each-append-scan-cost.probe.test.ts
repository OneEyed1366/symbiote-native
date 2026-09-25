// `ShimNode.insertOne` (dom-shim/shim-node.ts) resolved an `insertBefore` ref via
// `this.children.indexOf(ref)` — a LINEAR scan, O(n) per insert and O(n²) aggregate on Svelte's
// keyed `{#each}` reconciler. Fixed by `indexNearEnd`, a bounded backward scan; guarded here.
import { afterEach, describe, expect, it } from 'vitest';
import { compile } from 'svelte/compiler';
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { Component } from 'svelte';
import { installRecordingFabric } from '@symbiote-native/test-utils';
import './register';
import { mount, unmount } from './render';

if (globalThis.window === undefined)
  Object.assign(globalThis, { window: globalThis });
if (globalThis.navigator === undefined)
  Object.assign(globalThis, { navigator: { product: 'ReactNative' } });

installRecordingFabric();

const TMP_DIR = join(__dirname, '../build/__smoke__/each-append-scan-cost');

const tick = (): Promise<void> =>
  new Promise(resolve => setTimeout(resolve, 0));
const settle = async (): Promise<void> => {
  await tick();
  await tick();
  await tick();
};

// Byte-identical shape to BenchmarkScreen.svelte's real `{#each rows as row (row.id)}
// <BenchmarkRow .../>` — a keyed block over a growing array, replacing only the row body with a
// bare tag since this file prices the RECONCILER's own insertion mechanics, not row rendering.
const APP_SOURCE = [
  '<script>',
  '  let { rows: initialRows } = $props();',
  '  let rows = $state(initialRows);',
  '  globalThis.__appendRows = (more) => { rows = rows.concat(more); };',
  '</script>',
  '',
  '{#each rows as row (row.id)}',
  '  <view p={{ testID: `row-${row.id}` }}>',
  '    <text p={{}}>{String(row.id)}</text>',
  '  </view>',
  '{/each}',
].join('\n');

afterEach(() => {
  rmSync(TMP_DIR, { recursive: true, force: true });
});

function buildRows(start: number, count: number): { id: number }[] {
  return Array.from({ length: count }, (_unused, index) => ({
    id: start + index,
  }));
}

async function compileApp(rootTag: number): Promise<Component> {
  mkdirSync(TMP_DIR, { recursive: true });
  const file = join(TMP_DIR, `App-${String(rootTag)}.mjs`);
  writeFileSync(
    file,
    compile(APP_SOURCE, {
      generate: 'client',
      filename: 'App.svelte',
      fragments: 'tree',
      css: 'external',
    }).js.code,
  );
  const { default: App } = (await import(`file://${file}`)) as {
    default: Component;
  };
  return App;
}

// Two widths, APPENDED held fixed at 200 (same discipline as F-80/F-81's
// `append-cost-vs-standing.itest.ts`): if the scan is the O(standing) mechanism this file's
// header predicts, `avgPerCall` at STANDING=4000 must sit far above STANDING=200's, not merely
// scale with the fixed 200-row append.
const WIDTHS = [200, 4_000];

describe('Svelte keyed {#each} append: shim-level indexOf scan cost', () => {
  for (const standing of WIDTHS) {
    const rootTag = 91_777 + standing;
    const appended = 200;

    it(`appends ${String(appended)} rows onto ${String(standing)} standing`, async () => {
      const { takeShimScanStats } = await import('./dom-shim/shim-node');
      const App = await compileApp(rootTag);
      mount(rootTag, App, { rows: buildRows(0, standing) });
      await settle();

      // The INITIAL build pays the identical mechanism: every row's `<view><text>` pair is two
      // MORE ref-based inserts against the same trailing each-block anchor (confirmed by a
      // throwaway counter on `insertOne` during development — standing=200 -> 402 ref-inserts,
      // standing=4000 -> 8002, i.e. 2*standing+2, none of them `ref === null`). Pre-fix this was
      // the SAME O(n^2) shape as the append case, just building the whole list from empty rather
      // than growing it — a real candidate for F-44's still-open Create +40 ms and Replace +54 ms
      // regressions, not only Append. Asserting it here, not just discarding it, is what proves
      // the fix's reach.
      const mountStats = takeShimScanStats();
      expect(
        mountStats.calls,
        'mount itself never falls back to the full scan',
      ).toBe(0);
      expect(mountStats.scanned).toBe(0);

      const appendRows = (
        globalThis as { __appendRows?: (more: unknown) => void }
      ).__appendRows;
      expect(typeof appendRows, 'the probe could drive an append').toBe(
        'function',
      );
      appendRows?.(buildRows(standing, appended));
      await settle();

      const { calls, scanned } = takeShimScanStats();
      const avgScanned = calls === 0 ? 0 : scanned / calls;

      console.log(
        `DEBUG shim indexOf scan: standing=${String(standing)} appended=${String(appended)} ` +
          `calls=${String(calls)} scanned=${String(scanned)} avgPerCall=${avgScanned.toFixed(1)}`,
      );

      unmount(rootTag);

      // REGRESSION GUARD for the fix below. Before `indexNearEnd` existed, this read
      // `calls=appended` and `avgScanned` tracking `standing` almost exactly — confirmed at
      // standing=200 (avgPerCall 302.5) and standing=4 000 (avgPerCall 4 102.5), a ~13.6x rise
      // for a 20x width increase, i.e. the O(n)-per-insert signature. `indexNearEnd`'s bounded
      // tail scan now resolves every one of these refs without ever reaching the full scan, at
      // ANY standing width — a zero here means the fast path held; a nonzero one means some ref
      // in this run sat further from the end than `TAIL_SCAN_WINDOW` covers, which is real
      // fallback work this test would then want to know about, not silently swallow.
      expect(calls).toBe(0);
      expect(scanned).toBe(0);
    });
  }
});
