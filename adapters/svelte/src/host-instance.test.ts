// Proves the fix in dom-shim/element.ts's createEngineNode(): every host node now gets
// toPublicInstance() grafted at creation, so hostInstance(shim).measure()/setNativeProps() are
// real, callable methods (RefApiDemo's whole reason for existing), not just typed lies. Real
// compiled source, same compile-then-dynamic-import pattern as every other smoke test here.

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { compile } from 'svelte/compiler';
import { rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { Component } from 'svelte';
import { installFabric } from '@symbiote-native/test-utils';
import { mount, unmount } from './render';

if (globalThis.window === undefined) Object.assign(globalThis, { window: globalThis });
if (globalThis.navigator === undefined) {
  Object.assign(globalThis, { navigator: { product: 'ReactNative' } });
}

const ROOT_TAG = 91_501;
const PARENT_OUT = join(__dirname, '.smoke-compiled-host-instance-parent.mjs');

const fabric = installFabric();
const tick = (): Promise<void> => new Promise(resolve => setTimeout(resolve, 0));

beforeEach(() => fabric.reset());
afterEach(() => {
  unmount(ROOT_TAG);
  rmSync(PARENT_OUT, { force: true });
});

const COMPILE_OPTIONS = { generate: 'client', fragments: 'tree', css: 'external' } as const;

function compileToFile(source: string, filename: string, outPath: string): void {
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

describe('hostInstance (real compiled source)', () => {
  it('grafts a real, callable measure/setNativeProps handle onto a bind:this host ref', async () => {
    const { hostInstance } = await import('./host-instance');
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
    function findLive(node: import('@symbiote-native/test-utils').IFakeNode): boolean {
      if (node.props.testID === 'ref-box') return node.props.backgroundColor === '#f6ad55';
      return node.children.some(findLive);
    }
    expect(findLive(fabric.appRoot())).toBe(true);
  });
});
