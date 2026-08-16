// Proves createTunnel end-to-end against the REAL compiled tunnel-in.svelte/tunnel-out.svelte
// (not hand-written stand-ins): TunnelIn registers its snippet under a shared registry,
// TunnelOut (mounted as a plain sibling, no ancestor relationship to TunnelIn) picks it up on
// its own reactive read, and unmounting TunnelIn removes the entry again. Mirrors
// components/switch/switch.smoke.test.ts's compile-the-real-source-then-dynamic-import pattern.

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { compile } from 'svelte/compiler';
import { readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { Component } from 'svelte';
import { installFabric } from '@symbiote-native/test-utils';
import { mount, unmount } from '../render';

if (globalThis.window === undefined) Object.assign(globalThis, { window: globalThis });
if (globalThis.navigator === undefined) {
  Object.assign(globalThis, { navigator: { product: 'ReactNative' } });
}

const ROOT_TAG = 91_401;
const IN_OUT = join(__dirname, '.smoke-compiled-tunnel-in.mjs');
const OUT_OUT = join(__dirname, '.smoke-compiled-tunnel-out.mjs');
const PARENT_OUT = join(__dirname, '.smoke-compiled-tunnel-parent.mjs');

const fabric = installFabric();
const tick = (): Promise<void> => new Promise(resolve => setTimeout(resolve, 0));

beforeEach(() => {
  fabric.reset();
});

afterEach(() => {
  unmount(ROOT_TAG);
  rmSync(IN_OUT, { force: true });
  rmSync(OUT_OUT, { force: true });
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

async function loadMountable(): Promise<Component> {
  compileToFile(
    readFileSync(join(__dirname, 'tunnel-in.svelte'), 'utf8'),
    'TunnelIn.svelte',
    IN_OUT,
  );
  compileToFile(
    readFileSync(join(__dirname, 'tunnel-out.svelte'), 'utf8'),
    'TunnelOut.svelte',
    OUT_OUT,
  );

  // TunnelOut is mounted as a plain SIBLING of the `{#if}`-gated TunnelIn — no shared ancestor
  // beyond this synthetic root — proving Out doesn't need a tree relationship to In, only the
  // shared `tunnel` object.
  compileToFile(
    `<script>
       import TunnelIn from './.smoke-compiled-tunnel-in.mjs';
       import TunnelOut from './.smoke-compiled-tunnel-out.mjs';
       import { createTunnel } from './tunnel.ts';
       let { visible = false } = $props();
       const tunnel = createTunnel();
     </script>
     <symbiote-view>{#if visible}<TunnelIn tunnel={tunnel}>{#snippet children()}<symbiote-text>tunneled</symbiote-text>{/snippet}</TunnelIn>{/if}<TunnelOut tunnel={tunnel} /></symbiote-view>`,
    'TunnelParent.svelte',
    PARENT_OUT,
  );

  const mod: unknown = await import(`file://${PARENT_OUT}`);
  if (mod === null || typeof mod !== 'object' || !('default' in mod)) {
    throw new Error('TunnelParent.svelte produced no default export');
  }
  return mod.default as Component;
}

describe('createTunnel (real compiled tunnel-in.svelte/tunnel-out.svelte)', () => {
  it('paints nothing tunneled while In is not mounted', async () => {
    const Parent = await loadMountable();
    mount(ROOT_TAG, Parent, { visible: false });
    await tick();
    await tick();

    expect(fabric.find(n => n.viewName === 'RCTText')).toBeUndefined();
  });

  it('paints the tunneled content once In mounts', async () => {
    const Parent = await loadMountable();
    mount(ROOT_TAG, Parent, { visible: true });
    await tick();
    await tick();

    const text = fabric.find(n => n.viewName === 'RCTText');
    expect(text).toBeDefined();
    expect(text?.children[0]?.props.text).toBe('tunneled');
  });
});
