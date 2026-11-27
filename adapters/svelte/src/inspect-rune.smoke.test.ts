// Does `$inspect` fire through this adapter's mount and commit pipeline?
// The harness is `mount-pipeline.smoke.test.ts`'s, see its header

// It does not in the real build, and that is a `svelte/compiler` fact, not a mount defect
// Every `$inspect(...)` is compiled away unless `dev: true` is passed to `compile()`
// `metro-svelte-transformer.cjs` never sets `dev`, so a Metro build drops it with no warning

// The first case compiles without `dev`, as Metro does, and documents the no-op
// The second passes `dev: true` and shows the mount pipeline itself handles `$inspect`

// Not fixed here: gating `dev` is a build-mode decision, not a one-line config change
// Svelte's dev codegen validates ownership and mutation in every compiled component
// That could newly throw on patterns the renderer relies on, so it needs a full suite pass first
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { compile } from 'svelte/compiler';
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { Component } from 'svelte';
import {
  createLiveTree,
  installRecordingFabric,
} from '@symbiote-native/test-utils';
import { mount, unmount } from './render';

if (globalThis.window === undefined) {
  Object.assign(globalThis, { window: globalThis });
}
if (globalThis.navigator === undefined) {
  Object.assign(globalThis, { navigator: { product: 'ReactNative' } });
}

const ROOT_TAG = 91_002;
// Own subfolder, as vitest runs files in parallel and a shared one lets an `afterEach`
// delete a `.mjs` another file just wrote
const TMP_DIR = join(__dirname, '../build/__smoke__/inspect-rune');

const fabric = installRecordingFabric();
const live = createLiveTree(fabric);
const tick = (): Promise<void> =>
  new Promise(resolve => setTimeout(resolve, 0));

beforeEach(() => {
  fabric.reset();
  mkdirSync(TMP_DIR, { recursive: true });
});

afterEach(() => {
  unmount(ROOT_TAG);
  rmSync(TMP_DIR, { recursive: true, force: true });
});

let compileCounter = 0;

async function compileComponent(
  source: string,
  name: string,
  dev?: boolean,
): Promise<Component> {
  const result = compile(source, {
    generate: 'client',
    filename: `${name}.svelte`,
    fragments: 'tree',
    css: 'external',
    dev,
  });
  compileCounter += 1;
  const file = join(TMP_DIR, `${name}-${String(compileCounter)}.mjs`);
  writeFileSync(file, result.js.code);
  const mod: unknown = await import(`file://${file}`);
  if (mod === null || typeof mod !== 'object' || !('default' in mod)) {
    throw new Error(`compiled ${name}.svelte produced no default export`);
  }
  return mod.default as Component;
}

// No Negative group, as neither compile option throws
// The difference is silent in the compiled output, so only a real run can catch it
describe('$inspect under the svelte adapter mount pipeline', () => {
  describe('characterization — svelte/compiler decides this, not this adapter', () => {
    it("does NOT fire under this adapter's real (non-dev) compile options — documents the known gap", async () => {
      // This is the real Metro compile mode, so a future option change is caught here
      // QUESTION: gating `dev` is a build-mode decision (see the file header), left as a gap
      // The component pushes every `$inspect` callback onto a global array the test reads back
      (globalThis as { __inspectLog?: number[] }).__inspectLog = [];
      const Counter = await compileComponent(
        `<script>
           let count = $state(0);
           $inspect(count).with((type, value) => { globalThis.__inspectLog.push(value); });
           $effect(() => { if (count < 2) count = count + 1; });
         </script>
         <text p={{}}>count {count}</text>`,
        'InspectCounter',
      );

      mount(ROOT_TAG, Counter);
      await tick();
      await tick();
      await tick();
      await tick();

      const log =
        (globalThis as { __inspectLog?: number[] }).__inspectLog ?? [];
      // The component still re-renders to 2 and only the probe is gone
      // So the compiler stripped the call site, and the mount pipeline kept reactivity
      expect(log).toEqual([]);
      const texts = live
        .findAllLive(live.appRoot(), node => node.viewName === 'RCTRawText')
        .map(node => String(node.payload.text));
      expect(texts).toContain('count 2');
    });
  });

  describe('Positive', () => {
    it('isolation probe: with dev:true passed to svelte/compiler, $inspect DOES fire through this same mount pipeline', async () => {
      // Confirms the case above is a compile-option fact, not a defect in the mount and commit path
      (globalThis as { __inspectLog?: number[] }).__inspectLog = [];
      const Counter = await compileComponent(
        `<script>
           let count = $state(0);
           $inspect(count).with((type, value) => { globalThis.__inspectLog.push(value); });
           $effect(() => { if (count < 2) count = count + 1; });
         </script>
         <text p={{}}>count {count}</text>`,
        'InspectCounterDev',
        true,
      );

      mount(ROOT_TAG, Counter);
      await tick();
      await tick();
      await tick();
      await tick();

      const log =
        (globalThis as { __inspectLog?: number[] }).__inspectLog ?? [];
      expect(log).toEqual([0, 1, 2]);
    });
  });
});
