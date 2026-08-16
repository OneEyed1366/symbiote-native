// Co-located Svelte-driven test (ADR 0025) for useLowPowerMode. See use-battery-level.test.ts for
// the shared rationale.

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

const ROOT_TAG = 91_603;
const PROBE_OUT = join(__dirname, '.smoke-compiled-use-low-power-mode-probe.mjs');
const RUNE_OUT = join(__dirname, '.smoke-compiled-use-low-power-mode.svelte.mjs');

type IListener = (event: { lowPowerMode: boolean }) => void;

let registeredListener: IListener | undefined;
const removeMock = vi.fn();
const addListenerMock = vi.fn((listener: IListener) => {
  registeredListener = listener;
  return { remove: removeMock };
});
const isLowPowerModeEnabledAsyncMock = vi.fn(async () => true);

vi.mock('../../core', () => ({
  addLowPowerModeListener: (listener: IListener) => addListenerMock(listener),
  isLowPowerModeEnabledAsync: () => isLowPowerModeEnabledAsyncMock(),
}));

const fabric = installFabric();
const tick = (): Promise<void> => new Promise(resolve => setTimeout(resolve, 0));

beforeEach(() => {
  fabric.reset();
  registeredListener = undefined;
  addListenerMock.mockClear();
  removeMock.mockClear();
  isLowPowerModeEnabledAsyncMock.mockClear();
  isLowPowerModeEnabledAsyncMock.mockResolvedValue(true);
});

afterEach(() => {
  unmount(ROOT_TAG);
  rmSync(PROBE_OUT, { force: true });
  rmSync(RUNE_OUT, { force: true });
});

const COMPILE_OPTIONS = { generate: 'client', fragments: 'tree', css: 'external' } as const;

function compileRuneModule(): void {
  const source = readFileSync(join(__dirname, 'use-low-power-mode.svelte.ts'), 'utf-8');
  writeFileSync(RUNE_OUT, compileSvelteModuleFile(source, 'use-low-power-mode.svelte.ts'));
}

async function loadProbe(): Promise<Component> {
  compileRuneModule();
  const result = compile(
    `<script lang="ts">
       import { useLowPowerMode } from './.smoke-compiled-use-low-power-mode.svelte.mjs';
       let { onValue }: { onValue: (enabled: boolean) => void } = $props();
       const lowPowerMode = useLowPowerMode();
       $effect(() => { onValue(lowPowerMode.current); });
     </script>
     <symbiote-view p={{}} />`,
    { ...COMPILE_OPTIONS, filename: 'LowPowerModeProbe.svelte' },
  );
  writeFileSync(PROBE_OUT, result.js.code);
  const mod: unknown = await import(`file://${PROBE_OUT}`);
  if (mod === null || typeof mod !== 'object' || !('default' in mod)) {
    throw new Error('LowPowerModeProbe.svelte produced no default export');
  }
  return mod.default as Component;
}

async function mountLowPowerMode(): Promise<boolean[]> {
  const values: boolean[] = [];
  const Probe = await loadProbe();
  mount(ROOT_TAG, Probe, { onValue: (enabled: boolean) => values.push(enabled) });
  await tick();
  return values;
}

// No Negative group: the effect body has no guard clause or conditional throw — every path
// through it (the one-shot fetch, the native listener, the teardown) only ever writes
// `lowPowerMode` or unsubscribes. There is nothing here that is meant to reject/throw.
describe('useLowPowerMode (Svelte)', () => {
  describe('Positive — boxed value tracks the fetch, the native listener, and unmount', () => {
    // why: `false` (not enabled) is the safe default before the device is actually asked — a
    // consumer must never see a stale "true" before the first real check has happened.
    it('starts at false before the initial fetch resolves', async () => {
      const values = await mountLowPowerMode();

      expect(values[0]).toBe(false);
    });

    // why: matches upstream useLowPowerMode — a one-shot fetch seeds the real device state before
    // the first native event, so a consumer never reads the default longer than the fetch takes.
    it('updates to the fetched value once isLowPowerModeEnabledAsync() resolves', async () => {
      const values = await mountLowPowerMode();

      await vi.waitFor(() => expect(values[values.length - 1]).toBe(true));
    });

    // why: low-power mode can be toggled by the user at any time — the rune exists to stay in
    // sync with that live device signal, not just report a one-time snapshot at mount.
    it('updates the boxed value when the native listener fires', async () => {
      isLowPowerModeEnabledAsyncMock.mockResolvedValue(false);
      const values = await mountLowPowerMode();
      await vi.waitFor(() => expect(values[values.length - 1]).toBe(false));

      registeredListener?.({ lowPowerMode: true });

      await vi.waitFor(() => expect(values[values.length - 1]).toBe(true));
    });

    // why: a rune that outlives its subscription leaks a live native listener into a scope Svelte
    // already considers destroyed — the effect's teardown is what prevents that leak.
    it('removes the subscription on unmount', async () => {
      await mountLowPowerMode();

      unmount(ROOT_TAG);

      expect(removeMock).toHaveBeenCalledTimes(1);
    });
  });
});
