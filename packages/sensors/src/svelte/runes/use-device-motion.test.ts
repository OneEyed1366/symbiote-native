// Co-located Svelte-driven test (ADR 0025) for useDeviceMotion, the Svelte twin of
// react/hooks/use-device-motion and vue/composables/use-device-motion. See use-accelerometer's
// test for the shared rationale behind the compile-then-dynamic-import harness.

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { compile } from 'svelte/compiler';
import { readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { Component } from 'svelte';
import { mount, unmount } from '@symbiote-native/svelte/native-view-bridge';
import { installFabric } from '@symbiote-native/test-utils';
import type { IDeviceMotionMeasurement } from '../../core';
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

const ROOT_TAG = 91_652;
const PROBE_OUT = join(
  __dirname,
  '.smoke-compiled-use-device-motion-probe.mjs',
);
const RUNE_OUT = join(
  __dirname,
  '.smoke-compiled-use-device-motion.svelte.mjs',
);

type IListener = (measurement: IDeviceMotionMeasurement) => void;

let registeredListener: IListener | undefined;
const removeMock = vi.fn();
const addListenerMock = vi.fn((listener: IListener) => {
  registeredListener = listener;
  return { remove: removeMock };
});
const setUpdateIntervalMock = vi.fn();

vi.mock('../../core', () => ({
  DeviceMotion: {
    addListener: (listener: IListener) => addListenerMock(listener),
    removeAllListeners: vi.fn(),
    setUpdateInterval: (intervalMs: number) =>
      setUpdateIntervalMock(intervalMs),
  },
}));

const READING: IDeviceMotionMeasurement = {
  acceleration: { x: 0.1, y: 0.2, z: 0.3, timestamp: 123 },
  accelerationIncludingGravity: { x: 0.1, y: 0.2, z: 9.9, timestamp: 123 },
  rotation: { alpha: 1, beta: 2, gamma: 3, timestamp: 123 },
  rotationRate: { alpha: 0.1, beta: 0.2, gamma: 0.3, timestamp: 123 },
  interval: 16,
  orientation: 0, // DeviceMotionOrientation.Portrait
};

// A device that cannot isolate gravity from raw acceleration reports both `acceleration` and
// `rotationRate` as `null` (core/device-motion.ts's header comment) — the same READING shape but
// nulled out, and with a different orientation, to prove that shape reaches `current` untouched.
const UNGYRO_READING: IDeviceMotionMeasurement = {
  acceleration: null,
  accelerationIncludingGravity: { x: 0.0, y: 0.0, z: 9.8, timestamp: 456 },
  rotation: { alpha: 4, beta: 5, gamma: 6, timestamp: 456 },
  rotationRate: null,
  interval: 16,
  orientation: 90, // DeviceMotionOrientation.RightLandscape
};

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
    join(__dirname, 'use-device-motion.svelte.ts'),
    'utf-8',
  );
  writeFileSync(
    RUNE_OUT,
    compileSvelteModuleFile(source, 'use-device-motion.svelte.ts'),
  );
}

async function loadProbe(): Promise<Component> {
  compileRuneModule();
  const result = compile(
    `<script lang="ts">
       import { useDeviceMotion } from './.smoke-compiled-use-device-motion.svelte.mjs';
       let { updateIntervalMs, onValue }: {
         updateIntervalMs: number | undefined;
         onValue: (measurement: unknown) => void;
       } = $props();
       const measurement = useDeviceMotion(updateIntervalMs);
       $effect(() => { onValue(measurement.current); });
     </script>
     <symbiote-view p={{}} />`,
    { ...COMPILE_OPTIONS, filename: 'DeviceMotionProbe.svelte' },
  );
  writeFileSync(PROBE_OUT, result.js.code);
  const mod: unknown = await import(`file://${PROBE_OUT}`);
  if (mod === null || typeof mod !== 'object' || !('default' in mod)) {
    throw new Error('DeviceMotionProbe.svelte produced no default export');
  }
  return mod.default as Component;
}

