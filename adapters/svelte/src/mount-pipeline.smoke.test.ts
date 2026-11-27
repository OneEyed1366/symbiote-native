// The whole chain end to end: real `.svelte` source, compiled by the real `svelte/compiler`
// Mounted through this adapter's own `mount()`, asserted on what landed in a fake Fabric

// No loader is wired into vitest, so `compileComponent` writes a temp file and imports it

// No Negative group, as `mount` and `unmount` validate nothing of their own
// A malformed root component would throw from Svelte's own `mount()`, not from this adapter

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

// RN's own bootstrap sets `window` and `navigator` before any app code runs
// A bare Node sandbox has neither, and Svelte's `init_operations()` reads both at first mount
if (globalThis.window === undefined) {
  Object.assign(globalThis, { window: globalThis });
}
if (globalThis.navigator === undefined) {
  Object.assign(globalThis, { navigator: { product: 'ReactNative' } });
}

const ROOT_TAG = 91_001;
// Under `build/`, which is git-ignored and inside the package's own resolution chain
// Its own subfolder, as vitest runs files in parallel and a shared one lets an `afterEach` delete
// a `.mjs` another file just wrote
const TMP_DIR = join(__dirname, '../build/__smoke__/mount-pipeline');

const fabric = installRecordingFabric();
const live = createLiveTree(fabric);
const tick = (): Promise<void> =>
  new Promise(resolve => setTimeout(resolve, 0));

// Reads the last box-none surface in the creation log
// A remount of the same `rootTag` leaves two matches, and the first one is the stale surface
function currentAppRoot(): ReturnType<typeof live.appRoot> {
  const matches = fabric.findAll(
    node => node.props.pointerEvents === 'box-none',
  );
  const last = matches.at(-1);
  if (last === undefined) throw new Error('no app root was created');
  return last.handle;
}

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
): Promise<Component> {
  const result = compile(source, {
    generate: 'client',
    filename: `${name}.svelte`,
    fragments: 'tree',
    css: 'external',
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

describe('mount (real compiled output, real fake-Fabric)', () => {
  describe('Positive', () => {
    it('mounts a static text and commits it under the root view', async () => {
      // Compiled output reaches a committed native Fabric node, not just the renderer's own tree
      const Hello = await compileComponent(
        '<text p={{}}>hello</text>',
        'Hello',
      );

      mount(ROOT_TAG, Hello);
      await tick();
      await tick();

      const root = currentAppRoot();
      expect(live.serialize(root)).toContain('RCTText');
      expect(live.serialize(root)).toContain('RCTRawText "hello"');
    });

    it('reacts to a $state mutation (self-driven via $effect) and re-commits', async () => {
      // A `$effect` drives the second render, so it uses the same public `mount()` as app code
      // That proves reactivity survives past the initial paint
      const Counter = await compileComponent(
        `<script>
           let count = $state(0);
           $effect(() => { if (count < 1) count = count + 1; });
         </script>
         <text p={{}}>count {count}</text>`,
        'Counter',
      );

      mount(ROOT_TAG, Counter);
      await tick();
      await tick();
      await tick();
      expect(live.serialize(currentAppRoot())).toContain(
        'RCTRawText "count 1"',
      );
    });

    // The root wrapper from `root-element.ts` sits between the AppContainer and the app root
    // Without `flex: 1` a `flex: 1` app root has no parent height and the tree collapses to 0x0
    it('gives the root wrapper flex:1 so a flex:1 app root actually fills the screen', async () => {
      // Nothing throws on a missing `flex: 1`, so this pins the one prop that prevents it
      const Hello = await compileComponent(
        '<text p={{}}>hello</text>',
        'Hello',
      );

      mount(ROOT_TAG, Hello);
      await tick();
      await tick();

      // The engine hoists `flex` onto the top-level Fabric prop bag, not under `style`
      const wrapper = live.nodeOf(currentAppRoot()).children[0];
      expect(wrapper.payload.flex).toBe(1);
    });

    it('re-mounting the same rootTag tears down the previous app before mounting the new one', async () => {
      // Fast Refresh restarts a surface on the same `rootTag`, so `mount()` must tear down first
      // Otherwise the tree would carry both apps' nodes side by side
      const Hello = await compileComponent(
        '<text p={{}}>hello</text>',
        'HelloA',
      );
      mount(ROOT_TAG, Hello);
      await tick();
      await tick();
      expect(live.serialize(currentAppRoot())).toContain('RCTRawText "hello"');

      const Goodbye = await compileComponent(
        '<text p={{}}>goodbye</text>',
        'GoodbyeA',
      );
      mount(ROOT_TAG, Goodbye);
      await tick();
      await tick();

      const serialized = live.serialize(currentAppRoot());
      expect(serialized).toContain('RCTRawText "goodbye"');
      expect(serialized).not.toContain('hello');
    });

    it('wires global.RN$stopSurface so a real C++-side surface stop reaches unmount()', async () => {
      // `AppRegistryBinding::stopSurface` calls `RN$stopSurface`, which RN's own renderer installs
      // This adapter replaces that renderer, so stopping through the global must tear down too
      expect(typeof globalThis.RN$stopSurface).toBe('function');

      const Hello = await compileComponent(
        '<text p={{}}>hello</text>',
        'HelloB',
      );
      mount(ROOT_TAG, Hello);
      await tick();
      await tick();

      globalThis.RN$stopSurface?.(ROOT_TAG);
      await tick();

      const Goodbye = await compileComponent(
        '<text p={{}}>goodbye</text>',
        'GoodbyeB',
      );
      mount(ROOT_TAG, Goodbye);
      await tick();
      await tick();

      const serialized = live.serialize(currentAppRoot());
      expect(serialized).toContain('RCTRawText "goodbye"');
      expect(serialized).not.toContain('hello');
    });
  });
});
