// Co-located Svelte-driven test (ADR 0025) for useLocales, the Svelte twin of
// react/hooks/use-locales and vue/composables/use-locales. Runs the rune inside a REAL compiled
// .svelte component — same compile-then-dynamic-import pattern as
// packages/splash-screen/src/svelte/runes/use-hide-animation.test.ts — because $state/$effect
// require a real component context, unlike Vue's composable which runs under a bare mount().

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { compile } from 'svelte/compiler';
import { readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { Component } from 'svelte';
// The .svelte-free subpath — the main barrel re-exports real .svelte component sources, which
// vitest's plain (svelte-plugin-free) test transform cannot parse.
import { mount, unmount } from '@symbiote-native/svelte/native-view-bridge';
import { installFabric } from '@symbiote-native/test-utils';
import type { Locale } from '../../core';
// The real Metro pipeline's own .svelte.ts compile step (strips TS via ts.transpileModule, then
// desugars runes via compileModule) — reused here so this test exercises the actual shipped
// compile path. Default-imported rather than named, since it's a .cjs module.
import metroSvelteTransformer from '@symbiote-native/svelte/metro-svelte-transformer';

const {
  compileSvelteModuleFile,
}: { compileSvelteModuleFile: (src: string, filename: string) => string } = metroSvelteTransformer;

if (globalThis.window === undefined) Object.assign(globalThis, { window: globalThis });
if (globalThis.navigator === undefined) {
  Object.assign(globalThis, { navigator: { product: 'ReactNative' } });
}

const ROOT_TAG = 91_610;
const PROBE_OUT = join(__dirname, '.smoke-compiled-use-locales-probe.mjs');
const RUNE_OUT = join(__dirname, '.smoke-compiled-use-locales.svelte.mjs');

const FAKE_LOCALES_INITIAL: Locale[] = [
  {
    languageTag: 'pl-PL',
    languageCode: 'pl',
    languageScriptCode: 'Latn',
    regionCode: 'PL',
    languageRegionCode: 'PL',
    currencyCode: 'PLN',
    currencySymbol: 'zł',
    languageCurrencyCode: 'PLN',
    languageCurrencySymbol: 'zł',
    decimalSeparator: ',',
    digitGroupingSeparator: ' ',
    textDirection: 'ltr',
    measurementSystem: 'metric',
    temperatureUnit: 'celsius',
  },
];

const FAKE_LOCALES_UPDATED: Locale[] = [
  {
    languageTag: 'en-US',
    languageCode: 'en',
    languageScriptCode: 'Latn',
    regionCode: 'US',
    languageRegionCode: 'US',
    currencyCode: 'USD',
    currencySymbol: '$',
    languageCurrencyCode: 'USD',
    languageCurrencySymbol: '$',
    decimalSeparator: '.',
    digitGroupingSeparator: ',',
    textDirection: 'ltr',
    measurementSystem: 'us',
    temperatureUnit: 'fahrenheit',
  },
];

let registeredListener: (() => void) | undefined;
const removeMock = vi.fn();
const addListenerMock = vi.fn((listener: () => void) => {
  registeredListener = listener;
  return { remove: removeMock };
});
const getLocalesMock = vi.fn(() => FAKE_LOCALES_INITIAL);

vi.mock('../../core', () => ({
  addLocaleListener: (listener: () => void) => addListenerMock(listener),
  getLocales: () => getLocalesMock(),
}));

const fabric = installFabric();
const tick = (): Promise<void> => new Promise(resolve => setTimeout(resolve, 0));

beforeEach(() => {
  fabric.reset();
  registeredListener = undefined;
  addListenerMock.mockClear();
  removeMock.mockClear();
  getLocalesMock.mockClear();
  getLocalesMock.mockReturnValue(FAKE_LOCALES_INITIAL);
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
  const source = readFileSync(join(__dirname, 'use-locales.svelte.ts'), 'utf-8');
  writeFileSync(RUNE_OUT, compileSvelteModuleFile(source, 'use-locales.svelte.ts'));
}

async function loadProbe(): Promise<Component> {
  compileRuneModule();
  const result = compile(
    `<script lang="ts">
       import { useLocales } from './.smoke-compiled-use-locales.svelte.mjs';
       import type { Locale } from '../../core';
       let { onValue }: { onValue: (locales: Locale[]) => void } = $props();
       const locales = useLocales();
       $effect(() => { onValue(locales.current); });
     </script>
     <symbiote-view p={{}} />`,
    { ...COMPILE_OPTIONS, filename: 'LocalesProbe.svelte' },
  );
  writeFileSync(PROBE_OUT, result.js.code);
  const mod: unknown = await import(`file://${PROBE_OUT}`);
  if (mod === null || typeof mod !== 'object' || !('default' in mod)) {
    throw new Error('LocalesProbe.svelte produced no default export');
  }
  return mod.default as Component;
}

async function mountLocales(values: Locale[][]): Promise<void> {
  const Probe = await loadProbe();
  mount(ROOT_TAG, Probe, { onValue: (locales: Locale[]) => values.push(locales) });
  await tick();
}

describe('useLocales (Svelte)', () => {
  it('reads the current locales at rune-call time', async () => {
    const values: Locale[][] = [];
    await mountLocales(values);

    expect(values[0]).toEqual(FAKE_LOCALES_INITIAL);
  });

  it('recomputes the state when the native listener fires', async () => {
    const values: Locale[][] = [];
    await mountLocales(values);

    getLocalesMock.mockReturnValue(FAKE_LOCALES_UPDATED);
    registeredListener?.();
    await tick();

    expect(values[values.length - 1]).toEqual(FAKE_LOCALES_UPDATED);
  });

  it('removes the subscription on unmount', async () => {
    await mountLocales([]);
    unmount(ROOT_TAG);

    expect(removeMock).toHaveBeenCalledTimes(1);
  });
});
