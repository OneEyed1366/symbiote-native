// Co-located Svelte-driven test (ADR 0025) for useFonts — compile-then-dynamic-import, same
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

const ROOT_TAG = 91_622;
const PROBE_OUT = join(__dirname, '.smoke-compiled-use-fonts-probe.mjs');
const RUNE_OUT = join(__dirname, '.smoke-compiled-use-fonts.svelte.mjs');

const STUB_FONTS = {
  'OpenSans-Regular': 'path/to/font.ttf',
  'ComicSans-Regular': 'path/to/jailed/font.ttf',
};

const { loadAsync, isFontMapLoaded } = vi.hoisted(() => ({
  loadAsync: vi.fn(async () => {}),
  isFontMapLoaded: vi.fn(() => false),
}));
vi.mock('../../core', () => ({ loadAsync, isFontMapLoaded }));

const fabric = installRecordingFabric();
const tick = (): Promise<void> =>
  new Promise(resolve => setTimeout(resolve, 0));

beforeEach(() => {
  fabric.reset();
  vi.clearAllMocks();
  loadAsync.mockResolvedValue(undefined);
  isFontMapLoaded.mockReturnValue(false);
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
  const source = readFileSync(join(__dirname, 'use-fonts.svelte.ts'), 'utf-8');
  writeFileSync(
    RUNE_OUT,
    compileSvelteModuleFile(source, 'use-fonts.svelte.ts'),
  );
}

async function loadProbe(): Promise<Component> {
  compileRuneModule();
  const result = compile(
    `<script lang="ts">
       import { useFonts } from './.smoke-compiled-use-fonts.svelte.mjs';
       let { onValue }: { onValue: (loaded: boolean, error: unknown) => void } = $props();
       const result = useFonts({
         'OpenSans-Regular': 'path/to/font.ttf',
         'ComicSans-Regular': 'path/to/jailed/font.ttf',
       });
       $effect(() => { onValue(result.loaded, result.error); });
     </script>
     <view p={{}} />`,
    { ...COMPILE_OPTIONS, filename: 'FontsProbe.svelte' },
  );
  writeFileSync(PROBE_OUT, result.js.code);
  const mod: unknown = await import(`file://${PROBE_OUT}`);
  if (mod === null || typeof mod !== 'object' || !('default' in mod)) {
    throw new Error('FontsProbe.svelte produced no default export');
  }
  return mod.default as Component;
}

async function mountFonts(values: [boolean, unknown][]): Promise<void> {
  const Probe = await loadProbe();
  mount(ROOT_TAG, Probe, {
    onValue: (loaded: boolean, error: unknown) => values.push([loaded, error]),
  });
  await tick();
}

describe('useFonts (Svelte) — lifecycle (Positive)', () => {
  it('seeds loaded=false when isFontMapLoaded reports not-yet-loaded', async () => {
    loadAsync.mockReturnValue(new Promise<void>(() => {}));
    const values: [boolean, unknown][] = [];
    await mountFonts(values);

    expect(values[values.length - 1]).toEqual([false, null]);
  });

  it('seeds loaded=true synchronously when every font is already loaded', async () => {
    isFontMapLoaded.mockReturnValue(true);
    const values: [boolean, unknown][] = [];
    await mountFonts(values);

    expect(values[values.length - 1][0]).toBe(true);
  });

  it('updates to loaded once loadAsync resolves', async () => {
    const values: [boolean, unknown][] = [];
    await mountFonts(values);

    await vi.waitFor(() => expect(values[values.length - 1][0]).toBe(true));
    expect(loadAsync).toHaveBeenCalledWith(STUB_FONTS);
  });
});

describe('useFonts (Svelte) — error path (Positive)', () => {
  it('reports the rejection reason', async () => {
    const error = new Error('font load failed');
    loadAsync.mockRejectedValue(error);

    const values: [boolean, unknown][] = [];
    await mountFonts(values);

    await vi.waitFor(() => expect(values[values.length - 1][1]).toBe(error));
  });
});
