// Co-located Svelte-driven test (ADR 0025) for useLightSensor, the Svelte twin of
// react/hooks/use-light-sensor and vue/composables/use-light-sensor. See use-accelerometer's test
// for the shared rationale behind the compile-then-dynamic-import harness.

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { compile } from 'svelte/compiler';
import { readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { Component } from 'svelte';
import { mount, unmount } from '@symbiote-native/svelte/native-view-bridge';
import { installFabric } from '@symbiote-native/test-utils';
import type { ILightSensorMeasurement } from '../../core';
import metroSvelteTransformer from '@symbiote-native/svelte/metro-svelte-transformer';

const {
  compileSvelteModuleFile,
}: { compileSvelteModuleFile: (src: string, filename: string) => string } = metroSvelteTransformer;

if (globalThis.window === undefined) Object.assign(globalThis, { window: globalThis });
if (globalThis.navigator === undefined) {
  Object.assign(globalThis, { navigator: { product: 'ReactNative' } });
}

const ROOT_TAG = 91_654;
const PROBE_OUT = join(__dirname, '.smoke-compiled-use-light-sensor-probe.mjs');
const RUNE_OUT = join(__dirname, '.smoke-compiled-use-light-sensor.svelte.mjs');

type IListener = (measurement: ILightSensorMeasurement) => void;

let registeredListener: IListener | undefined;
const removeMock = vi.fn();
const addListenerMock = vi.fn((listener: IListener) => {
  registeredListener = listener;
  return { remove: removeMock };
});
const setUpdateIntervalMock = vi.fn();

vi.mock('../../core', () => ({
  LightSensor: {
    addListener: (listener: IListener) => addListenerMock(listener),
    removeAllListeners: vi.fn(),
    setUpdateInterval: (intervalMs: number) => setUpdateIntervalMock(intervalMs),
  },
}));

const fabric = installFabric();
const tick = (): Promise<void> => new Promise(resolve => setTimeout(resolve, 0));

beforeEach(() => {
  fabric.reset();
  registeredListener = undefined;
  addListenerMock.mockClear();
  removeMock.mockClear();
  setUpdateIntervalMock.mockClear();
});

afterEach(() => {
  unmount(ROOT_TAG);
  rmSync(PROBE_OUT, { force: true });
  rmSync(RUNE_OUT, { force: true });
});

const COMPILE_OPTIONS = { generate: 'client', fragments: 'tree', css: 'external' } as const;

function compileRuneModule(): void {
  const source = readFileSync(join(__dirname, 'use-light-sensor.svelte.ts'), 'utf-8');
  writeFileSync(RUNE_OUT, compileSvelteModuleFile(source, 'use-light-sensor.svelte.ts'));
}

async function loadProbe(): Promise<Component> {
  compileRuneModule();
  const result = compile(
    `<script lang="ts">
       import { useLightSensor } from './.smoke-compiled-use-light-sensor.svelte.mjs';
       let { updateIntervalMs, onValue }: {
         updateIntervalMs: number | undefined;
         onValue: (measurement: unknown) => void;
       } = $props();
       const measurement = useLightSensor(updateIntervalMs);
       $effect(() => { onValue(measurement.current); });
     </script>
     <symbiote-view p={{}} />`,
    { ...COMPILE_OPTIONS, filename: 'LightSensorProbe.svelte' },
  );
  writeFileSync(PROBE_OUT, result.js.code);
  const mod: unknown = await import(`file://${PROBE_OUT}`);
  if (mod === null || typeof mod !== 'object' || !('default' in mod)) {
    throw new Error('LightSensorProbe.svelte produced no default export');
  }
  return mod.default as Component;
}

async function mountLightSensor(
  values: (ILightSensorMeasurement | null)[],
  updateIntervalMs?: number,
): Promise<void> {
  const Probe = await loadProbe();
  mount(ROOT_TAG, Probe, {
    updateIntervalMs,
    onValue: (measurement: ILightSensorMeasurement | null) => values.push(measurement),
  });
  await tick();
}

describe('useLightSensor (Svelte)', () => {
  it('starts null before any measurement arrives', async () => {
    const values: (ILightSensorMeasurement | null)[] = [];
    await mountLightSensor(values);

    expect(values[values.length - 1]).toBeNull();
  });

  it('updates the state when the native listener fires', async () => {
    const values: (ILightSensorMeasurement | null)[] = [];
    await mountLightSensor(values);
    const reading: ILightSensorMeasurement = { illuminance: 42, timestamp: 123 };

    registeredListener?.(reading);
    await tick();

    expect(values[values.length - 1]).toEqual(reading);
  });

  it('removes the subscription on unmount', async () => {
    await mountLightSensor([]);
    unmount(ROOT_TAG);

    expect(removeMock).toHaveBeenCalledTimes(1);
  });

  it('sets the update interval once at subscribe time when provided', async () => {
    await mountLightSensor([], 50);

    expect(setUpdateIntervalMock).toHaveBeenCalledWith(50);
    expect(setUpdateIntervalMock).toHaveBeenCalledTimes(1);
  });

  it('does not touch the update interval when omitted', async () => {
    await mountLightSensor([]);

    expect(setUpdateIntervalMock).not.toHaveBeenCalled();
  });
});
