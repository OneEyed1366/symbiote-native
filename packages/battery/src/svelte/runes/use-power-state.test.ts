// Svelte-driven test for `usePowerState`; the merge and seed logic is covered in
// core/power-state.test.ts, this file proves only the rune's own lifecycle wiring

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { compile } from 'svelte/compiler';
import { readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { Component } from 'svelte';
import { mount, unmount } from '@symbiote-native/svelte/native-view-bridge';
import { installRecordingFabric } from '@symbiote-native/test-utils';
import metroSvelteTransformer from '@symbiote-native/svelte/metro-svelte-transformer';

const {
  compileSvelteModuleFile,
}: { compileSvelteModuleFile: (src: string, filename: string) => string } =
  metroSvelteTransformer;

if (globalThis.window === undefined)
  Object.assign(globalThis, { window: globalThis });
if (globalThis.navigator === undefined) {
  Object.assign(globalThis, { navigator: { product: 'ReactNative' } });
}

type IPowerState = {
  lowPowerMode: boolean;
  batteryLevel: number;
  batteryState: number;
};

const ROOT_TAG = 91_604;
const PROBE_OUT = join(__dirname, '.smoke-compiled-use-power-state-probe.mjs');
const RUNE_OUT = join(__dirname, '.smoke-compiled-use-power-state.svelte.mjs');

const { watchPowerState, stop, initialPowerState } = vi.hoisted(() => {
  const stop = vi.fn();
  return {
    stop,
    initialPowerState: {
      lowPowerMode: false,
      batteryLevel: -1,
      batteryState: 0,
    },
    watchPowerState: vi.fn((_onChange: (state: IPowerState) => void) => stop),
  };
});

vi.mock('../../core', () => ({ initialPowerState, watchPowerState }));

const fabric = installRecordingFabric();
const tick = (): Promise<void> =>
  new Promise(resolve => setTimeout(resolve, 0));

beforeEach(() => {
  fabric.reset();
  vi.clearAllMocks();
});

afterEach(() => {
  unmount(ROOT_TAG);
  rmSync(PROBE_OUT, { force: true });
  rmSync(RUNE_OUT, { force: true });
});

const COMPILE_OPTIONS = {
  generate: 'client',
  fragments: 'tree',
  css: 'external',
} as const;

async function loadProbe(): Promise<Component> {
  const source = readFileSync(
    join(__dirname, 'use-power-state.svelte.ts'),
    'utf-8',
  );
  writeFileSync(
    RUNE_OUT,
    compileSvelteModuleFile(source, 'use-power-state.svelte.ts'),
  );
  const result = compile(
    `<script lang="ts">
       import { usePowerState } from './.smoke-compiled-use-power-state.svelte.mjs';
       let { onValue }: { onValue: (state: object) => void } = $props();
       const powerState = usePowerState();
       $effect(() => { onValue(powerState.current); });
     </script>
     <view p={{}} />`,
    { ...COMPILE_OPTIONS, filename: 'PowerStateProbe.svelte' },
  );
  writeFileSync(PROBE_OUT, result.js.code);
  const mod: unknown = await import(`file://${PROBE_OUT}`);
  if (mod === null || typeof mod !== 'object' || !('default' in mod)) {
    throw new Error('PowerStateProbe.svelte produced no default export');
  }
  return mod.default as Component;
}

async function mountPowerState(): Promise<object[]> {
  const values: object[] = [];
  const Probe = await loadProbe();
  mount(ROOT_TAG, Probe, { onValue: (state: object) => values.push(state) });
  await tick();
  return values;
}

describe('usePowerState (Svelte)', () => {
  it('starts from the initial power state', async () => {
    const values = await mountPowerState();

    expect(values[0]).toEqual(initialPowerState);
  });

  it('updates the boxed value with the state the watcher pushes', async () => {
    const values = await mountPowerState();
    const push = watchPowerState.mock.calls[0][0];

    push({ lowPowerMode: true, batteryLevel: 0.4, batteryState: 2 });

    await vi.waitFor(() =>
      expect(values[values.length - 1]).toEqual({
        lowPowerMode: true,
        batteryLevel: 0.4,
        batteryState: 2,
      }),
    );
  });

  it('stops watching on unmount', async () => {
    await mountPowerState();

    unmount(ROOT_TAG);

    expect(stop).toHaveBeenCalledTimes(1);
  });
});
