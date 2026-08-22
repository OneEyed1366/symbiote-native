// hostInstance / findNodeHandle, the Svelte adapter twin of adapters/react/src/host-instance.ts
// and adapters/vue/src/host-instance/index.ts. RN's "ref/instance -> native reactTag" lookup,
// the seam imperative-interop libraries (reanimated, gesture-handler, react-navigation) reach
// through.
//
// Two harnesses, matching the two branches these functions have to cover: the full compiled-
// Svelte-through-mount() pipeline (proves a real `bind:this` ref works end to end, the same
// harness every other smoke test in this package uses) for the "live" case, and the lighter
// createSurface/createRootShimElement primitives (already used by descriptor-to-svelte.test.ts)
// for the null/undefined/not-yet-live/passthrough branches — none of those touch Svelte's own
// codegen, so compiling a component through svelte/compiler would add cost with no extra proof.

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { compile } from 'svelte/compiler';
import { rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { Component } from 'svelte';
import { installFabric } from '@symbiote-native/test-utils';
import {
  createSurface,
  disposeRoot,
  getNativeTag,
} from '@symbiote-native/engine';
import { mount, unmount } from './render';
import { createRootShimElement } from './root-element';
import { getShimDocument } from './dom-shim';
import { findNodeHandle, hostInstance } from './host-instance';

if (globalThis.window === undefined)
  Object.assign(globalThis, { window: globalThis });
if (globalThis.navigator === undefined) {
  Object.assign(globalThis, { navigator: { product: 'ReactNative' } });
}

const ROOT_TAG = 91_501;
const LIGHT_ROOT_TAG = 91_502;
const PARENT_OUT = join(__dirname, '.smoke-compiled-host-instance-parent.mjs');

const fabric = installFabric();
const tick = (): Promise<void> =>
  new Promise(resolve => setTimeout(resolve, 0));

beforeEach(() => fabric.reset());
afterEach(() => {
  unmount(ROOT_TAG);
  disposeRoot(LIGHT_ROOT_TAG);
  rmSync(PARENT_OUT, { force: true });
});

const COMPILE_OPTIONS = {
  generate: 'client',
  fragments: 'tree',
  css: 'external',
} as const;

function compileToFile(
  source: string,
  filename: string,
  outPath: string,
): void {
  const result = compile(source, { ...COMPILE_OPTIONS, filename });
  writeFileSync(outPath, result.js.code);
}

async function loadMountable(): Promise<Component> {
  compileToFile(
    `<script lang="ts">
       import { hostInstance } from './host-instance.ts';
       import type { ShimElement } from './dom-shim';
       let { onCapture }: { onCapture: (box: ShimElement) => void } = $props();
       let box = $state.raw<ShimElement | null>(null);
       $effect(() => { if (box !== null) onCapture(box); });
     </script>
     <symbiote-view p={{ testID: 'ref-box' }} bind:this={box} />`,
    'RefParent.svelte',
    PARENT_OUT,
  );
  const mod: unknown = await import(`file://${PARENT_OUT}`);
  if (mod === null || typeof mod !== 'object' || !('default' in mod)) {
    throw new Error('RefParent.svelte produced no default export');
  }
  return mod.default as Component;
}

describe('hostInstance', () => {
  describe('Positive', () => {
    it('grafts a real, callable measure/setNativeProps handle onto a bind:this host ref (real compiled source)', async () => {
      // why: proves the fix in dom-shim/element.ts's createEngineNode() — every host node
      // gets toPublicInstance() grafted at creation, so a real `bind:this` ref (not a
      // hand-built shim) yields real, callable methods (RefApiDemo's whole reason for
      // existing), not just typed lies.
      const Parent = await loadMountable();

      let captured: import('./dom-shim').ShimElement | undefined;
      mount(ROOT_TAG, Parent, {
        onCapture: (box: import('./dom-shim').ShimElement) => (captured = box),
      });
      await tick();
      await tick();

      const instance = hostInstance(captured);
      expect(instance).toBeDefined();
      expect(typeof instance?.measure).toBe('function');
      expect(typeof instance?.setNativeProps).toBe('function');

      instance?.setNativeProps({ style: { backgroundColor: '#f6ad55' } });
      await tick();

      // fabric.find() walks the CREATION log, which never reflects a later clone's props
      // (svelte-adapter-dom-shim skill's documented gotcha) — a live-value assertion must
      // instead walk the currently COMMITTED tree.
      function findLive(
        node: import('@symbiote-native/test-utils').IFakeNode,
      ): boolean {
        if (node.props.testID === 'ref-box')
          return node.props.backgroundColor === '#f6ad55';
        return node.children.some(findLive);
      }
      expect(findLive(fabric.appRoot())).toBe(true);
    });

    it('resolves an already-live shim to a real handle, via the lighter createSurface harness', () => {
      // why: the same "shim.engineNode is live" branch as the test above, proven against the
      // root shim createRootShimElement itself makes live — neither this branch nor its input
      // touches Svelte codegen, so a full compile buys no extra proof here.
      const surface = createSurface(LIGHT_ROOT_TAG);
      const root = createRootShimElement(surface);

      const instance = hostInstance(root);
      expect(instance).toBeDefined();
      expect(typeof instance?.measure).toBe('function');
    });
  });

  // hostInstance has no throwing path — an absent or not-yet-live ref is a normal, expected
  // situation (a `bind:this` target reads null before Svelte's first mount pass populates it),
  // so the contract is "resolve to undefined", not "throw".
  describe('resolves to undefined for a ref with no live host to graft onto', () => {
    it('returns undefined for a null ref', () => {
      expect(hostInstance(null)).toBeUndefined();
    });

    it('returns undefined for an undefined ref', () => {
      expect(hostInstance(undefined)).toBeUndefined();
    });

    it('returns undefined for a shim element that has never been inserted into a live tree', () => {
      // why: the shim's engine node is bound LAZILY on first insertion (skill §9) — a
      // freshly-created, unattached ShimElement has no engineNode yet, and hostInstance must
      // reflect that instead of crashing on the missing field.
      const detached = getShimDocument().createElement('symbiote-view');
      expect(hostInstance(detached)).toBeUndefined();
    });
  });
});

describe('findNodeHandle', () => {
  describe('Positive', () => {
    it('resolves a live shim element to the same tag a direct getNativeTag() call reports', async () => {
      // why: findNodeHandle's whole job is adapting a Svelte-shaped ShimElement onto the
      // engine's own node -> tag lookup — proving it AGREES with an independent getNativeTag()
      // call proves the adaptation actually happened, not just that both return some number.
      const surface = createSurface(LIGHT_ROOT_TAG);
      const root = createRootShimElement(surface);
      await tick();
      const engineNode = root.engineNode;
      if (engineNode === undefined)
        throw new Error('test setup: root shim never went live');

      const tag = getNativeTag(engineNode);
      expect(tag).not.toBeNull();
      expect(findNodeHandle(root)).toBe(tag);
    });

    it('passes a raw tag number straight through unchanged', () => {
      // why: RN's imperative-interop libraries sometimes already hold a resolved reactTag
      // instead of a component/ref — findNodeHandle must be idempotent for that case, matching
      // real RN's own findNodeHandle contract.
      expect(findNodeHandle(42)).toBe(42);
    });
  });

  // Same shape as hostInstance: no throwing path, "no native tag yet" resolves to null.
  describe('resolves to null for a handle with no live native tag to report', () => {
    it('returns null for a null handle', () => {
      expect(findNodeHandle(null)).toBeNull();
    });

    it('returns null for an undefined handle', () => {
      expect(findNodeHandle(undefined)).toBeNull();
    });

    it('returns null for a shim element that has never been inserted into a live tree', () => {
      // why: mirrors hostInstance's own not-yet-live case — a ref captured before the first
      // commit has no native tag to report yet, and must not throw while waiting for one.
      const detached = getShimDocument().createElement('symbiote-view');
      expect(findNodeHandle(detached)).toBeNull();
    });
  });
});
