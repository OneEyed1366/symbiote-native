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
  // No Negative group: usePedometer has no guard clause or throwing path — every
  // IPedometerResult the native `watchStepCount` listener can deliver reaches `current`
  // unchanged. Only the shared subscribe/update/cleanup lifecycle is under test here; Pedometer's
  // own free functions (getStepCountAsync, isAvailableAsync, get/requestPermissionsAsync — see
  // core/pedometer.ts's header on why Pedometer has no DeviceSensor instance to hang them off)
  // are not called by this rune at all and are covered by core/pedometer.test.ts. There is also
  // no update-interval branch here, unlike every other sensor rune: Pedometer has no
  // setUpdateInterval upstream (core/pedometer.ts), so usePedometer takes no interval param at
  // all — nothing to assert either provided or omitted.
  describe('Positive (subscribe -> update -> cleanup lifecycle)', () => {
    // why: a consumer renders BEFORE the first native event can possibly arrive, so `current`
    // must expose a real "no reading yet" value rather than staying `undefined` or throwing.
    it('starts null before any step count arrives', async () => {
      const values: (IPedometerResult | null)[] = [];
      await mountPedometer(values);

      expect(values[values.length - 1]).toBeNull();
    });

    // why: the effect body writes `result` but never reads it, so it must run exactly once on
    // mount and never re-subscribe on its own — a double subscription would mean double native
    // event delivery per commit.
    it('subscribes to watchStepCount exactly once on mount', async () => {
      await mountPedometer([]);

      expect(watchStepCountMock).toHaveBeenCalledTimes(1);
    });

    // why: the whole point of the rune is to mirror the native module's push events (cumulative
    // step count) into reactive state, so a fired event must be visible through `current`.
    it('updates the state when the native listener fires', async () => {
      const values: (IPedometerResult | null)[] = [];
      await mountPedometer(values);
      const reading: IPedometerResult = { steps: 456 };

      registeredListener?.(reading);
      await tick();

      expect(values[values.length - 1]).toEqual(reading);
    });

    // why: `result = next` is a plain reassignment, not a merge or an accumulator — a later event
    // reporting a NEWER step count must fully REPLACE the earlier one rather than summing with it.
    it('replaces the previous step count, not merges it, on a second native event', async () => {
      const values: (IPedometerResult | null)[] = [];
      await mountPedometer(values);
      const first: IPedometerResult = { steps: 100 };
      const second: IPedometerResult = { steps: 456 };

      registeredListener?.(first);
      await tick();
      registeredListener?.(second);
      await tick();

      expect(values[values.length - 1]).toEqual(second);
    });

    // why: an active native subscription after the consuming component is gone leaks a listener
    // and keeps the step counter delivering events for nothing.
    it('removes the subscription on unmount', async () => {
      await mountPedometer([]);
      unmount(ROOT_TAG);

      expect(removeMock).toHaveBeenCalledTimes(1);
    });
  });
});
