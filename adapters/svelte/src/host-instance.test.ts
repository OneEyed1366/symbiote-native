// Proves hostInstance()/findNodeHandle() are thin, correct passthroughs over a real
// ISymbioteNode — renderer.ts's createElementNode() grafts toPublicInstance() onto every host
// node AT CREATION under the official custom-renderer API (eager binding, no more lazy
// ShimElement to translate), so hostInstance(node).measure()/setNativeProps() must be real,
// callable methods (RefApiDemo's whole reason for existing), not just typed lies. Real compiled
// source, same compile-then-dynamic-import pattern as every other smoke test here; the node under
// test is captured through a real `{@attach}` (svelte-adapter-custom-renderer skill §4), not a
// hand-rolled fake object.

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { compile } from 'svelte/compiler';
import { rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { Component } from 'svelte';
import { installFabric, type IFakeNode } from '@symbiote-native/test-utils';
import type { ISymbioteNode } from '@symbiote-native/engine';
import { mount, unmount } from './render';
import { findNodeHandle, hostInstance } from './host-instance';

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

function compileToFile(source: string, filename: string, outPath: string): void {
  const result = compile(source, {
    generate: 'client',
    filename,
    fragments: 'tree',
    css: 'external',
    experimental: { customRenderer: '@symbiote-native/svelte/renderer' },
  });
  writeFileSync(outPath, result.js.code);
}

async function loadMountable(): Promise<Component> {
  compileToFile(
    `<script lang="ts">
       import type { ISymbioteNode } from '@symbiote-native/engine';
       let { onCapture }: { onCapture: (box: ISymbioteNode) => void } = $props();
       let box = $state.raw<ISymbioteNode | null>(null);
       $effect(() => { if (box !== null) onCapture(box); });
     </script>
     <symbiote-view testID="ref-box" {@attach (node) => (box = node)} />`,
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
  it('grafts a real, callable measure/setNativeProps handle onto an {@attach}-captured host node', async () => {
    const Parent = await loadMountable();

    let captured: ISymbioteNode | undefined;
    mount(ROOT_TAG, Parent, {
      onCapture: (box: ISymbioteNode) => (captured = box),
    });
    await tick();
    await tick();

    const instance = hostInstance(captured);
    expect(instance).toBeDefined();
    expect(typeof instance?.measure).toBe('function');
    expect(typeof instance?.setNativeProps).toBe('function');

    instance?.setNativeProps({ style: { backgroundColor: '#f6ad55' } });
    await tick();

    // fabric.find() walks the CREATION log, which never reflects a later clone's props — a
    // live-value assertion must instead walk the currently COMMITTED tree.
    function findLive(node: IFakeNode): boolean {
      if (node.props.testID === 'ref-box') return node.props.backgroundColor === '#f6ad55';
      return node.children.some(findLive);
    }
    expect(findLive(fabric.appRoot())).toBe(true);
  });
});

describe('findNodeHandle (real compiled source)', () => {
  it('resolves a real host node to its committed Fabric tag', async () => {
    const Parent = await loadMountable();

    let captured: ISymbioteNode | undefined;
    mount(ROOT_TAG, Parent, {
      onCapture: (box: ISymbioteNode) => (captured = box),
    });
    await tick();
    await tick();

    const committed = fabric.find(node => node.props.testID === 'ref-box');
    expect(committed).toBeDefined();

    const handle = findNodeHandle(captured);
    expect(handle).not.toBeNull();
    expect(handle).toBe(committed?.tag);
  });

  it('passes a numeric handle through unchanged, and null/undefined to null', () => {
    expect(findNodeHandle(42)).toBe(42);
    expect(findNodeHandle(null)).toBeNull();
    expect(findNodeHandle(undefined)).toBeNull();
  });
});
