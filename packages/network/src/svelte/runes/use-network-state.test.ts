// Co-located Svelte-driven test (ADR 0025) for useNetworkState, the Svelte twin of
// react/hooks/use-network-state and vue/composables/use-network-state. Runs the rune inside a REAL
// compiled .svelte component — same compile-then-dynamic-import pattern as
// packages/splash-screen/src/svelte/runes/use-hide-animation.test.ts — because $state/$effect
// require a real component context.

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { compile } from 'svelte/compiler';
import { readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { Component } from 'svelte';
// The .svelte-free subpath — the main barrel re-exports real .svelte component sources, which
// vitest's plain (svelte-plugin-free) test transform cannot parse.
import { mount, unmount } from '@symbiote-native/svelte/native-view-bridge';
import { installFabric } from '@symbiote-native/test-utils';
// The real Metro pipeline's own .svelte.ts compile step (TS-strip + compileModule), reused here so
// this test exercises the actual shipped compile path.
import metroSvelteTransformer from '@symbiote-native/svelte/metro-svelte-transformer';

const {
  compileSvelteModuleFile,
}: { compileSvelteModuleFile: (src: string, filename: string) => string } = metroSvelteTransformer;

if (globalThis.window === undefined) Object.assign(globalThis, { window: globalThis });
if (globalThis.navigator === undefined) {
  Object.assign(globalThis, { navigator: { product: 'ReactNative' } });
}

const ROOT_TAG = 91_620;
const PROBE_OUT = join(__dirname, '.smoke-compiled-use-network-state-probe.mjs');
const RUNE_OUT = join(__dirname, '.smoke-compiled-use-network-state.svelte.mjs');

type INetworkState = { type?: string; isConnected?: boolean; isInternetReachable?: boolean };
type IListener = (event: INetworkState) => void;

let registeredListener: IListener | undefined;
const removeMock = vi.fn();
const addListenerMock = vi.fn((listener: IListener) => {
  registeredListener = listener;
  return { remove: removeMock };
});
const getNetworkStateAsyncMock = vi.fn(async (): Promise<INetworkState> => ({
  type: 'WIFI',
  isConnected: true,
  isInternetReachable: true,
}));

vi.mock('../../core', () => ({
  addNetworkStateListener: (listener: IListener) => addListenerMock(listener),
  getNetworkStateAsync: () => getNetworkStateAsyncMock(),
}));

const fabric = installFabric();
const tick = (): Promise<void> => new Promise(resolve => setTimeout(resolve, 0));

beforeEach(() => {
  fabric.reset();
  registeredListener = undefined;
  addListenerMock.mockClear();
  removeMock.mockClear();
  getNetworkStateAsyncMock.mockClear();
  getNetworkStateAsyncMock.mockResolvedValue({
    type: 'WIFI',
    isConnected: true,
    isInternetReachable: true,
  });
});

afterEach(() => {
  unmount(ROOT_TAG);
  rmSync(PROBE_OUT, { force: true });
  rmSync(RUNE_OUT, { force: true });
});

const COMPILE_OPTIONS = { generate: 'client', fragments: 'tree', css: 'external' } as const;

// $state/$effect require Svelte's MODULE compiler, not the component compiler — a bare,
// uncompiled rune call throws `rune_outside_svelte` at runtime.
function compileRuneModule(): void {
  const source = readFileSync(join(__dirname, 'use-network-state.svelte.ts'), 'utf-8');
  writeFileSync(RUNE_OUT, compileSvelteModuleFile(source, 'use-network-state.svelte.ts'));
}

async function loadProbe(): Promise<Component> {
  compileRuneModule();
  const result = compile(
    `<script lang="ts">
       import { useNetworkState } from './.smoke-compiled-use-network-state.svelte.mjs';
       let { onValue }: { onValue: (state: unknown) => void } = $props();
       const networkState = useNetworkState();
       $effect(() => { onValue(networkState.current); });
     </script>
     <symbiote-view p={{}} />`,
    { ...COMPILE_OPTIONS, filename: 'NetworkStateProbe.svelte' },
  );
  writeFileSync(PROBE_OUT, result.js.code);
  const mod: unknown = await import(`file://${PROBE_OUT}`);
  if (mod === null || typeof mod !== 'object' || !('default' in mod)) {
    throw new Error('NetworkStateProbe.svelte produced no default export');
  }
  return mod.default as Component;
}

async function mountNetworkState(values: INetworkState[]): Promise<void> {
  const Probe = await loadProbe();
  mount(ROOT_TAG, Probe, { onValue: (state: INetworkState) => values.push(state) });
  await tick();
}

describe('useNetworkState (Svelte)', () => {
  it('starts at an empty object before the initial fetch resolves', async () => {
    // A never-settling fetch pins the state at its seed value, so this asserts the seed rather
    // than racing the mock's own resolution.
    getNetworkStateAsyncMock.mockReturnValue(new Promise<INetworkState>(() => {}));
    const values: INetworkState[] = [];
    await mountNetworkState(values);

    expect(values[values.length - 1]).toEqual({});
  });

  it('updates to the fetched value once getNetworkStateAsync() resolves', async () => {
    const values: INetworkState[] = [];
    await mountNetworkState(values);

    await vi.waitFor(() =>
      expect(values[values.length - 1]).toEqual({
        type: 'WIFI',
        isConnected: true,
        isInternetReachable: true,
      }),
    );
  });

  it('updates the state when the native listener fires', async () => {
    const values: INetworkState[] = [];
    await mountNetworkState(values);
    await vi.waitFor(() => expect(values[values.length - 1].type).toBe('WIFI'));

    registeredListener?.({ type: 'CELLULAR', isConnected: true, isInternetReachable: false });
    await tick();

    expect(values[values.length - 1].type).toBe('CELLULAR');
  });

  it('removes the subscription on unmount', async () => {
    await mountNetworkState([]);
    unmount(ROOT_TAG);

    expect(removeMock).toHaveBeenCalledTimes(1);
  });
});
