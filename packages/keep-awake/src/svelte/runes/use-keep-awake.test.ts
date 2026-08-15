// Co-located Svelte-driven test (ADR 0025) for useKeepAwake, the Svelte twin of
// vue/composables/use-keep-awake's own test. Mocks the whole core module (never expo-modules-core
// internals) since this exercises rune mount/unmount lifecycle timing, not any native view. Runs
// the rune inside a REAL compiled .svelte component — same compile-then-dynamic-import pattern as
// packages/splash-screen/src/svelte/runes/use-hide-animation.test.ts — because $effect requires a
// real component context, unlike Vue's composable which can run under a bare effectScope().

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { compile } from 'svelte/compiler';
import { readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { Component } from 'svelte';
// The .svelte-free subpath — the main barrel re-exports real .svelte component sources, which
// vitest's plain (svelte-plugin-free) test transform cannot parse.
import { mount, unmount } from '@symbiote-native/svelte/native-view-bridge';
import { installFabric } from '@symbiote-native/test-utils';
// The real Metro pipeline's own .svelte.ts compile step (TS-strip + compileModule), reused here so
// the test drives the actually-shipped compile path rather than a parallel implementation.
import metroSvelteTransformer from '@symbiote-native/svelte/metro-svelte-transformer';

const {
  compileSvelteModuleFile,
}: { compileSvelteModuleFile: (src: string, filename: string) => string } = metroSvelteTransformer;

if (globalThis.window === undefined) Object.assign(globalThis, { window: globalThis });
if (globalThis.navigator === undefined) {
  Object.assign(globalThis, { navigator: { product: 'ReactNative' } });
}

const ROOT_TAG = 91_641;
const PROBE_OUT = join(__dirname, '.smoke-compiled-use-keep-awake-probe.mjs');
const RUNE_OUT = join(__dirname, '.smoke-compiled-use-keep-awake.svelte.mjs');

const activateKeepAwakeAsyncMock = vi.fn(async (_tag: string) => undefined);
const addListenerMock = vi.fn();
const deactivateKeepAwakeMock = vi.fn(async (_tag: string) => undefined);

vi.mock('../../core', () => ({
  activateKeepAwakeAsync: (tag: string) => activateKeepAwakeAsyncMock(tag),
  addListener: (...args: unknown[]) => addListenerMock(...args),
  deactivateKeepAwake: (tag: string) => deactivateKeepAwakeMock(tag),
}));

const fabric = installFabric();
const tick = (): Promise<void> => new Promise(resolve => setTimeout(resolve, 0));

beforeEach(() => {
  fabric.reset();
  activateKeepAwakeAsyncMock.mockClear();
  addListenerMock.mockClear();
  deactivateKeepAwakeMock.mockClear();
  activateKeepAwakeAsyncMock.mockResolvedValue(undefined);
  deactivateKeepAwakeMock.mockResolvedValue(undefined);
});

afterEach(() => {
  unmount(ROOT_TAG);
  rmSync(PROBE_OUT, { force: true });
  rmSync(RUNE_OUT, { force: true });
});

const COMPILE_OPTIONS = { generate: 'client', fragments: 'tree', css: 'external' } as const;

// $effect needs Svelte's MODULE compiler, not the component compiler — a bare, uncompiled rune
// call throws `rune_outside_svelte` at runtime.
function compileRuneModule(): void {
  const source = readFileSync(join(__dirname, 'use-keep-awake.svelte.ts'), 'utf-8');
  writeFileSync(RUNE_OUT, compileSvelteModuleFile(source, 'use-keep-awake.svelte.ts'));
}

async function loadProbe(): Promise<Component> {
  compileRuneModule();
  const result = compile(
    `<script lang="ts">
       import { useKeepAwake } from './.smoke-compiled-use-keep-awake.svelte.mjs';
       let { tag }: { tag?: string } = $props();
       useKeepAwake(tag);
     </script>
     <symbiote-view p={{}} />`,
    { ...COMPILE_OPTIONS, filename: 'KeepAwakeProbe.svelte' },
  );
  writeFileSync(PROBE_OUT, result.js.code);
  const mod: unknown = await import(`file://${PROBE_OUT}`);
  if (mod === null || typeof mod !== 'object' || !('default' in mod)) {
    throw new Error('KeepAwakeProbe.svelte produced no default export');
  }
  return mod.default as Component;
}

async function mountKeepAwake(tag?: string): Promise<void> {
  const Probe = await loadProbe();
  mount(ROOT_TAG, Probe, { tag });
  await tick();
}

describe('useKeepAwake (Svelte)', () => {
  it('activates a default tag on mount', async () => {
    await mountKeepAwake();

    await vi.waitFor(() => expect(activateKeepAwakeAsyncMock).toHaveBeenCalledTimes(1));
    expect(typeof activateKeepAwakeAsyncMock.mock.calls[0][0]).toBe('string');
  });

  it('activates the explicit tag when one is given', async () => {
    await mountKeepAwake('custom-tag');

    await vi.waitFor(() => expect(activateKeepAwakeAsyncMock).toHaveBeenCalledWith('custom-tag'));
  });

  it('deactivates the same tag on unmount', async () => {
    await mountKeepAwake('custom-tag');
    await vi.waitFor(() => expect(activateKeepAwakeAsyncMock).toHaveBeenCalledTimes(1));

    unmount(ROOT_TAG);

    expect(deactivateKeepAwakeMock).toHaveBeenCalledWith('custom-tag');
  });

  it('never touches addListener when no options are given', async () => {
    await mountKeepAwake('custom-tag');

    await vi.waitFor(() => expect(activateKeepAwakeAsyncMock).toHaveBeenCalledTimes(1));
    expect(addListenerMock).not.toHaveBeenCalled();
  });
});
