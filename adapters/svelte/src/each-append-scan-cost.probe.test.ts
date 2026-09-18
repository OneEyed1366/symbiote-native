// F-82 (`.docs/tree-inefficiency-findings.md`) ruled the native commit+layout pipeline out as
// the cause of the still-open Append regression (device Create +40 ms, Append +147, Replace +54
// against the 2026-09-01 baseline, tree and WRITES byte-identical — F-44's "still open" section):
// at the real benchmark scale, commit+layout together cost ~15 ms against a 107-147 ms gap. That
// redirected the search to the one layer no itest can see — Svelte's own compiled `{#each}`
// reconciler, running before a single op reaches the engine.
//
// F-83 found a real one: `ShimNode.insertOne` (dom-shim/shim-node.ts) resolved an `insertBefore`
// ref with `this.children.indexOf(ref)`, a LINEAR scan of the shim's own child array — the exact
// shape F-80 already exonerated for the engine's `OP_INSERT_BEFORE` (`std::find` over `siblings`,
// too small to matter). Svelte's own reconciler was doing the identical scan a second time, one
// layer up: BenchmarkScreen's real `{#each rows as row (row.id)}` is a KEYED block, and a new
// tail item — whether appended OR built for the first time — is inserted via `newRow.before(ref)`
// — `parent.insertBefore(newRow, ref)` — where `ref` is the block's own closing boundary anchor,
// sitting a small constant distance from the true end of `children` (one extra trailing anchor
// from the component's own root fragment, in the measured shape). Confirmed on real compiled
// output: appending 1 000 rows onto 1 000 standing cost 1 502 500 `indexOf` comparisons — one
// O(n) scan per row, O(n²) aggregate — and the per-call average tracked `standing` almost exactly
// at two widths apart by 20x (302.5 @ standing=200, 4 102.5 @ standing=4 000). The INITIAL build
// pays the identical mechanism (every row is two MORE ref-based inserts, not push), so this is not
// only an Append cost — it is a candidate for F-44's Create and Replace regressions too. Fixed by
// `indexNearEnd`: a bounded backward scan finds a ref that close to the end in O(1), falling back
// to the full scan (still correct, unchanged) only when it isn't. This file is now the regression
// guard for that fix, for both mount and append, not just the probe that found it.
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
