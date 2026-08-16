// Proves createTunnel end-to-end against the REAL compiled tunnel-in.svelte/tunnel-out.svelte
// (not hand-written stand-ins): TunnelIn registers its snippet under a shared registry,
// TunnelOut (mounted as a plain sibling, no ancestor relationship to TunnelIn) picks it up on
// its own reactive read, and unmounting TunnelIn removes the entry again. Mirrors
// components/switch/switch.smoke.test.ts's compile-the-real-source-then-dynamic-import pattern.
//
// No Negative group: createTunnel/TunnelIn/TunnelOut have no throwing path — `items` is a plain
// SvelteMap, `reserveId()` is a total function over no input, and the template's `{#each}` has
// nothing to reject. Every scenario below is a Positive completion of the shared-registry
// contract, from a different angle (presence, absence, live toggling, ordering).

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { compile } from 'svelte/compiler';
import { readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { Component } from 'svelte';
import { installFabric, type IFakeNode } from '@symbiote-native/test-utils';
import { mount, unmount } from '../render';

if (globalThis.window === undefined) Object.assign(globalThis, { window: globalThis });
if (globalThis.navigator === undefined) {
  Object.assign(globalThis, { navigator: { product: 'ReactNative' } });
}

const ROOT_TAG = 91_401;
const IN_OUT = join(__dirname, '.smoke-compiled-tunnel-in.mjs');
const OUT_OUT = join(__dirname, '.smoke-compiled-tunnel-out.mjs');
const PARENT_OUT = join(__dirname, '.smoke-compiled-tunnel-parent.mjs');
const TOGGLE_PARENT_OUT = join(__dirname, '.smoke-compiled-tunnel-toggle-parent.mjs');
const MULTI_PARENT_OUT = join(__dirname, '.smoke-compiled-tunnel-multi-parent.mjs');

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
  rmSync(TOGGLE_PARENT_OUT, { force: true });
  rmSync(MULTI_PARENT_OUT, { force: true });
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

// `fabric.find()` walks the CREATION log — the original `createNode`'d object, whose children
// array is frozen at first-commit time. A LIVE toggle (In mounting/unmounting after the initial
// commit) must instead be read off the LATEST committed tree, the same convention used by
// adapters/vue/src/runtime-helpers/runtime-helpers.test.ts and the restructured switch/text-input
// smoke tests in this adapter.
function findText(nodes: IFakeNode[]): string | undefined {
  for (const node of nodes) {
    if (node.viewName === 'RCTRawText') return String(node.props.text);
    const found = findText(node.children);
    if (found !== undefined) return found;
  }
  return undefined;
}

function compileTunnelPair(): void {
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
}

async function loadMountable(): Promise<Component> {
  compileTunnelPair();

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

// Same shape as loadMountable, but `visible` is LIVE `$state`, flippable after mount via a
// `toggle` function handed out through `onReady` — the same self-reported-export pattern
// switch/text-input's CapturingParent uses for a CHILD's bind:this, applied to the ROOT
// component itself (our `mount()` wrapper discards svelte's own mount() return value, so there
// is no other way to reach back into an already-mounted root's state).
async function loadToggleMountable(): Promise<Component> {
  compileTunnelPair();

  compileToFile(
    `<script>
       import TunnelIn from './.smoke-compiled-tunnel-in.mjs';
       import TunnelOut from './.smoke-compiled-tunnel-out.mjs';
       import { createTunnel } from './tunnel.ts';
       let { initialVisible = false, onReady } = $props();
       let visible = $state(initialVisible);
       const tunnel = createTunnel();
       function toggle() { visible = !visible; }
       $effect(() => { onReady?.(toggle); });
     </script>
     <symbiote-view p={{}}>{#if visible}<TunnelIn tunnel={tunnel}>{#snippet children()}<symbiote-text p={{}}>tunneled</symbiote-text>{/snippet}</TunnelIn>{/if}<TunnelOut tunnel={tunnel} /></symbiote-view>`,
    'TunnelToggleParent.svelte',
    TOGGLE_PARENT_OUT,
  );

  const mod: unknown = await import(`file://${TOGGLE_PARENT_OUT}`);
  if (mod === null || typeof mod !== 'object' || !('default' in mod)) {
    throw new Error('TunnelToggleParent.svelte produced no default export');
  }
  return mod.default as Component;
}

// Two TunnelIn instances registered against the SAME tunnel from the start — proves TunnelOut's
// `{#each tunnel.items as [id, snippet] (id)}` actually renders every registered entry, not just
// the single one every other scenario in this file happens to exercise.
async function loadMultiMountable(): Promise<Component> {
  compileTunnelPair();

  compileToFile(
    `<script>
       import TunnelIn from './.smoke-compiled-tunnel-in.mjs';
       import TunnelOut from './.smoke-compiled-tunnel-out.mjs';
       import { createTunnel } from './tunnel.ts';
       const tunnel = createTunnel();
     </script>
     <symbiote-view p={{}}>
       <TunnelIn tunnel={tunnel}>{#snippet children()}<symbiote-text p={{}}>first</symbiote-text>{/snippet}</TunnelIn>
       <TunnelIn tunnel={tunnel}>{#snippet children()}<symbiote-text p={{}}>second</symbiote-text>{/snippet}</TunnelIn>
       <TunnelOut tunnel={tunnel} />
     </symbiote-view>`,
    'TunnelMultiParent.svelte',
    MULTI_PARENT_OUT,
  );

  const mod: unknown = await import(`file://${MULTI_PARENT_OUT}`);
  if (mod === null || typeof mod !== 'object' || !('default' in mod)) {
    throw new Error('TunnelMultiParent.svelte produced no default export');
  }
  return mod.default as Component;
}

describe('createTunnel (real compiled tunnel-in.svelte/tunnel-out.svelte)', () => {
  // why: TunnelOut has no fallback/placeholder rendering — an app relying on the tunnel to be
  // empty by default (no In ever mounted) must see genuinely nothing committed, not a stray
  // empty wrapper.
  it('paints nothing tunneled while In is not mounted', async () => {
    const Parent = await loadMountable();
    mount(ROOT_TAG, Parent, { visible: false });
    await tick();
    await tick();

    expect(fabric.find(n => n.viewName === 'RCTText')).toBeUndefined();
  });

  // why: the whole point of createTunnel is cross-surface content sharing without a tree
  // relationship — TunnelIn and TunnelOut here are plain siblings under a synthetic root, so
  // this proves TunnelOut's reactive read of `tunnel.items` (a SvelteMap) actually picks up
  // what TunnelIn registered, with no ancestor/context plumbing involved.
  it('paints the tunneled content once In mounts', async () => {
    const Parent = await loadMountable();
    mount(ROOT_TAG, Parent, { visible: true });
    await tick();
    await tick();

    const text = fabric.find(n => n.viewName === 'RCTText');
    expect(text).toBeDefined();
    expect(text?.children[0]?.props.text).toBe('tunneled');
  });

  // why: TunnelIn's effect returns a cleanup (`tunnel.items.delete(id)`) that only fires on
  // unmount/re-run — untested by the two scenarios above, since each of them only ever mounts
  // ONE static snapshot. A live toggle proves the registry entry is actually removed when In
  // goes away (not just that it was never added), and that mounting a FRESH In afterward
  // re-registers correctly under a new id (`reserveId()` incrementing across separate In
  // lifetimes, not reusing a stale/deleted key).
  it('removes the tunneled content once In unmounts, and re-adds it if In mounts again', async () => {
    const Parent = await loadToggleMountable();
    let toggle: (() => void) | undefined;
    mount(ROOT_TAG, Parent, {
      initialVisible: true,
      onReady: (fn: () => void) => {
        toggle = fn;
      },
    });
    await tick();
    await tick();

    expect(findText(fabric.committed)).toBe('tunneled');

    expect(toggle).toBeDefined();
    toggle?.();
    await tick();
    await tick();

    expect(findText(fabric.committed)).toBeUndefined();

    toggle?.();
    await tick();
    await tick();

    expect(findText(fabric.committed)).toBe('tunneled');
  });

  // why: `{#each tunnel.items as [id, snippet] (id)}` must render EVERY registered entry, not
  // just the single one every other scenario in this file happens to exercise — proving the
  // registry is a genuine multi-entry map, in the order the two TunnelIn instances registered.
  it('renders every tunneled entry when multiple In instances share one tunnel', async () => {
    const Parent = await loadMultiMountable();
    mount(ROOT_TAG, Parent);
    await tick();
    await tick();

    const texts = fabric.created
      .filter(n => n.viewName === 'RCTRawText')
      .map(n => String(n.props.text).trim())
      .filter(text => text.length > 0);
    expect(texts).toEqual(['first', 'second']);
  });
});