async function mountDeviceMotion(
  values: (IDeviceMotionMeasurement | null)[],
  updateIntervalMs?: number,
): Promise<void> {
  const Probe = await loadProbe();
  mount(ROOT_TAG, Probe, {
    updateIntervalMs,
    onValue: (measurement: IDeviceMotionMeasurement | null) =>
      values.push(measurement),
  });
  await tick();
}

describe('useDeviceMotion (Svelte)', () => {
  // No Negative group: useDeviceMotion has no guard clause or throwing path — every accepted
  // updateIntervalMs value (or its absence) and every IDeviceMotionMeasurement the native
  // listener can deliver reaches `current` unchanged. Only the shared lifecycle wiring (subscribe
  // once on mount, replace state on each event, unsubscribe on unmount) is under test here;
  // DeviceSensor's own methods are not called by this rune and are covered by
  // core/device-motion.test.ts.
  describe('Positive (subscribe -> update -> cleanup lifecycle)', () => {
    // why: a consumer renders BEFORE the first native event can possibly arrive, so `current`
    // must expose a real "no reading yet" value rather than staying `undefined` or throwing.
    it('starts null before any measurement arrives', async () => {
      const values: (IDeviceMotionMeasurement | null)[] = [];
      await mountDeviceMotion(values);

      expect(values[values.length - 1]).toBeNull();
    });

    // why: the effect body writes `measurement` but never reads it, so it must run exactly once
    // on mount and never re-subscribe on its own — a double subscription would mean double
    // native event delivery per commit.
    it('subscribes to the native module exactly once on mount', async () => {
      await mountDeviceMotion([]);

      expect(addListenerMock).toHaveBeenCalledTimes(1);
    });

    // why: the whole point of the rune is to mirror the native module's push events into
    // reactive state, so a fired event — including its nested acceleration/rotation/rotationRate
    // objects and orientation enum — must be visible through `current` unchanged.
    it('updates the state when the native listener fires', async () => {
      const values: (IDeviceMotionMeasurement | null)[] = [];
      await mountDeviceMotion(values);

      registeredListener?.(READING);
      await tick();

      expect(values[values.length - 1]).toEqual(READING);
    });

    // why: `acceleration`/`rotationRate` legitimately go from a real reading to `null` on a device
    // that can no longer isolate gravity (core/device-motion.ts's header comment) — a merge bug
    // would leave the STALE prior object behind instead of surfacing the new `null`.
    // `measurement = next` is a plain reassignment, and this is the scenario that proves it.
    it('replaces the previous reading, not merges it, when a later event nulls a field', async () => {
      const values: (IDeviceMotionMeasurement | null)[] = [];
      await mountDeviceMotion(values);

      registeredListener?.(READING);
      await tick();
      registeredListener?.(UNGYRO_READING);
      await tick();

      expect(values[values.length - 1]).toEqual(UNGYRO_READING);
      expect(values[values.length - 1]?.acceleration).toBeNull();
    });

    // why: an active native subscription after the consuming component is gone leaks a listener
    // and keeps the sensor powered on the device for nothing.
    it('removes the subscription on unmount', async () => {
      await mountDeviceMotion([]);
      unmount(ROOT_TAG);

      expect(removeMock).toHaveBeenCalledTimes(1);
    });

    // why: the caller-supplied sample rate must reach the native module, applied once at subscribe
    // time (not on every render) per the rune's header comment on why `updateIntervalMs` is a
    // plain number, not a reactive getter.
    it('sets the update interval once at subscribe time when provided', async () => {
      await mountDeviceMotion([], 50);

      expect(setUpdateIntervalMock).toHaveBeenCalledWith(50);
      expect(setUpdateIntervalMock).toHaveBeenCalledTimes(1);
    });

    // why: an omitted interval must leave the native module's own default sample rate alone —
    // calling setUpdateInterval with an undefined/fallback value would silently override it.
    it('does not touch the update interval when omitted', async () => {
      await mountDeviceMotion([]);

      expect(setUpdateIntervalMock).not.toHaveBeenCalled();
    });
  });
});
