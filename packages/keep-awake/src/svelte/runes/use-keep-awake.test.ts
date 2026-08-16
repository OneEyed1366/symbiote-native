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
const removeSubscriptionMock = vi.fn();
const addListenerMock = vi.fn((..._args: unknown[]) => ({ remove: removeSubscriptionMock }));
const deactivateKeepAwakeMock = vi.fn(async (_tag: string) => undefined);

// The native-call leaf is mocked rather than the `../../core` barrel, so that the barrel stays
// REAL and the rune runs the real createKeepAwakeListenerAttachment (the unmount guard under
// test) while its addListener/subscription still land on the spies above.
vi.mock('../../core/keep-awake', () => ({
  ExpoKeepAwakeTag: 'ExpoKeepAwakeDefaultTag',
  isAvailableAsync: async () => true,
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
  removeSubscriptionMock.mockClear();
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
       let { tag, listener, suppressDeactivateWarnings }: {
         tag?: string;
         listener?: (event: unknown) => void;
         suppressDeactivateWarnings?: boolean;
       } = $props();
       useKeepAwake(tag, { listener, suppressDeactivateWarnings });
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

type IKeepAwakeProbeOptions = {
  tag?: string;
  listener?: (event: unknown) => void;
  suppressDeactivateWarnings?: boolean;
};

async function mountKeepAwake(options: IKeepAwakeProbeOptions = {}): Promise<void> {
  const Probe = await loadProbe();
  mount(ROOT_TAG, Probe, { ...options });
  await tick();
}

// No Negative group in the guard-clause sense — useKeepAwake never throws or rejects to its
// caller (it returns void, and both native calls are wrapped so a native failure is swallowed,
// not surfaced). The two "swallowed failure" scenarios below are grouped separately because they
// are still a distinct, deliberate contract (fail silently) rather than the mainline success path.
describe('useKeepAwake (Svelte)', () => {
  describe('Positive — tag resolution and native lifecycle wiring', () => {
    // why: a caller that doesn't care about naming its handle must still get a unique tag —
    // reusing a fixed default across multiple mounted callers would make them fight over the same
    // native keep-awake handle.
    it('activates a default tag on mount', async () => {
      await mountKeepAwake();

      await vi.waitFor(() => expect(activateKeepAwakeAsyncMock).toHaveBeenCalledTimes(1));
      expect(typeof activateKeepAwakeAsyncMock.mock.calls[0][0]).toBe('string');
    });

    // why: a caller managing multiple concurrent keep-awake handles needs to name and later
    // target one specifically, matching upstream's tag-based API.
    it('activates the explicit tag when one is given', async () => {
      await mountKeepAwake({ tag: 'custom-tag' });

      await vi.waitFor(() => expect(activateKeepAwakeAsyncMock).toHaveBeenCalledWith('custom-tag'));
    });

    // why: the tag is what native deactivateKeepAwake targets to release a live handle — passing
    // the wrong (or no) tag on unmount would either leak the acquired handle or release someone
    // else's.
    it('deactivates the same tag on unmount', async () => {
      await mountKeepAwake({ tag: 'custom-tag' });
      await vi.waitFor(() => expect(activateKeepAwakeAsyncMock).toHaveBeenCalledTimes(1));

      unmount(ROOT_TAG);

      expect(deactivateKeepAwakeMock).toHaveBeenCalledWith('custom-tag');
    });

    // why: without an explicit listener the rune must not register one — silently wiring a no-op
    // listener would leak a native subscription nobody asked for.
    it('never touches addListener when no options are given', async () => {
      await mountKeepAwake({ tag: 'custom-tag' });

      await vi.waitFor(() => expect(activateKeepAwakeAsyncMock).toHaveBeenCalledTimes(1));
      expect(addListenerMock).not.toHaveBeenCalled();
    });

    // why: options.listener is how a caller observes OS-level keep-awake state changes — it must
    // be wired to the SAME tag that was just activated, so the caller's listener actually
    // corresponds to the handle it thinks it's observing.
    it('wires options.listener to addListener once activation resolves', async () => {
      const listener = vi.fn();

      await mountKeepAwake({ tag: 'custom-tag', listener });

      await vi.waitFor(() => expect(addListenerMock).toHaveBeenCalledWith('custom-tag', listener));
    });
  });

  describe('Deliberately-swallowed native failures — the rune reports nothing back to the caller', () => {
    // why: the listener attach sits inside the activation promise's `.then()`, which is skipped
    // entirely on rejection — a failed activation must never spuriously attach a listener for a
    // keep-awake handle that was never actually acquired.
    it('does not register a listener when activateKeepAwakeAsync rejects', async () => {
      activateKeepAwakeAsyncMock.mockRejectedValueOnce(new Error('activation failed'));
      const listener = vi.fn();

      await mountKeepAwake({ tag: 'custom-tag', listener });

      await vi.waitFor(() => expect(activateKeepAwakeAsyncMock).toHaveBeenCalledTimes(1));
      expect(addListenerMock).not.toHaveBeenCalled();
    });

    // why: suppressDeactivateWarnings exists specifically so a caller can opt out of the
    // "deactivate failed" warning upstream expo-keep-awake would otherwise surface — the rejection
    // must be swallowed, not become an unhandled promise rejection.
    it('swallows a deactivation rejection when suppressDeactivateWarnings is set', async () => {
      deactivateKeepAwakeMock.mockRejectedValueOnce(new Error('deactivate failed'));
      const unhandled = vi.fn();
      process.once('unhandledRejection', unhandled);

      await mountKeepAwake({ tag: 'custom-tag', suppressDeactivateWarnings: true });
      await vi.waitFor(() => expect(activateKeepAwakeAsyncMock).toHaveBeenCalledTimes(1));
      unmount(ROOT_TAG);
      await tick();

      expect(unhandled).not.toHaveBeenCalled();
    });
  });

  describe('Teardown race — activation resolving after the component is gone', () => {
    // why: activation is async, so the $effect teardown can run while activate() is still
    // pending. A listener registered at that point belongs to a component that no longer exists,
    // and the subscription that would remove it is created after the only teardown has run.
    it('does not register a listener when the component unmounts before activation resolves', async () => {
      let resolveActivate: () => void = () => {};
      activateKeepAwakeAsyncMock.mockImplementationOnce(
        () =>
          new Promise<void>(resolve => {
            resolveActivate = resolve;
          }),
      );
      const listener = vi.fn();

      await mountKeepAwake({ tag: 'custom-tag', listener });
      await vi.waitFor(() => expect(activateKeepAwakeAsyncMock).toHaveBeenCalledTimes(1));

      unmount(ROOT_TAG);
      resolveActivate();
      await tick();

      expect(addListenerMock).not.toHaveBeenCalled();
    });

    // why: the other half of the same leak — when activation wins the race, the subscription
    // exists and the $effect teardown is the only place left that can remove it.
    it('removes the listener subscription on unmount', async () => {
      const listener = vi.fn();

      await mountKeepAwake({ tag: 'custom-tag', listener });
      await vi.waitFor(() => expect(addListenerMock).toHaveBeenCalledTimes(1));

      unmount(ROOT_TAG);

      expect(removeSubscriptionMock).toHaveBeenCalledTimes(1);
    });
  });
});
