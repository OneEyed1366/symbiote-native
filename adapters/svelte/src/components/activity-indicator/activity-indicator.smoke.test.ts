// Real-execution proof (not just typecheck) of ActivityIndicator/index.svelte — the first
// component retrofitted onto the generic descriptorToSvelte bridge (mountDescriptorChildren)
// instead of a hand-written child tag. Compiles the REAL
// index.svelte source through svelte/compiler, mounts via the real render pipeline, and
// asserts against a real fake-Fabric recorder — proving both that the wrapper/spinner shape
// still commits correctly AND that a reactive prop change updates the SAME native node
// (no recreate) rather than a fresh one, following switch.smoke.test.ts's exact pattern.
//
// Coverage ledger (per CLAUDE.md's <components_split_logic_view_lifecycle> — the shared
// reducer/render logic is core/components' own job, this file proves the SVELTE LIFECYCLE
// wiring around it):
//   - renderActivityIndicator()'s own fold logic (size enum translation, platform default
//     color, hidesWhenStopped) — N/A here: covered directly at
//     adapters/react/src/descriptor-to-react/descriptor-bridge.test.ts's `renderActivityIndicator`
//     describe block. Re-asserting size/color fold branches here would duplicate that suite
//     instead of proving Svelte-specific behavior.
//   - index.svelte calls renderActivityIndicator() (not a hand-duplicated bag) and materializes
//     its children through createDescriptorChildrenSync — covered below.
//   - `bind:this` binds hostShim before the first commit, and $state.raw keeps it as a raw
//     ShimElement (not deep-proxied) so createDescriptorChildrenSync's identity-based diff
//     actually finds the same node on update — covered below (the no-recreate assertion).
//   - a reactive prop change re-renders the SAME native node via cloneNodeWithNewProps, not a
//     destroy+recreate — covered below.

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { compile } from 'svelte/compiler';
import { readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { Component } from 'svelte';
import { installFabric } from '@symbiote-native/test-utils';
import type { IFakeNode } from '@symbiote-native/test-utils';
import { mount, unmount } from '../../render';

// fabric.find() walks the CREATION log, which never reflects a later clone's props
// (the engine's own clone-on-write commit, unrelated to the renderer strategy) — a live-value
// assertion must instead walk the currently COMMITTED tree.
function findLive(node: IFakeNode, predicate: (n: IFakeNode) => boolean): IFakeNode | undefined {
  if (predicate(node)) return node;
  for (const child of node.children) {
    const found = findLive(child, predicate);
    if (found !== undefined) return found;
  }
  return undefined;
}

if (globalThis.window === undefined) Object.assign(globalThis, { window: globalThis });
if (globalThis.navigator === undefined) {
  Object.assign(globalThis, { navigator: { product: 'ReactNative' } });
}

const ROOT_TAG = 91_401;
const OUT = join(__dirname, '.smoke-compiled-activity-indicator.mjs');
const PARENT_OUT = join(__dirname, '.smoke-compiled-activity-indicator-parent.mjs');

const fabric = installFabric();
const tick = (): Promise<void> => new Promise(resolve => setTimeout(resolve, 0));

beforeEach(() => {
  fabric.reset();
});

afterEach(() => {
  unmount(ROOT_TAG);
  rmSync(OUT, { force: true });
  rmSync(PARENT_OUT, { force: true });
});

const COMPILE_OPTIONS = {
  generate: 'client',
  fragments: 'tree',
  css: 'external',
  experimental: { customRenderer: '@symbiote-native/svelte/renderer' },
} as const;

function compileToFile(source: string, filename: string, outPath: string): void {
  const result = compile(source, { ...COMPILE_OPTIONS, filename });
  writeFileSync(outPath, result.js.code);
}

type ISetAnimating = (value: boolean) => void;

async function loadMountable(): Promise<Component> {
  const source = readFileSync(join(__dirname, 'index.svelte'), 'utf8');
  compileToFile(source, 'ActivityIndicator.svelte', OUT);

  // `onCapture` hands the test a setter closing over the Parent's OWN `$state`, so a later
  // test can drive a real reactive update on the SAME mounted instance instead of calling
  // `mount()` again (which tears down and rebuilds a fresh app — not what "same node, no
  // recreate" needs to prove). Same capture-via-callback-prop pattern as
  // text-input.smoke.test.ts's `onCapture`.
  compileToFile(
    `<script>
       import ActivityIndicator from './.smoke-compiled-activity-indicator.mjs';
       let { onCapture, initialAnimating } = $props();
       let animating = $state(initialAnimating);
       $effect(() => { onCapture?.((value) => { animating = value; }); });
     </script>
     <ActivityIndicator {animating} color="#123456" />`,
    'Parent.svelte',
    PARENT_OUT,
  );

  const mod: unknown = await import(`file://${PARENT_OUT}`);
  if (mod === null || typeof mod !== 'object' || !('default' in mod)) {
    throw new Error('Parent.svelte produced no default export');
  }
  return mod.default as Component;
}

describe('ActivityIndicator (real compiled index.svelte)', () => {
  // No Negative group: ActivityIndicator is a pure render-only wrapper over
  // renderActivityIndicator() with no guard clause and no throwing path — every
  // IActivityIndicatorProps value the type allows produces a committed tree, never a rejection.
  describe('Positive (mounts and stays reactive through the Svelte lifecycle)', () => {
    // why: proves index.svelte actually CALLS renderActivityIndicator() and forwards its
    // Descriptor through the real render pipeline, rather than hand-duplicating the size/color
    // fold (the exact bug class svelte-adapter-dom-shim skill §15 found and fixed here once).
    it('commits the wrapper/spinner shape with the resolved size + color props', async () => {
      const Parent = await loadMountable();
      mount(ROOT_TAG, Parent, { initialAnimating: true });
      await tick();
      await tick();

      const spinner = findLive(fabric.appRoot(), node => node.viewName === 'ActivityIndicatorView');
      expect(spinner).toBeDefined();
      expect(spinner?.props.animating).toBe(true);
      expect(spinner?.props.color).toBe('#123456');
      expect(spinner?.props.size).toBe('small');
    });

    // why: `$state.raw` (not `$state`) holds `hostShim` for exactly this reason — a deep-proxied
    // ref would break createDescriptorChildrenSync's identity lookup and force a rebuild on
    // every render. This is the product rule §19 documents; asserting createNode count instead
    // of "it still works" is what makes the claim falsifiable.
    it('updates the SAME native node on a reactive prop change, not a new one', async () => {
      let setAnimating: ISetAnimating | null = null;
      const Parent = await loadMountable();
      mount(ROOT_TAG, Parent, {
        initialAnimating: true,
        onCapture: (setter: ISetAnimating) => {
          setAnimating = setter;
        },
      });
      await tick();
      await tick();

      expect(setAnimating, 'setter captured after mount').not.toBeNull();
      const before = findLive(fabric.appRoot(), node => node.viewName === 'ActivityIndicatorView');
      expect(before).toBeDefined();
      const createdBefore = fabric.counts.createNode;

      setAnimating?.(false);
      await tick();
      await tick();

      // The real proof of "reused, not recreated": no NEW createNode call happened at all —
      // a rebuild would have shown counts.createNode grow by 2 (wrapper + spinner).
      expect(fabric.counts.createNode).toBe(createdBefore);
      const after = findLive(fabric.appRoot(), node => node.viewName === 'ActivityIndicatorView');
      expect(after?.props.animating).toBe(false);
    });
  });
});
