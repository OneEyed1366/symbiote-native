// Co-located Svelte-driven test (ADR 0025) for useBatteryState. See use-battery-level.test.ts for
// the shared rationale (mocked core, real compiled probe component, why the rune module itself
// goes through the shipped compileSvelteModuleFile step).

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { compile } from 'svelte/compiler';
import { readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { Component } from 'svelte';
import { mount, unmount } from '@symbiote-native/svelte/native-view-bridge';
import { installFabric } from '@symbiote-native/test-utils';
import metroSvelteTransformer from '@symbiote-native/svelte/metro-svelte-transformer';

const {
  compileSvelteModuleFile,
}: { compileSvelteModuleFile: (src: string, filename: string) => string } = metroSvelteTransformer;

if (globalThis.window === undefined) Object.assign(globalThis, { window: globalThis });
if (globalThis.navigator === undefined) {
  Object.assign(globalThis, { navigator: { product: 'ReactNative' } });
}

const ROOT_TAG = 91_602;
const PROBE_OUT = join(__dirname, '.smoke-compiled-use-battery-state-probe.mjs');
const RUNE_OUT = join(__dirname, '.smoke-compiled-use-battery-state.svelte.mjs');

type IListener = (event: { batteryState: number }) => void;

let registeredListener: IListener | undefined;
const removeMock = vi.fn();
const addListenerMock = vi.fn((listener: IListener) => {
  registeredListener = listener;
  return { remove: removeMock };
});
const getBatteryStateAsyncMock = vi.fn(async () => 2);

vi.mock('../../core', () => ({
  addBatteryStateListener: (listener: IListener) => addListenerMock(listener),
  getBatteryStateAsync: () => getBatteryStateAsyncMock(),
  BatteryState: { UNKNOWN: 0, UNPLUGGED: 1, CHARGING: 2, FULL: 3, NOT_CHARGING: 4 },
}));

const fabric = installFabric();
const tick = (): Promise<void> => new Promise(resolve => setTimeout(resolve, 0));

beforeEach(() => {
  fabric.reset();
  registeredListener = undefined;
  addListenerMock.mockClear();
  removeMock.mockClear();
  getBatteryStateAsyncMock.mockClear();
  getBatteryStateAsyncMock.mockResolvedValue(2);
});

afterEach(() => {
  unmount(ROOT_TAG);
  rmSync(PROBE_OUT, { force: true });
  rmSync(RUNE_OUT, { force: true });
});

const COMPILE_OPTIONS = { generate: 'client', fragments: 'tree', css: 'external' } as const;

function compileRuneModule(): void {
  const source = readFileSync(join(__dirname, 'use-battery-state.svelte.ts'), 'utf-8');
  writeFileSync(RUNE_OUT, compileSvelteModuleFile(source, 'use-battery-state.svelte.ts'));
}

async function loadProbe(): Promise<Component> {
  compileRuneModule();
  const result = compile(
    `<script lang="ts">
       import { useBatteryState } from './.smoke-compiled-use-battery-state.svelte.mjs';
       let { onValue }: { onValue: (state: number) => void } = $props();
       const batteryState = useBatteryState();
       $effect(() => { onValue(batteryState.current); });
     </script>
     <symbiote-view p={{}} />`,
    { ...COMPILE_OPTIONS, filename: 'BatteryStateProbe.svelte' },
  );
  writeFileSync(PROBE_OUT, result.js.code);
  const mod: unknown = await import(`file://${PROBE_OUT}`);
  if (mod === null || typeof mod !== 'object' || !('default' in mod)) {
    throw new Error('BatteryStateProbe.svelte produced no default export');
  }
  return mod.default as Component;
}

async function mountBatteryState(): Promise<number[]> {
  const values: number[] = [];
  const Probe = await loadProbe();
  mount(ROOT_TAG, Probe, { onValue: (state: number) => values.push(state) });
  await tick();
  return values;
}

describe('useBatteryState (Svelte)', () => {
  it('starts at UNKNOWN (0) before the initial fetch resolves', async () => {
    const values = await mountBatteryState();

    expect(values[0]).toBe(0);
  });

  it('updates to the fetched value once getBatteryStateAsync() resolves', async () => {
    const values = await mountBatteryState();

    await vi.waitFor(() => expect(values[values.length - 1]).toBe(2));
  });

  it('updates the boxed value when the native listener fires', async () => {
    const values = await mountBatteryState();
    await vi.waitFor(() => expect(values[values.length - 1]).toBe(2));

    registeredListener?.({ batteryState: 1 });

    await vi.waitFor(() => expect(values[values.length - 1]).toBe(1));
  });

  it('removes the subscription on unmount', async () => {
    await mountBatteryState();

    unmount(ROOT_TAG);

    expect(removeMock).toHaveBeenCalledTimes(1);
  });
});
