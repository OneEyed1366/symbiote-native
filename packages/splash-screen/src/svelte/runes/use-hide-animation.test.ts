// Co-located Svelte-driven test (ADR 0025) for useHideAnimation, the Svelte twin of
// react/hooks/use-hide-animation and vue/composables/use-hide-animation. react-native-bootsplash
// is mocked (both its public JS API and the RNBootSplash native-constants TurboModule), so no
// real native call fires. Runs the rune inside a REAL compiled .svelte component — same
// compile-then-dynamic-import pattern as adapters/svelte/src/host-instance.test.ts — because
// $state/$effect require a real component context, unlike Vue's composable which can run
// under a bare effectScope().

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { compile } from 'svelte/compiler';
import { readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { Component } from 'svelte';
// The .svelte-free subpath — the main barrel re-exports real .svelte component sources, which
// vitest's plain (svelte-plugin-free) test transform cannot parse.
import { mount, unmount } from '@symbiote-native/svelte/native-view-bridge';
import { installFabric } from '@symbiote-native/test-utils';
import type { IHideAnimationConfig, IHideAnimationResult, IManifest } from '../../core';
// The real Metro pipeline's own .svelte.ts compile step (strips TS via ts.transpileModule, then
// desugars runes via compileModule) — reused here instead of duplicated, so this test exercises
// the actual shipped compile path, not a parallel implementation of it. Default-imported (like
// metro-svelte-transformer.test.ts) rather than named, since it's a .cjs module.
import metroSvelteTransformer from '@symbiote-native/svelte/metro-svelte-transformer';

const {
  compileSvelteModuleFile,
}: { compileSvelteModuleFile: (src: string, filename: string) => string } = metroSvelteTransformer;

if (globalThis.window === undefined) Object.assign(globalThis, { window: globalThis });
if (globalThis.navigator === undefined) {
  Object.assign(globalThis, { navigator: { product: 'ReactNative' } });
}

vi.mock('react-native-bootsplash', () => ({
  hide: vi.fn(() => Promise.resolve()),
  isVisible: vi.fn(() => true),
}));

const FAKE_NATIVE_MODULE = { getConstants: vi.fn(() => ({ darkModeEnabled: false })) };

function isPresent<T>(value: unknown): value is T {
  return value !== null && value !== undefined;
}

const ROOT_TAG = 91_502;
const PROBE_OUT = join(__dirname, '.smoke-compiled-use-hide-animation-probe.mjs');
const RUNE_OUT = join(__dirname, '.smoke-compiled-use-hide-animation.svelte.mjs');

const fabric = installFabric();
const tick = (): Promise<void> => new Promise(resolve => setTimeout(resolve, 0));

const MANIFEST: IManifest = { background: '#ffffff', logo: { width: 100, height: 100 } };

beforeEach(() => {
  fabric.reset();
  vi.clearAllMocks();
  globalThis.__turboModuleProxy = <T>(name: string): T | null =>
    name === 'RNBootSplash' && isPresent<T>(FAKE_NATIVE_MODULE) ? FAKE_NATIVE_MODULE : null;
});

afterEach(() => {
  unmount(ROOT_TAG);
  rmSync(PROBE_OUT, { force: true });
  rmSync(RUNE_OUT, { force: true });
  globalThis.__turboModuleProxy = undefined;
});

const COMPILE_OPTIONS = { generate: 'client', fragments: 'tree', css: 'external' } as const;

// $state/$effect require Svelte's MODULE compiler, not the component compiler — a bare,
// uncompiled rune call throws `rune_outside_svelte` at runtime. vitest doesn't run the real
// Metro transformer, so this test drives its exact compileSvelteModuleFile step (TS-strip +
// compileModule) against the real rune source, exercising the actual shipped implementation.
function compileRuneModule(): void {
  const source = readFileSync(join(__dirname, 'use-hide-animation.svelte.ts'), 'utf-8');
  const code = compileSvelteModuleFile(source, 'use-hide-animation.svelte.ts');
  writeFileSync(RUNE_OUT, code);
}

async function loadProbe(): Promise<Component> {
  compileRuneModule();
  const result = compile(
    `<script lang="ts">
       import { useHideAnimation } from './.smoke-compiled-use-hide-animation.svelte.mjs';
       import type { IHideAnimationConfig, IHideAnimationResult } from '../../core';
       let { getConfig, onResult }: {
         getConfig: () => IHideAnimationConfig;
         onResult: (result: IHideAnimationResult) => void;
       } = $props();
       const animation = useHideAnimation(getConfig);
       $effect(() => { onResult(animation.current); });
     </script>
     <symbiote-view p={{}} />`,
    { ...COMPILE_OPTIONS, filename: 'HideAnimationProbe.svelte' },
  );
  writeFileSync(PROBE_OUT, result.js.code);
  const mod: unknown = await import(`file://${PROBE_OUT}`);
  if (mod === null || typeof mod !== 'object' || !('default' in mod)) {
    throw new Error('HideAnimationProbe.svelte produced no default export');
  }
  return mod.default as Component;
}

describe('useHideAnimation (Svelte)', () => {
  it('hides exactly once, only after layout + logo load-end both resolve', async () => {
    const { hide } = await import('react-native-bootsplash');
    let animateCalls = 0;
    const results: IHideAnimationResult[] = [];
    const getConfig = (): IHideAnimationConfig => ({
      manifest: MANIFEST,
      logo: 1,
      ready: true,
      animate: () => {
        animateCalls += 1;
      },
    });

    const Probe = await loadProbe();
    mount(ROOT_TAG, Probe, {
      getConfig,
      onResult: (result: IHideAnimationResult) => results.push(result),
    });
    await tick();

    const last = results[results.length - 1];
    expect(hide).not.toHaveBeenCalled();

    last.container.onLayout();
    expect(hide, 'layout alone must not hide').not.toHaveBeenCalled();

    last.logo.onLoadEnd?.();
    expect(hide).toHaveBeenCalledTimes(1);
    expect(hide).toHaveBeenCalledWith({ fade: false });
    await vi.waitFor(() => expect(animateCalls).toBe(1));
  });

  it('does not hide again once already triggered', async () => {
    const { hide } = await import('react-native-bootsplash');
    const results: IHideAnimationResult[] = [];
    const getConfig = (): IHideAnimationConfig => ({
      manifest: MANIFEST,
      ready: true,
      animate: () => {},
    });

    const Probe = await loadProbe();
    mount(ROOT_TAG, Probe, {
      getConfig,
      onResult: (result: IHideAnimationResult) => results.push(result),
    });
    await tick();

    const first = results[results.length - 1];
    first.container.onLayout();
    await vi.waitFor(() => expect(hide).toHaveBeenCalledTimes(1));

    const last = results[results.length - 1];
    last.container.onLayout();
    expect(hide).toHaveBeenCalledTimes(1);
  });

  it('reports the skip sentinel and no onLoadEnd when logo is omitted', async () => {
    const results: IHideAnimationResult[] = [];
    const getConfig = (): IHideAnimationConfig => ({ manifest: MANIFEST, animate: () => {} });

    const Probe = await loadProbe();
    mount(ROOT_TAG, Probe, {
      getConfig,
      onResult: (result: IHideAnimationResult) => results.push(result),
    });
    await tick();

    const last = results[results.length - 1];
    expect(last.logo.source).toBe(-1);
    expect(last.logo.onLoadEnd).toBeUndefined();
  });
});
