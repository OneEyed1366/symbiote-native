// Co-located Svelte-driven test (ADR 0025) for useAssets — compile-then-dynamic-import, same
// pattern as packages/network's use-network-state.test.ts, since $state/$effect need a real
// component context.
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

const ROOT_TAG = 91_621;
const PROBE_OUT = join(__dirname, '.smoke-compiled-use-assets-probe.mjs');
const RUNE_OUT = join(__dirname, '.smoke-compiled-use-assets.svelte.mjs');

const STUB_MODULES = [1337, 2337];
const STUB_ASSETS = [
  { name: 'test-first', type: 'jpg', uri: 'non/existing' },
  { name: 'test-second', type: 'png', uri: 'non/existing' },
];

const { Asset } = vi.hoisted(() => ({
  Asset: { loadAsync: vi.fn(async () => STUB_ASSETS) },
}));
vi.mock('../../core', () => ({ Asset }));

const fabric = installRecordingFabric();
const tick = (): Promise<void> =>
  new Promise(resolve => setTimeout(resolve, 0));

beforeEach(() => {
  fabric.reset();
  Asset.loadAsync.mockClear();
  Asset.loadAsync.mockResolvedValue(STUB_ASSETS);
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
  const source = readFileSync(join(__dirname, 'use-assets.svelte.ts'), 'utf-8');
  writeFileSync(
    RUNE_OUT,
    compileSvelteModuleFile(source, 'use-assets.svelte.ts'),
  );
}

async function loadProbe(): Promise<Component> {
  compileRuneModule();
  const result = compile(
    `<script lang="ts">
       import { useAssets } from './.smoke-compiled-use-assets.svelte.mjs';
       let { onValue }: { onValue: (assets: unknown, error: unknown) => void } = $props();
       const result = useAssets([1337, 2337]);
       $effect(() => { onValue(result.assets, result.error); });
     </script>
     <view p={{}} />`,
    { ...COMPILE_OPTIONS, filename: 'AssetsProbe.svelte' },
  );
  writeFileSync(PROBE_OUT, result.js.code);
  const mod: unknown = await import(`file://${PROBE_OUT}`);
  if (mod === null || typeof mod !== 'object' || !('default' in mod)) {
    throw new Error('AssetsProbe.svelte produced no default export');
  }
  return mod.default as Component;
}

async function mountAssets(values: [unknown, unknown][]): Promise<void> {
  const Probe = await loadProbe();
  mount(ROOT_TAG, Probe, {
    onValue: (assets: unknown, error: unknown) => values.push([assets, error]),
  });
  await tick();
}

describe('useAssets (Svelte) — lifecycle (Positive)', () => {
  it('seeds undefined before the load resolves', async () => {
    Asset.loadAsync.mockReturnValue(new Promise<typeof STUB_ASSETS>(() => {}));
    const values: [unknown, unknown][] = [];
    await mountAssets(values);

    expect(values[values.length - 1]).toEqual([undefined, undefined]);
  });

  it('updates to the loaded assets once Asset.loadAsync resolves', async () => {
    const values: [unknown, unknown][] = [];
    await mountAssets(values);

    // Svelte's $state wraps assigned arrays in a reactive proxy — compare by value, not identity.
    await vi.waitFor(() =>
      expect(values[values.length - 1][0]).toEqual(STUB_ASSETS),
    );
    expect(Asset.loadAsync).toHaveBeenCalledWith(STUB_MODULES);
  });
});

describe('useAssets (Svelte) — error path (Positive)', () => {
  it('reports the rejection reason', async () => {
    const error = new Error('load failed');
    Asset.loadAsync.mockRejectedValue(error);

    const values: [unknown, unknown][] = [];
    await mountAssets(values);

    await vi.waitFor(() => expect(values[values.length - 1][1]).toBe(error));
  });
});
