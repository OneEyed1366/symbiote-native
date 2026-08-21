// Co-located Svelte-driven test (ADR 0025) for useBarometer, the Svelte twin of
// react/hooks/use-barometer and vue/composables/use-barometer. See use-accelerometer's test for
// the shared rationale behind the compile-then-dynamic-import harness.

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { compile } from 'svelte/compiler';
import { readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { Component } from 'svelte';
import { mount, unmount } from '@symbiote-native/svelte/native-view-bridge';
import { installFabric } from '@symbiote-native/test-utils';
import type { IBarometerMeasurement } from '../../core';
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

const ROOT_TAG = 91_651;
const PROBE_OUT = join(__dirname, '.smoke-compiled-use-barometer-probe.mjs');
const RUNE_OUT = join(__dirname, '.smoke-compiled-use-barometer.svelte.mjs');

type IListener = (measurement: IBarometerMeasurement) => void;

let registeredListener: IListener | undefined;
const removeMock = vi.fn();
const addListenerMock = vi.fn((listener: IListener) => {
  registeredListener = listener;
  return { remove: removeMock };
});
const setUpdateIntervalMock = vi.fn();

vi.mock('../../core', () => ({
  Barometer: {
    addListener: (listener: IListener) => addListenerMock(listener),
    removeAllListeners: vi.fn(),
    setUpdateInterval: (intervalMs: number) =>
      setUpdateIntervalMock(intervalMs),
  },
}));

const fabric = installFabric();
const tick = (): Promise<void> =>
  new Promise(resolve => setTimeout(resolve, 0));

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

const COMPILE_OPTIONS = {
  generate: 'client',
  fragments: 'tree',
  css: 'external',
} as const;

function compileRuneModule(): void {
  const source = readFileSync(
    join(__dirname, 'use-barometer.svelte.ts'),
    'utf-8',
  );
  writeFileSync(
    RUNE_OUT,
    compileSvelteModuleFile(source, 'use-barometer.svelte.ts'),
  );
}

async function loadProbe(): Promise<Component> {
  compileRuneModule();
  const result = compile(
    `<script lang="ts">
       import { useBarometer } from './.smoke-compiled-use-barometer.svelte.mjs';
       let { updateIntervalMs, onValue }: {
         updateIntervalMs: number | undefined;
         onValue: (measurement: unknown) => void;
       } = $props();
       const measurement = useBarometer(updateIntervalMs);
       $effect(() => { onValue(measurement.current); });
     </script>
     <symbiote-view p={{}} />`,
    { ...COMPILE_OPTIONS, filename: 'BarometerProbe.svelte' },
  );
  writeFileSync(PROBE_OUT, result.js.code);
  const mod: unknown = await import(`file://${PROBE_OUT}`);
  if (mod === null || typeof mod !== 'object' || !('default' in mod)) {
    throw new Error('BarometerProbe.svelte produced no default export');
  }
  return mod.default as Component;
}

async function mountBarometer(
  values: (IBarometerMeasurement | null)[],
  updateIntervalMs?: number,
): Promise<void> {
  const Probe = await loadProbe();
  mount(ROOT_TAG, Probe, {
    updateIntervalMs,
    onValue: (measurement: IBarometerMeasurement | null) =>
      values.push(measurement),
  });
  await tick();
}

describe('useBarometer (Svelte)', () => {
  // No Negative group: useBarometer has no guard clause or throwing path — every accepted
  // updateIntervalMs value (or its absence) and every IBarometerMeasurement the native listener
  // can deliver reaches `current` unchanged. Only the shared lifecycle wiring (subscribe once on
  // mount, replace state on each event, unsubscribe on unmount) is under test here; DeviceSensor's
  // own methods are not called by this rune at all and are covered by core/barometer.test.ts.
  describe('Positive (subscribe -> update -> cleanup lifecycle)', () => {
    // why: a consumer renders BEFORE the first native event can possibly arrive, so `current`
    // must expose a real "no reading yet" value rather than staying `undefined` or throwing.
    it('starts null before any measurement arrives', async () => {
      const values: (IBarometerMeasurement | null)[] = [];
      await mountBarometer(values);

      expect(values[values.length - 1]).toBeNull();
    });

    // why: the effect body writes `measurement` but never reads it, so it must run exactly once
    // on mount and never re-subscribe on its own — a double subscription would mean double
    // native event delivery per commit.
    it('subscribes to the native module exactly once on mount', async () => {
      await mountBarometer([]);

      expect(addListenerMock).toHaveBeenCalledTimes(1);
    });

    // why: the whole point of the rune is to mirror the native module's push events into
    // reactive state, so a fired event must be visible through `current`.
    it('updates the state when the native listener fires', async () => {
      const values: (IBarometerMeasurement | null)[] = [];
      await mountBarometer(values);
      const reading: IBarometerMeasurement = {
        pressure: 1013.25,
        relativeAltitude: 12.3,
        timestamp: 123,
      };

      registeredListener?.(reading);
      await tick();

      expect(values[values.length - 1]).toEqual(reading);
    });

    // why: `relativeAltitude` is iOS-only and optional (core/barometer.ts's header comment) — an
    // Android-shaped event that omits it must fully REPLACE an earlier iOS-shaped reading, not
    // merge and leave a stale `relativeAltitude` behind. `measurement = next` is a plain
    // reassignment, and this is the scenario that would expose a merge bug.
    it('drops a stale relativeAltitude when a later event omits it', async () => {
      const values: (IBarometerMeasurement | null)[] = [];
      await mountBarometer(values);
      const iosReading: IBarometerMeasurement = {
        pressure: 1013.25,
        relativeAltitude: 12.3,
        timestamp: 123,
      };
      const androidReading: IBarometerMeasurement = {
        pressure: 1009.5,
        timestamp: 456,
      };

      registeredListener?.(iosReading);
      await tick();
      registeredListener?.(androidReading);
      await tick();

      expect(values[values.length - 1]).toEqual(androidReading);
      expect(values[values.length - 1]).not.toHaveProperty('relativeAltitude');
    });

    // why: an active native subscription after the consuming component is gone leaks a listener
    // and keeps the sensor powered on the device for nothing.
    it('removes the subscription on unmount', async () => {
      await mountBarometer([]);
      unmount(ROOT_TAG);

      expect(removeMock).toHaveBeenCalledTimes(1);
    });

    // why: the caller-supplied sample rate must reach the native module, applied once at subscribe
    // time (not on every render) per the rune's header comment on why `updateIntervalMs` is a
    // plain number, not a reactive getter.
    it('sets the update interval once at subscribe time when provided', async () => {
      await mountBarometer([], 50);

      expect(setUpdateIntervalMock).toHaveBeenCalledWith(50);
      expect(setUpdateIntervalMock).toHaveBeenCalledTimes(1);
    });

    // why: an omitted interval must leave the native module's own default sample rate alone —
    // calling setUpdateInterval with an undefined/fallback value would silently override it.
    it('does not touch the update interval when omitted', async () => {
      await mountBarometer([]);

      expect(setUpdateIntervalMock).not.toHaveBeenCalled();
    });
  });
});
