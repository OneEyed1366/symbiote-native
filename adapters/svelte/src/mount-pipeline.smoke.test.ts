// The first REAL execution of the Svelte DOM-shim pipeline (patchGlobals -> shim tree ->
// engine -> fake Fabric), not just a typecheck. Every other file in this package has only ever
// been proven by `tsc --build`; this compiles REAL `.svelte` source through the real
// `svelte/compiler` (same `fragments: 'tree'` / `css: 'external'` options as svelte.config.js),
// mounts the output through this adapter's own `mount()`, and asserts on what actually landed
// in a faked `nativeFabricUIManager`. No `@sveltejs/vite-plugin-svelte` is wired into this
// repo's vitest config yet, so compiled output is written to a real temp file and dynamic-
// imported rather than transformed by a loader — see `compileComponent` below.
//
// No Negative group: `mount`/`unmount` validate nothing of their own — a malformed
// `RootComponent` would throw from Svelte's own `mount()`, not from this adapter's contract.

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
// resolves without extra wiring. Its own subfolder (not the bare `__smoke__` dir every smoke
// file used to share) — vitest runs test FILES in parallel, and a shared directory meant one
// file's afterEach `rmSync(..., {recursive:true})` could delete a `.mjs` another file's test
// had just written but not yet dynamic-imported, an intermittent "Cannot find module" failure
// with nothing wrong in either file's own logic.
const TMP_DIR = join(__dirname, '../build/__smoke__/mount-pipeline');

const fabric = installFabric();
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
  dev = false,
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

describe('mount (real compiled output, real fake-Fabric)', () => {
  describe('Positive', () => {
    it('mounts a static symbiote-text and commits it under the root symbiote-view', async () => {
      // why: proves the whole chain end to end — compiled Svelte output believing it talks
      // to a real DOM actually reaches a committed native Fabric node, not just a shim tree.
      const Hello = await compileComponent(
        '<symbiote-text p={{}}>hello</symbiote-text>',
        'Hello',
      );

      mount(ROOT_TAG, Hello);
      await tick();
      await tick();

      const root = fabric.appRoot();
      expect(fabric.serialize([root])).toContain('RCTText');
      expect(fabric.serialize([root])).toContain('RCTRawText "hello"');
    });

    it('reacts to a $state mutation (self-driven via $effect) and re-commits', async () => {
      // why: Drives its own second render via $effect rather than an externally-called
      // exported function, so this exercises the SAME public mount() contract real app code
      // uses — proving reactivity survives the shim's lazy engine-node binding (skill §9),
      // not just the initial paint.
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
      expect(fabric.serialize([fabric.appRoot()])).toContain(
        'RCTRawText "count 1"',
      );
    });

    // root-element.ts's wrapper ShimElement sits between the engine's synthetic flex:1
    // box-none AppContainer (appRoot()) and the mounted Svelte component's own real
    // root — unlike Vue/React, which mount their app's root node directly onto the
    // surface. Without flex:1 on this wrapper, a flex:1-styled app root inside it has no
    // resolved parent height to grow into and the whole tree collapses to 0x0 (blank,
    // untappable screen; every prop still commits correctly, which is why this only
    // shows up visually, never as a thrown error).
    it('gives the root wrapper flex:1 so a flex:1 app root actually fills the screen', async () => {
      // why: a wrapper missing flex:1 is a silent visual regression (nothing throws), so
      // this pins the one prop that prevents it.
      const Hello = await compileComponent(
        '<symbiote-text p={{}}>hello</symbiote-text>',
        'Hello',
      );

      mount(ROOT_TAG, Hello);
      await tick();
      await tick();

      // The engine's flattenStyle/fabricProps step hoists flex onto the top-level Fabric
      // prop bag (not nested under `style`) — the same shape every other layout prop lands
      // in once it reaches nativeFabricUIManager.
      const wrapper = fabric.appRoot().children[0];
      expect(wrapper.props.flex).toBe(1);
    });

    it('re-mounting the same rootTag tears down the previous app before mounting the new one', async () => {
      // why: Fast Refresh and focus-lifecycle restart a surface reusing the same rootTag
      // (render.ts's own header comment) — mount() must self-teardown rather than stacking a
      // second Svelte app onto the same target, or the tree would carry both components'
      // committed nodes side by side.
      const Hello = await compileComponent(
        '<symbiote-text p={{}}>hello</symbiote-text>',
        'HelloA',
      );
      mount(ROOT_TAG, Hello);
      await tick();
      await tick();
      expect(fabric.serialize([fabric.appRoot()])).toContain(
        'RCTRawText "hello"',
      );

      const Goodbye = await compileComponent(
        '<symbiote-text p={{}}>goodbye</symbiote-text>',
        'GoodbyeA',
      );
      mount(ROOT_TAG, Goodbye);
      await tick();
      await tick();

      const serialized = fabric.serialize([fabric.appRoot()]);
      expect(serialized).toContain('RCTRawText "goodbye"');
      expect(serialized).not.toContain('hello');
    });

    it('wires global.RN$stopSurface so a real C++-side surface stop reaches unmount()', async () => {
      // why: global.RN$stopSurface is the JSI hook AppRegistryBinding::stopSurface calls
      // directly — RN's own renderer installs it, and this adapter REPLACES that renderer, so
      // without this wiring a real device throws "Global was not installed" on every surface
      // stop and the screen goes blank (render.ts's own header comment on
      // installStopSurfaceGlobal). Proven end to end: stopping via the global, then mounting a
      // fresh component on the same rootTag, must show ONLY the fresh content — the same
      // teardown a direct unmount() call produces, reached through the C++ entry point instead.
      expect(typeof globalThis.RN$stopSurface).toBe('function');

      const Hello = await compileComponent(
        '<symbiote-text p={{}}>hello</symbiote-text>',
        'HelloB',
      );
      mount(ROOT_TAG, Hello);
      await tick();
      await tick();

      globalThis.RN$stopSurface?.(ROOT_TAG);
      await tick();

      const Goodbye = await compileComponent(
        '<symbiote-text p={{}}>goodbye</symbiote-text>',
        'GoodbyeB',
      );
      mount(ROOT_TAG, Goodbye);
      await tick();
      await tick();

      const serialized = fabric.serialize([fabric.appRoot()]);
      expect(serialized).toContain('RCTRawText "goodbye"');
      expect(serialized).not.toContain('hello');
    });

    it('tags the devtools owner on real compiled output when compiled with dev:true', async () => {
      // why: element.test.ts only ever asserted resolveOwnerFromSvelteMeta against a
      // MANUALLY-stamped `__svelte_meta`, which never caught that the shim was missing
      // `nodeType` — Svelte's own `add_locations` (dev/elements.js) gates its element-vs-not
      // check on `node.nodeType === ELEMENT_NODE`, so with `nodeType` undefined it silently
      // never stamped anything on a REAL compiled+mounted tree. This drives the actual
      // compiler + mount pipeline end to end, the only way that gap was ever going to surface.
      const Hello = await compileComponent(
        '<symbiote-text p={{}}>hello</symbiote-text>',
        'OwnerHello',
        true,
      );

      const surface = mount(ROOT_TAG, Hello);
      await tick();
      await tick();

      // surface.children[0] is root-element.ts's synthetic flex:1 wrapper (never compiled
      // Svelte output, so it carries no owner) — the compiled component's own root lands one
      // level in, as that wrapper's child.
      const [textNode] = surface.children[0]?.children ?? [];
      expect(textNode?.owner).toEqual({
        chain: [{ component: 'OwnerHello', file: 'OwnerHello.svelte' }],
      });
    });
  });
});
