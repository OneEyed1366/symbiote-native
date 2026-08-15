// Does the dom-shim RELEASE its nodes, or does it retain them after they leave the tree?
//
// This was the last hypothesis standing for the ~20 MB device-RSS gap between examples/svelte
// and examples/vue-sfc on an equivalent screen, after the cheap ones were measured and killed
// (svelte-adapter-dom-shim §11b + native-node-parity.test.ts). A constant overhead cannot
// produce a multi-megabyte gap; a leak can, and it grows with interaction — which fits a number
// read after scrolling a list around rather than at cold start.
//
// ANSWER, locked in below: not a leak. Retention after gc is a small CONSTANT that does not move
// when the list gets 5x bigger, so it is the tail of the last commit's child set, not per-node
// accumulation.
//
// THE ASSERTION IS DELIBERATELY ABOUT SCALING, NOT ABOUT ZERO. `WeakRef` + `gc()` is not a
// precise instrument — V8 makes no promise that a given object is reclaimed by a given cycle,
// so "0 survivors" is a flaky assertion that would fail for reasons having nothing to do with a
// leak. "survivors do not grow with input size" is the property a leak actually violates, and it
// is robust to that nondeterminism. Do not "tighten" this to toBe(0).

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { compile } from 'svelte/compiler';
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { setFlagsFromString } from 'node:v8';
import { runInNewContext } from 'node:vm';
import type { Component } from 'svelte';
import { installFabric } from '@symbiote-native/test-utils';
import { mount, unmount } from './render';

if (globalThis.window === undefined) Object.assign(globalThis, { window: globalThis });
if (globalThis.navigator === undefined) {
  Object.assign(globalThis, { navigator: { product: 'ReactNative' } });
}

const SMALL = 8;
const LARGE = 40;
const TMP_DIR = join(__dirname, '../build/__release__');

const fabric = installFabric();
const tick = (): Promise<void> => new Promise(resolve => setTimeout(resolve, 0));
const mountedRoots: number[] = [];

beforeEach(() => {
  fabric.reset();
  mkdirSync(TMP_DIR, { recursive: true });
});

afterEach(() => {
  for (const root of mountedRoots.splice(0)) unmount(root);
  rmSync(TMP_DIR, { recursive: true, force: true });
});

async function compileComponent(source: string, name: string): Promise<Component> {
  const result = compile(source, {
    generate: 'client',
    filename: `${name}.svelte`,
    fragments: 'tree',
    css: 'external',
  });
  const file = join(TMP_DIR, `${name}.mjs`);
  writeFileSync(file, result.js.code);
  const mod: unknown = await import(`file://${file}`);
  if (mod === null || typeof mod !== 'object' || !('default' in mod)) {
    throw new Error(`compiled ${name}.svelte produced no default export`);
  }
  return mod.default as Component;
}

// A collector this test can always reach, WITHOUT the runner having to pass `--expose-gc`.
//
// This used to assert `typeof globalThis.gc === 'function'` and fail otherwise, which made a
// bare `vitest run` red for everyone: the root `test` script sets no NODE_OPTIONS, so the flag
// was only ever present if someone remembered it. Three separate sessions tripped over the same
// red line and each concluded "environmental, not mine" — a test that is red by default teaches
// people to ignore it. `setFlagsFromString` + evaluating `gc` in a fresh context is Node's own
// supported way to obtain the collector at runtime, so the test now carries its own requirement
// instead of pushing it onto every caller.
function resolveCollector(): () => void {
  if (typeof globalThis.gc === 'function') return globalThis.gc;
  setFlagsFromString('--expose_gc');
  const collect: unknown = runInNewContext('gc');
  if (typeof collect !== 'function') {
    throw new Error('no collector available: this test cannot measure retention without gc()');
  }
  return collect;
}

const collect = resolveCollector();

// A few cycles with a turn of the event loop between them: one collect() is not guaranteed to
// reclaim an object whose only remaining edges were dropped in the same tick.
async function collectGarbage(): Promise<void> {
  for (let i = 0; i < 4; i += 1) {
    collect();
    await tick();
  }
}

// Drives its own list shrink through $effect, so this exercises the same public mount() contract
// app code uses rather than reaching into svelte's instance internals. Keyed {#each} so removal
// is a real per-item teardown, not a positional re-use.
function shrinkingList(size: number): string {
  return `<script>
  let rows = $state(Array.from({length: ${size}}, (_, i) => i));
  $effect(() => { if (rows.length > 0) rows = []; });
</script>
<symbiote-view p={{}}>{#each rows as row (row)}<symbiote-view p={{}}><symbiote-text p={{}}>row {row}</symbiote-text></symbiote-view>{/each}</symbiote-view>`;
}

// Renders `size` rows, empties the list, drops every strong reference, and reports how many of
// the removed nodes are still reachable.
async function survivorsAfterShrink(size: number, rootTag: number): Promise<number> {
  const List = await compileComponent(shrinkingList(size), `ShrinkingList${String(size)}`);
  mount(rootTag, List);
  mountedRoots.push(rootTag);
  await tick();
  await tick();

  // `instanceHandle` is the shim node the engine was driven from, so this tracks the shim layer
  // itself, not merely the fake Fabric's own bookkeeping.
  const handles = fabric.created
    .filter(node => node.viewName === 'RCTRawText')
    .map(node => node.instanceHandle)
    .filter((handle): handle is object => typeof handle === 'object' && handle !== null)
    .map(handle => new WeakRef(handle));

  expect(handles.length, `the ${String(size)}-row list actually rendered`).toBeGreaterThanOrEqual(
    size,
  );

  fabric.reset();
  await tick();
  await collectGarbage();

  return handles.filter(ref => ref.deref() !== undefined).length;
}

describe('shim node release', () => {
  it('retains a constant, not a per-node accumulation, after nodes leave the tree', async () => {
    const smallSurvivors = await survivorsAfterShrink(SMALL, 93_001);
    const largeSurvivors = await survivorsAfterShrink(LARGE, 93_002);

    // The leak signature would be survivors tracking list size. 5x the rows must not mean more
    // retained nodes.
    expect(
      largeSurvivors,
      `survivors at ${String(LARGE)} rows vs ${String(SMALL)}`,
    ).toBeLessThanOrEqual(smallSurvivors);
    // And the bulk must genuinely go: a constant that happens to equal most of a small list
    // would pass the check above while still being a leak at scale.
    expect(largeSurvivors, 'most removed nodes were collected').toBeLessThan(LARGE / 4);
  });
});
