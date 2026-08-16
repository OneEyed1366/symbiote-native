// Co-located Svelte-driven test (ADR 0025) for useAccelerometer, the Svelte twin of
// react/hooks/use-accelerometer and vue/composables/use-accelerometer. Mocks the whole core module
// (never expo-modules-core internals) since this exercises rune mount/unmount lifecycle timing,
// not any native view. Runs the rune inside a REAL compiled .svelte component — same
// compile-then-dynamic-import pattern as
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
import type { IAccelerometerMeasurement } from '../../core';
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

const ROOT_TAG = 91_650;
const PROBE_OUT = join(__dirname, '.smoke-compiled-use-accelerometer-probe.mjs');
const RUNE_OUT = join(__dirname, '.smoke-compiled-use-accelerometer.svelte.mjs');

type IListener = (measurement: IAccelerometerMeasurement) => void;

let registeredListener: IListener | undefined;
const removeMock = vi.fn();
const addListenerMock = vi.fn((listener: IListener) => {
  registeredListener = listener;
  return { remove: removeMock };
});
const setUpdateIntervalMock = vi.fn();

vi.mock('../../core', () => ({
  Accelerometer: {
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

// $state/$effect require Svelte's MODULE compiler, not the component compiler — a bare,
// uncompiled rune call throws `rune_outside_svelte` at runtime.
function compileRuneModule(): void {
  const source = readFileSync(join(__dirname, 'use-accelerometer.svelte.ts'), 'utf-8');
  writeFileSync(RUNE_OUT, compileSvelteModuleFile(source, 'use-accelerometer.svelte.ts'));
}

async function loadProbe(): Promise<Component> {
  compileRuneModule();
  const result = compile(
    `<script lang="ts">
       import { useAccelerometer } from './.smoke-compiled-use-accelerometer.svelte.mjs';
       let { updateIntervalMs, onValue }: {
         updateIntervalMs: number | undefined;
         onValue: (measurement: unknown) => void;
       } = $props();
       const measurement = useAccelerometer(updateIntervalMs);
       $effect(() => { onValue(measurement.current); });
     </script>
     <symbiote-view p={{}} />`,
    { ...COMPILE_OPTIONS, filename: 'AccelerometerProbe.svelte' },
  );
  writeFileSync(PROBE_OUT, result.js.code);
  const mod: unknown = await import(`file://${PROBE_OUT}`);
  if (mod === null || typeof mod !== 'object' || !('default' in mod)) {
    throw new Error('AccelerometerProbe.svelte produced no default export');
  }
  return mod.default as Component;
}

async function mountAccelerometer(
  values: (IAccelerometerMeasurement | null)[],
  updateIntervalMs?: number,
): Promise<void> {
  const Probe = await loadProbe();
  mount(ROOT_TAG, Probe, {
    updateIntervalMs,
    onValue: (measurement: IAccelerometerMeasurement | null) => values.push(measurement),
  });
  await tick();
}

describe('useAccelerometer (Svelte)', () => {
  // No Negative group: useAccelerometer has no guard clause or throwing path — every accepted
  // updateIntervalMs value (or its absence) and every IAccelerometerMeasurement the native
  // listener can deliver reaches `current` unchanged. Only the shared lifecycle wiring
  // (subscribe once on mount, replace state on each event, unsubscribe on unmount) is under
  // test here; DeviceSensor's own methods (isAvailableAsync, getPermissionsAsync, ...) are not
  // called by this rune at all and are covered by core/accelerometer.test.ts instead.
  describe('Positive (subscribe -> update -> cleanup lifecycle)', () => {
    // why: a consumer renders BEFORE the first native event can possibly arrive, so `current`
    // must expose a real "no reading yet" value rather than staying `undefined` or throwing.
    it('starts null before any measurement arrives', async () => {
      const values: (IAccelerometerMeasurement | null)[] = [];
      await mountAccelerometer(values);

      expect(values[values.length - 1]).toBeNull();
    });

    // why: the effect body writes `measurement` but never reads it, so it must run exactly once
    // on mount and never re-subscribe on its own — a double subscription would mean double
    // native event delivery per commit.
    it('subscribes to the native module exactly once on mount', async () => {
      await mountAccelerometer([]);

      expect(addListenerMock).toHaveBeenCalledTimes(1);
    });

    // why: the whole point of the rune is to mirror the native module's push events into
    // reactive state, so a fired event must be visible through `current`.
    it('updates the state when the native listener fires', async () => {
      const values: (IAccelerometerMeasurement | null)[] = [];
      await mountAccelerometer(values);
      const reading: IAccelerometerMeasurement = { x: 0.1, y: 0.2, z: 0.9, timestamp: 123 };

      registeredListener?.(reading);
      await tick();

      expect(values[values.length - 1]).toEqual(reading);
    });

    // why: `measurement = next` is a plain reassignment, not a merge — a second event must fully
    // REPLACE the first reading. A merge bug would leave stale axis values behind when a later
    // event only carries a subset of fields.
    it('replaces the previous reading, not merges it, on a second native event', async () => {
      const values: (IAccelerometerMeasurement | null)[] = [];
      await mountAccelerometer(values);
      const first: IAccelerometerMeasurement = { x: 0.1, y: 0.2, z: 0.9, timestamp: 123 };
      const second: IAccelerometerMeasurement = { x: -0.4, y: 0.05, z: 0.7, timestamp: 456 };

      registeredListener?.(first);
      await tick();
      registeredListener?.(second);
      await tick();

      expect(values[values.length - 1]).toEqual(second);
    });

    // why: an active native subscription after the consuming component is gone leaks a listener
    // and keeps the sensor powered on the device for nothing.
    it('removes the subscription on unmount', async () => {
      await mountAccelerometer([]);
      unmount(ROOT_TAG);

      expect(removeMock).toHaveBeenCalledTimes(1);
    });

    // why: the caller-supplied sample rate must reach the native module, and it is applied once
    // at subscribe time (not on every render) per the rune's own header comment on why
    // `updateIntervalMs` is a plain number, not a reactive getter.
    it('sets the update interval once at subscribe time when provided', async () => {
      await mountAccelerometer([], 50);

      expect(setUpdateIntervalMock).toHaveBeenCalledWith(50);
      expect(setUpdateIntervalMock).toHaveBeenCalledTimes(1);
    });

    // why: an omitted interval must leave the native module's own default sample rate alone —
    // calling setUpdateInterval with an undefined/fallback value would silently override it.
    it('does not touch the update interval when omitted', async () => {
      await mountAccelerometer([]);

      expect(setUpdateIntervalMock).not.toHaveBeenCalled();
    });
  });
});
