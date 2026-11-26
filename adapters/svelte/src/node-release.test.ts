// Does the renderer release its nodes, or retain them after they leave the tree?
// A leak grows with interaction, which fits a device-RSS gap read after scrolling a list around

// Retention after gc is a small constant that does not move when the list gets 5x bigger
// So it is the tail of the last commit's child set, not per-node accumulation

// The assertion is about scaling, not about zero: V8 promises no reclaim in a given cycle
// "0 survivors" would be flaky, while "survivors do not grow with input size" is what a leak breaks

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { compile } from 'svelte/compiler';
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { setFlagsFromString } from 'node:v8';
import { runInNewContext } from 'node:vm';
import type { Component } from 'svelte';
import { installRecordingFabric } from '@symbiote-native/test-utils';
import { mount, unmount } from './render';

if (globalThis.window === undefined)
  Object.assign(globalThis, { window: globalThis });
if (globalThis.navigator === undefined) {
  Object.assign(globalThis, { navigator: { product: 'ReactNative' } });
}

const SMALL = 8;
const LARGE = 40;
const TMP_DIR = join(__dirname, '../build/__release__');

const fabric = installRecordingFabric();
const tick = (): Promise<void> =>
  new Promise(resolve => setTimeout(resolve, 0));
const mountedRoots: number[] = [];

beforeEach(() => {
  fabric.reset();
  mkdirSync(TMP_DIR, { recursive: true });
});

afterEach(() => {
  for (const root of mountedRoots.splice(0)) unmount(root);
  rmSync(TMP_DIR, { recursive: true, force: true });
});

async function compileComponent(
  source: string,
  name: string,
): Promise<Component> {
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

// A collector the test reaches without the runner passing `--expose-gc`
// `setFlagsFromString` and a `gc` evaluated in a fresh context is Node's supported way to get it
function resolveCollector(): () => void {
  if (typeof globalThis.gc === 'function') return globalThis.gc;
  setFlagsFromString('--expose_gc');
  const collect: unknown = runInNewContext('gc');
  if (typeof collect !== 'function') {
    throw new Error(
      'no collector available: this test cannot measure retention without gc()',
    );
  }
  return collect;
}

const collect = resolveCollector();

// A few cycles with a turn of the event loop between them: one collect() is not guaranteed to
// reclaim an object whose only remaining edges were dropped in the same tick.
async function collectGarbage(cycles = 4): Promise<void> {
  if (cycles === 0) return;
  collect();
  await tick();
  await collectGarbage(cycles - 1);
}

// Shrinks its own list through `$effect`, so it uses the same public `mount()` as app code
// The `{#each}` is keyed, so removal is a real per-item teardown and not a positional re-use
function shrinkingList(size: number): string {
  return `<script>
  let rows = $state(Array.from({length: ${size}}, (_, i) => i));
  $effect(() => { if (rows.length > 0) rows = []; });
</script>
<view p={{}}>{#each rows as row (row)}<view p={{}}><text p={{}}>row {row}</text></view>{/each}</view>`;
}

// Renders `size` rows, empties the list, drops every strong reference, and reports how many of
// the removed nodes are still reachable.
async function survivorsAfterShrink(
  size: number,
  rootTag: number,
): Promise<number> {
  const List = await compileComponent(
    shrinkingList(size),
    `ShrinkingList${String(size)}`,
  );
  mount(rootTag, List);
  mountedRoots.push(rootTag);
  await tick();
  await tick();

  // `instanceHandle` is the node the engine was driven from, so this tracks the renderer's nodes
  // It is sampled on the row's `RCTText`, the innermost node with a handle, as raw text has none
  const handles = fabric
    .findAll(node => node.viewName === 'RCTText')
    .map(node => node.instanceHandle)
    .filter(
      (handle): handle is object =>
        typeof handle === 'object' && handle !== null,
    )
    .map(handle => new WeakRef(handle));

  expect(
    handles.length,
    `the ${String(size)}-row list actually rendered`,
  ).toBeGreaterThanOrEqual(size);

  fabric.reset();
  await tick();
  await collectGarbage();

  return handles.filter(ref => ref.deref() !== undefined).length;
}

// Positive-only: this is a memory-retention measurement, not a function with an input it can
// reject — there is no throwing contract to pin a Negative scenario against.
describe('renderer node release', () => {
  // A strong reference to every removed node, such as a listener map or an uncleared edge
  // would grow without bound with list churn, which is the device-RSS symptom ruled out here
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
    expect(largeSurvivors, 'most removed nodes were collected').toBeLessThan(
      LARGE / 4,
    );
  });
});
