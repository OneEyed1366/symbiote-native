// `useWindowDimensions` and `useColorScheme` of Svelte inside a real compiled component, т.к. the
// runes need the module compiler and `$effect` needs a component, as in `window.test.ts`

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { compile } from 'svelte/compiler';
import { readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { Component } from 'svelte';
import {
  Appearance,
  Dimensions,
  type IColorSchemeName,
  type IDimensionsPayload,
} from '@symbiote-native/engine';
import { installRecordingFabric } from '@symbiote-native/test-utils';
import metroSvelteTransformer from '@symbiote-native/svelte/metro-svelte-transformer';
import { mount, unmount } from '../render';

const {
  compileSvelteModuleFile,
}: { compileSvelteModuleFile: (src: string, filename: string) => string } =
  metroSvelteTransformer;

if (globalThis.window === undefined)
  Object.assign(globalThis, { window: globalThis });
if (globalThis.navigator === undefined) {
  Object.assign(globalThis, { navigator: { product: 'ReactNative' } });
}

const ROOT_TAG = 91_941;
// A probe file per rune, т.к. the import cache is keyed by path and a shared one would replay
const DIMENSIONS_PROBE_OUT = join(
  __dirname,
  '.smoke-compiled-probe-dimensions.mjs',
);
const SCHEME_PROBE_OUT = join(__dirname, '.smoke-compiled-probe-scheme.mjs');
const DIMENSIONS_OUT = join(
  __dirname,
  '.smoke-compiled-use-window-dimensions.mjs',
);
const SCHEME_OUT = join(__dirname, '.smoke-compiled-use-color-scheme.mjs');

const INITIAL: IDimensionsPayload = {
  window: { width: 400, height: 800, scale: 3, fontScale: 1 },
  screen: { width: 410, height: 900, scale: 3, fontScale: 1 },
};
const ROTATED: IDimensionsPayload = {
  window: { width: 800, height: 400, scale: 3, fontScale: 1 },
  screen: { width: 900, height: 410, scale: 3, fontScale: 1 },
};

const fabric = installRecordingFabric();
const tick = (): Promise<void> =>
  new Promise(resolve => setTimeout(resolve, 0));

type ISchemeListener = (preferences: {
  colorScheme: IColorSchemeName | null;
}) => void;

let schemeListener: ISchemeListener | undefined;
const removeScheme = vi.fn();

beforeEach(() => {
  fabric.reset();
  schemeListener = undefined;
  removeScheme.mockClear();
  Dimensions.set(INITIAL);
  vi.spyOn(Appearance, 'getColorScheme').mockImplementation(() => 'light');
  vi.spyOn(Appearance, 'addChangeListener').mockImplementation(next => {
    schemeListener = next;
    return { remove: removeScheme };
  });
});

afterEach(() => {
  unmount(ROOT_TAG);
  vi.restoreAllMocks();
  rmSync(DIMENSIONS_PROBE_OUT, { force: true });
  rmSync(SCHEME_PROBE_OUT, { force: true });
  rmSync(DIMENSIONS_OUT, { force: true });
  rmSync(SCHEME_OUT, { force: true });
});

type IRune = { source: string; out: string; probeOut: string; name: string };

const DIMENSIONS_RUNE: IRune = {
  source: 'use-window-dimensions.svelte.ts',
  out: DIMENSIONS_OUT,
  probeOut: DIMENSIONS_PROBE_OUT,
  name: 'useWindowDimensions',
};
const SCHEME_RUNE: IRune = {
  source: 'use-color-scheme.svelte.ts',
  out: SCHEME_OUT,
  probeOut: SCHEME_PROBE_OUT,
  name: 'useColorScheme',
};

// Mounts a probe that reports the rune's value from an effect and returns what it reported
async function mountProbe<T>(rune: IRune): Promise<T[]> {
  writeFileSync(
    rune.out,
    compileSvelteModuleFile(
      readFileSync(join(__dirname, rune.source), 'utf-8'),
      rune.source,
    ),
  );
  const code = compile(
    `<script lang="ts">
       import { ${rune.name} } from '${rune.out}';
       let { onValue }: { onValue: (value: unknown) => void } = $props();
       const rune = ${rune.name}();
       $effect(() => { onValue(rune.current); });
     </script>
     <view p={{}} />`,
    {
      generate: 'client',
      fragments: 'tree',
      css: 'external',
      filename: 'DeviceProbe.svelte',
    },
  ).js.code;
  writeFileSync(rune.probeOut, code);
  const mod: unknown = await import(`file://${rune.probeOut}`);
  if (mod === null || typeof mod !== 'object' || !('default' in mod)) {
    throw new Error('DeviceProbe.svelte produced no default export');
  }
  const probe: unknown = mod.default;
  if (typeof probe !== 'function')
    throw new Error('DeviceProbe.svelte default export is not a component');
  const values: T[] = [];
  const component: Component = probe;
  mount(ROOT_TAG, component, { onValue: (value: T) => values.push(value) });
  await tick();
  return values;
}

describe('useWindowDimensions (Svelte)', () => {
  it('starts from the current window metrics', async () => {
    const values = await mountProbe(DIMENSIONS_RUNE);

    expect(values.at(-1)).toEqual(INITIAL.window);
  });

  it('holds the new metrics once the window changes', async () => {
    const values = await mountProbe(DIMENSIONS_RUNE);

    Dimensions.set(ROTATED);
    await tick();

    expect(values.at(-1)).toEqual(ROTATED.window);
  });

  it('does not report again for a change that leaves the metrics as they were', async () => {
    const values = await mountProbe(DIMENSIONS_RUNE);
    const before = values.length;

    Dimensions.set({ window: { ...INITIAL.window }, screen: INITIAL.screen });
    await tick();

    expect(values).toHaveLength(before);
  });
});

describe('useColorScheme (Svelte)', () => {
  it('starts from the current scheme', async () => {
    const values = await mountProbe(SCHEME_RUNE);

    expect(values.at(-1)).toBe('light');
  });

  it('follows each change', async () => {
    const values = await mountProbe(SCHEME_RUNE);

    schemeListener?.({ colorScheme: 'dark' });
    await tick();

    expect(values.at(-1)).toBe('dark');
  });

  it('stops listening on unmount', async () => {
    await mountProbe(SCHEME_RUNE);

    unmount(ROOT_TAG);

    expect(removeScheme).toHaveBeenCalledTimes(1);
  });
});
