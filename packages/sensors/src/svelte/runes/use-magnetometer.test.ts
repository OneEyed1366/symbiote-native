// Co-located Svelte-driven test (ADR 0025) for useMagnetometer, the Svelte twin of
// react/hooks/use-magnetometer and vue/composables/use-magnetometer. See use-accelerometer's test
// for the shared rationale behind the compile-then-dynamic-import harness.

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { compile } from 'svelte/compiler';
import { readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { Component } from 'svelte';
import { mount, unmount } from '@symbiote-native/svelte/native-view-bridge';
import { installFabric } from '@symbiote-native/test-utils';
import type { IMagnetometerMeasurement } from '../../core';
import metroSvelteTransformer from '@symbiote-native/svelte/metro-svelte-transformer';

const {
  compileSvelteModuleFile,
}: { compileSvelteModuleFile: (src: string, filename: string) => string } = metroSvelteTransformer;

if (globalThis.window === undefined) Object.assign(globalThis, { window: globalThis });
if (globalThis.navigator === undefined) {
  Object.assign(globalThis, { navigator: { product: 'ReactNative' } });
}

const ROOT_TAG = 91_655;
const PROBE_OUT = join(__dirname, '.smoke-compiled-use-magnetometer-probe.mjs');
const RUNE_OUT = join(__dirname, '.smoke-compiled-use-magnetometer.svelte.mjs');

type IListener = (measurement: IMagnetometerMeasurement) => void;

let registeredListener: IListener | undefined;
const removeMock = vi.fn();
const addListenerMock = vi.fn((listener: IListener) => {
  registeredListener = listener;
  return { remove: removeMock };
});
const setUpdateIntervalMock = vi.fn();

vi.mock('../../core', () => ({
  Magnetometer: {
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
  const source = readFileSync(join(__dirname, 'use-magnetometer.svelte.ts'), 'utf-8');
  writeFileSync(RUNE_OUT, compileSvelteModuleFile(source, 'use-magnetometer.svelte.ts'));
}

async function loadProbe(): Promise<Component> {
  compileRuneModule();
  const result = compile(
    `<script lang="ts">
       import { useMagnetometer } from './.smoke-compiled-use-magnetometer.svelte.mjs';
       let { updateIntervalMs, onValue }: {
         updateIntervalMs: number | undefined;
         onValue: (measurement: unknown) => void;
       } = $props();
       const measurement = useMagnetometer(updateIntervalMs);
       $effect(() => { onValue(measurement.current); });
     </script>
     <symbiote-view p={{}} />`,
    { ...COMPILE_OPTIONS, filename: 'MagnetometerProbe.svelte' },
  );
  writeFileSync(PROBE_OUT, result.js.code);
  const mod: unknown = await import(`file://${PROBE_OUT}`);
  if (mod === null || typeof mod !== 'object' || !('default' in mod)) {
    throw new Error('MagnetometerProbe.svelte produced no default export');
  }
  return mod.default as Component;
}

async function mountMagnetometer(
  values: (IMagnetometerMeasurement | null)[],
  updateIntervalMs?: number,
): Promise<void> {
  const Probe = await loadProbe();
  mount(ROOT_TAG, Probe, {
    updateIntervalMs,
    onValue: (measurement: IMagnetometerMeasurement | null) => values.push(measurement),
  });
  await tick();
}

describe('useMagnetometer (Svelte)', () => {
  it('starts null before any measurement arrives', async () => {
    const values: (IMagnetometerMeasurement | null)[] = [];
    await mountMagnetometer(values);

    expect(values[values.length - 1]).toBeNull();
  });

  it('updates the state when the native listener fires', async () => {
    const values: (IMagnetometerMeasurement | null)[] = [];
    await mountMagnetometer(values);
    const reading: IMagnetometerMeasurement = { x: 0.1, y: 0.2, z: 0.9, timestamp: 123 };

    registeredListener?.(reading);
    await tick();

    expect(values[values.length - 1]).toEqual(reading);
  });

  it('removes the subscription on unmount', async () => {
    await mountMagnetometer([]);
    unmount(ROOT_TAG);

    expect(removeMock).toHaveBeenCalledTimes(1);
  });

  it('sets the update interval once at subscribe time when provided', async () => {
    await mountMagnetometer([], 50);

    expect(setUpdateIntervalMock).toHaveBeenCalledWith(50);
    expect(setUpdateIntervalMock).toHaveBeenCalledTimes(1);
  });

  it('does not touch the update interval when omitted', async () => {
    await mountMagnetometer([]);

    expect(setUpdateIntervalMock).not.toHaveBeenCalled();
  });
});
