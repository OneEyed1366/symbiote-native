// Co-located Svelte-driven test (ADR 0025) for usePedometer, the Svelte twin of
// react/hooks/use-pedometer and vue/composables/use-pedometer. Pedometer has no setUpdateInterval,
// so unlike the other sensor runes there is no interval assertion here. See use-accelerometer's
// test for the shared rationale behind the compile-then-dynamic-import harness.

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { compile } from 'svelte/compiler';
import { readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { Component } from 'svelte';
import { mount, unmount } from '@symbiote-native/svelte/native-view-bridge';
import { installFabric } from '@symbiote-native/test-utils';
import type { IPedometerResult } from '../../core';
import metroSvelteTransformer from '@symbiote-native/svelte/metro-svelte-transformer';

const {
  compileSvelteModuleFile,
}: { compileSvelteModuleFile: (src: string, filename: string) => string } = metroSvelteTransformer;

if (globalThis.window === undefined) Object.assign(globalThis, { window: globalThis });
if (globalThis.navigator === undefined) {
  Object.assign(globalThis, { navigator: { product: 'ReactNative' } });
}

const ROOT_TAG = 91_657;
const PROBE_OUT = join(__dirname, '.smoke-compiled-use-pedometer-probe.mjs');
const RUNE_OUT = join(__dirname, '.smoke-compiled-use-pedometer.svelte.mjs');

type IListener = (result: IPedometerResult) => void;

let registeredListener: IListener | undefined;
const removeMock = vi.fn();
const watchStepCountMock = vi.fn((listener: IListener) => {
  registeredListener = listener;
  return { remove: removeMock };
});

vi.mock('../../core', () => ({
  watchStepCount: (listener: IListener) => watchStepCountMock(listener),
}));

const fabric = installFabric();
const tick = (): Promise<void> => new Promise(resolve => setTimeout(resolve, 0));

beforeEach(() => {
  fabric.reset();
  registeredListener = undefined;
  watchStepCountMock.mockClear();
  removeMock.mockClear();
});

afterEach(() => {
  unmount(ROOT_TAG);
  rmSync(PROBE_OUT, { force: true });
  rmSync(RUNE_OUT, { force: true });
});

const COMPILE_OPTIONS = { generate: 'client', fragments: 'tree', css: 'external' } as const;

function compileRuneModule(): void {
  const source = readFileSync(join(__dirname, 'use-pedometer.svelte.ts'), 'utf-8');
  writeFileSync(RUNE_OUT, compileSvelteModuleFile(source, 'use-pedometer.svelte.ts'));
}

async function loadProbe(): Promise<Component> {
  compileRuneModule();
  const result = compile(
    `<script lang="ts">
       import { usePedometer } from './.smoke-compiled-use-pedometer.svelte.mjs';
       let { onValue }: { onValue: (result: unknown) => void } = $props();
       const pedometer = usePedometer();
       $effect(() => { onValue(pedometer.current); });
     </script>
     <symbiote-view p={{}} />`,
    { ...COMPILE_OPTIONS, filename: 'PedometerProbe.svelte' },
  );
  writeFileSync(PROBE_OUT, result.js.code);
  const mod: unknown = await import(`file://${PROBE_OUT}`);
  if (mod === null || typeof mod !== 'object' || !('default' in mod)) {
    throw new Error('PedometerProbe.svelte produced no default export');
  }
  return mod.default as Component;
}

async function mountPedometer(values: (IPedometerResult | null)[]): Promise<void> {
  const Probe = await loadProbe();
  mount(ROOT_TAG, Probe, {
    onValue: (result: IPedometerResult | null) => values.push(result),
  });
  await tick();
}

describe('usePedometer (Svelte)', () => {
  it('starts null before any step count arrives', async () => {
    const values: (IPedometerResult | null)[] = [];
    await mountPedometer(values);

    expect(values[values.length - 1]).toBeNull();
  });

  it('updates the state when the native listener fires', async () => {
    const values: (IPedometerResult | null)[] = [];
    await mountPedometer(values);
    const reading: IPedometerResult = { steps: 456 };

    registeredListener?.(reading);
    await tick();

    expect(values[values.length - 1]).toEqual(reading);
  });

  it('removes the subscription on unmount', async () => {
    await mountPedometer([]);
    unmount(ROOT_TAG);

    expect(removeMock).toHaveBeenCalledTimes(1);
  });
});
