// The first REAL execution of the Svelte DOM-shim pipeline (patchGlobals -> shim tree ->
// engine -> fake Fabric), not just a typecheck. Every other file in this package has only ever
// been proven by `tsc --build`; this compiles REAL `.svelte` source through the real
// `svelte/compiler` (same `fragments: 'tree'` / `css: 'external'` options as svelte.config.js),
// mounts the output through this adapter's own `mount()`, and asserts on what actually landed
// in a faked `nativeFabricUIManager`. No `@sveltejs/vite-plugin-svelte` is wired into this
// repo's vitest config yet, so compiled output is written to a real temp file and dynamic-
// imported rather than transformed by a loader — see `compileComponent` below.

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { compile } from 'svelte/compiler';
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { Component } from 'svelte';
import { installFabric } from '@symbiote-native/test-utils';
import { mount, unmount } from './render';

// RN's own bootstrap (setUpGlobals.js / setUpNavigator.js, verified against
// .vendors/react-native) sets these before any app code runs — `global.window = global` and
// `global.navigator = {product: 'ReactNative'}`. Neither is patched by patchGlobals() itself
// (patch-globals.ts's header comment, verified true above), so a bare vitest/Node sandbox
// needs this same one-time setup to faithfully stand in for a real RN JS runtime; svelte's
// own `init_operations()` reads both at first mount.
if (globalThis.window === undefined) {
  Object.assign(globalThis, { window: globalThis });
}
if (globalThis.navigator === undefined) {
  Object.assign(globalThis, { navigator: { product: 'ReactNative' } });
}

const ROOT_TAG = 91_001;
// Under `build/`: already git-ignored repo-wide, and inside adapters/svelte's own
// node_modules resolution chain so the compiled output's `import 'svelte/internal/client'`
// resolves without extra wiring.
const TMP_DIR = join(__dirname, '../build/__smoke__');

const fabric = installFabric();
const tick = (): Promise<void> => new Promise(resolve => setTimeout(resolve, 0));

beforeEach(() => {
  fabric.reset();
  mkdirSync(TMP_DIR, { recursive: true });
});

afterEach(() => {
  unmount(ROOT_TAG);
  rmSync(TMP_DIR, { recursive: true, force: true });
});

let compileCounter = 0;

async function compileComponent(source: string, name: string): Promise<Component> {
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

describe('svelte adapter mount pipeline (real compiled output, real fake-Fabric)', () => {
  it('mounts a static symbiote-text and commits it under the root symbiote-view', async () => {
    const Hello = await compileComponent('<symbiote-text p={{}}>hello</symbiote-text>', 'Hello');

    mount(ROOT_TAG, Hello);
    await tick();
    await tick();

    const root = fabric.appRoot();
    expect(fabric.serialize([root])).toContain('RCTText');
    expect(fabric.serialize([root])).toContain('RCTRawText "hello"');
  });

  it('reacts to a $state mutation (self-driven via $effect) and re-commits', async () => {
    // Drives its own second render via $effect rather than an externally-called exported
    // function, so this exercises the SAME public mount() contract real app code uses —
    // no reaching into svelte's own mount() return value to call an instance method.
    const Counter = await compileComponent(
      `<script>
         let count = $state(0);
         $effect(() => { if (count < 1) count = count + 1; });
       </script>
       <symbiote-text p={{}}>count {count}</symbiote-text>`,
      'Counter',
    );

    mount(ROOT_TAG, Counter);
    await tick();
    await tick();
    await tick();
    expect(fabric.serialize([fabric.appRoot()])).toContain('RCTRawText "count 1"');
  });

  // root-element.ts's wrapper ShimElement sits between the engine's synthetic flex:1
  // box-none AppContainer (appRoot()) and the mounted Svelte component's own real
  // root — unlike Vue/React, which mount their app's root node directly onto the
  // surface. Without flex:1 on this wrapper, a flex:1-styled app root inside it has no
  // resolved parent height to grow into and the whole tree collapses to 0x0 (blank,
  // untappable screen; every prop still commits correctly, which is why this only
  // shows up visually, never as a thrown error).
  it('gives the root wrapper flex:1 so a flex:1 app root actually fills the screen', async () => {
    const Hello = await compileComponent('<symbiote-text p={{}}>hello</symbiote-text>', 'Hello');

    mount(ROOT_TAG, Hello);
    await tick();
    await tick();

    // The engine's flattenStyle/fabricProps step hoists flex onto the top-level Fabric
    // prop bag (not nested under `style`) — the same shape every other layout prop lands
    // in once it reaches nativeFabricUIManager.
    const wrapper = fabric.appRoot().children[0];
    expect(wrapper.props.flex).toBe(1);
  });
});
