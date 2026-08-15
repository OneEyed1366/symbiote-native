// Co-located Svelte-driven test (ADR 0025) for useBatteryLevel, the Svelte twin of
// vue/composables/use-battery-level's own test. Mocks the whole core module (never
// expo-modules-core internals) since this exercises rune mount/unmount lifecycle timing, not any
// native view — there is none here, so no ViewConfig fixture is needed. Runs the rune inside a
// REAL compiled .svelte component — same compile-then-dynamic-import pattern as
// packages/splash-screen/src/svelte/runes/use-hide-animation.test.ts — because $state/$effect
// require a real component context, unlike Vue's composable which can run under a bare
// effectScope().

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { compile } from 'svelte/compiler';
import { readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { Component } from 'svelte';
// The .svelte-free subpath — the main barrel re-exports real .svelte component sources, which
// vitest's plain (svelte-plugin-free) test transform cannot parse.
import { mount, unmount } from '@symbiote-native/svelte/native-view-bridge';
import { installFabric } from '@symbiote-native/test-utils';
// The real Metro pipeline's own .svelte.ts compile step (strips TS via ts.transpileModule, then
// desugars runes via compileModule) — reused here so this test exercises the actual shipped
// compile path, not a parallel implementation of it. Default-imported since it's a .cjs module.
import metroSvelteTransformer from '@symbiote-native/svelte/metro-svelte-transformer';

const {
  compileSvelteModuleFile,
}: { compileSvelteModuleFile: (src: string, filename: string) => string } = metroSvelteTransformer;

if (globalThis.window === undefined) Object.assign(globalThis, { window: globalThis });
if (globalThis.navigator === undefined) {
  Object.assign(globalThis, { navigator: { product: 'ReactNative' } });
}

const ROOT_TAG = 91_601;
const PROBE_OUT = join(__dirname, '.smoke-compiled-use-battery-level-probe.mjs');
const RUNE_OUT = join(__dirname, '.smoke-compiled-use-battery-level.svelte.mjs');

type IListener = (event: { batteryLevel: number }) => void;

let registeredListener: IListener | undefined;
const removeMock = vi.fn();
const addListenerMock = vi.fn((listener: IListener) => {
  registeredListener = listener;
  return { remove: removeMock };
});
const getBatteryLevelAsyncMock = vi.fn(async () => 0.42);

vi.mock('../../core', () => ({
  addBatteryLevelListener: (listener: IListener) => addListenerMock(listener),
  getBatteryLevelAsync: () => getBatteryLevelAsyncMock(),
}));

const fabric = installFabric();
const tick = (): Promise<void> => new Promise(resolve => setTimeout(resolve, 0));

beforeEach(() => {
  fabric.reset();
  registeredListener = undefined;
  addListenerMock.mockClear();
  removeMock.mockClear();
  getBatteryLevelAsyncMock.mockClear();
  getBatteryLevelAsyncMock.mockResolvedValue(0.42);
});

afterEach(() => {
  unmount(ROOT_TAG);
  rmSync(PROBE_OUT, { force: true });
  rmSync(RUNE_OUT, { force: true });
});

const COMPILE_OPTIONS = { generate: 'client', fragments: 'tree', css: 'external' } as const;

// $state/$effect need Svelte's MODULE compiler, not the component compiler — a bare, uncompiled
// rune call throws `rune_outside_svelte` at runtime.
function compileRuneModule(): void {
  const source = readFileSync(join(__dirname, 'use-battery-level.svelte.ts'), 'utf-8');
  writeFileSync(RUNE_OUT, compileSvelteModuleFile(source, 'use-battery-level.svelte.ts'));
}

async function loadProbe(): Promise<Component> {
  compileRuneModule();
  const result = compile(
    `<script lang="ts">
       import { useBatteryLevel } from './.smoke-compiled-use-battery-level.svelte.mjs';
       let { onValue }: { onValue: (level: number) => void } = $props();
       const batteryLevel = useBatteryLevel();
       $effect(() => { onValue(batteryLevel.current); });
     </script>
     <symbiote-view p={{}} />`,
    { ...COMPILE_OPTIONS, filename: 'BatteryLevelProbe.svelte' },
  );
  writeFileSync(PROBE_OUT, result.js.code);
  const mod: unknown = await import(`file://${PROBE_OUT}`);
  if (mod === null || typeof mod !== 'object' || !('default' in mod)) {
    throw new Error('BatteryLevelProbe.svelte produced no default export');
  }
  return mod.default as Component;
}

async function mountBatteryLevel(): Promise<number[]> {
  const values: number[] = [];
  const Probe = await loadProbe();
  mount(ROOT_TAG, Probe, { onValue: (level: number) => values.push(level) });
  await tick();
  return values;
}

describe('useBatteryLevel (Svelte)', () => {
  it('starts at -1 before the initial fetch resolves', async () => {
    const values = await mountBatteryLevel();

    expect(values[0]).toBe(-1);
  });

  it('updates to the fetched value once getBatteryLevelAsync() resolves', async () => {
    const values = await mountBatteryLevel();

    await vi.waitFor(() => expect(values[values.length - 1]).toBe(0.42));
  });

  it('updates the boxed value when the native listener fires', async () => {
    const values = await mountBatteryLevel();
    await vi.waitFor(() => expect(values[values.length - 1]).toBe(0.42));

    registeredListener?.({ batteryLevel: 0.1 });

    await vi.waitFor(() => expect(values[values.length - 1]).toBe(0.1));
  });

  it('removes the subscription on unmount', async () => {
    await mountBatteryLevel();

    unmount(ROOT_TAG);

    expect(removeMock).toHaveBeenCalledTimes(1);
  });
});
