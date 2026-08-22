// Co-located Svelte-driven test (ADR 0025) for useScreenOrientation, the Svelte twin of
// react/hooks/use-screen-orientation and vue/composables/use-screen-orientation. Runs the rune
// inside a REAL compiled .svelte component — same compile-then-dynamic-import pattern as
// packages/splash-screen/src/svelte/runes/use-hide-animation.test.ts — because $state/$effect
// require a real component context.

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
// this test exercises the actual shipped compile path.
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

const ROOT_TAG = 91_630;
const PROBE_OUT = join(
  __dirname,
  '.smoke-compiled-use-screen-orientation-probe.mjs',
);
const RUNE_OUT = join(
  __dirname,
  '.smoke-compiled-use-screen-orientation.svelte.mjs',
);

type IScreenOrientationState = { orientation: number; orientationLock: number };
type IOrientationChangeEvent = {
  orientationLock: number;
  orientationInfo: { orientation: number };
};
type IListener = (event: IOrientationChangeEvent) => void;

let registeredListener: IListener | undefined;
const removeMock = vi.fn();
const addListenerMock = vi.fn((listener: IListener) => {
  registeredListener = listener;
  return { remove: removeMock };
});
const getOrientationAsyncMock = vi.fn(async (): Promise<number> => 1);
const getOrientationLockAsyncMock = vi.fn(async (): Promise<number> => 0);

vi.mock('../../core', () => ({
  addOrientationChangeListener: (listener: IListener) =>
    addListenerMock(listener),
  getOrientationAsync: () => getOrientationAsyncMock(),
  getOrientationLockAsync: () => getOrientationLockAsyncMock(),
  Orientation: { UNKNOWN: 0, PORTRAIT_UP: 1 },
  OrientationLock: { UNKNOWN: 9, DEFAULT: 0 },
}));

const fabric = installFabric();
const tick = (): Promise<void> =>
  new Promise(resolve => setTimeout(resolve, 0));

beforeEach(() => {
  fabric.reset();
  registeredListener = undefined;
  addListenerMock.mockClear();
  removeMock.mockClear();
  getOrientationAsyncMock.mockClear();
  getOrientationLockAsyncMock.mockClear();
  getOrientationAsyncMock.mockResolvedValue(1);
  getOrientationLockAsyncMock.mockResolvedValue(0);
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

// $state/$effect require Svelte's MODULE compiler, not the component compiler — a bare,
// uncompiled rune call throws `rune_outside_svelte` at runtime.
function compileRuneModule(): void {
  const source = readFileSync(
    join(__dirname, 'use-screen-orientation.svelte.ts'),
    'utf-8',
  );
  writeFileSync(
    RUNE_OUT,
    compileSvelteModuleFile(source, 'use-screen-orientation.svelte.ts'),
  );
}

async function loadProbe(): Promise<Component> {
  compileRuneModule();
  const result = compile(
    `<script lang="ts">
       import { useScreenOrientation } from './.smoke-compiled-use-screen-orientation.svelte.mjs';
       let { onValue }: { onValue: (state: unknown) => void } = $props();
       const screenOrientation = useScreenOrientation();
       $effect(() => { onValue(screenOrientation.current); });
     </script>
     <symbiote-view p={{}} />`,
    { ...COMPILE_OPTIONS, filename: 'ScreenOrientationProbe.svelte' },
  );
  writeFileSync(PROBE_OUT, result.js.code);
  const mod: unknown = await import(`file://${PROBE_OUT}`);
  if (mod === null || typeof mod !== 'object' || !('default' in mod)) {
    throw new Error('ScreenOrientationProbe.svelte produced no default export');
  }
  return mod.default as Component;
}

async function mountScreenOrientation(
  values: IScreenOrientationState[],
): Promise<void> {
  const Probe = await loadProbe();
  mount(ROOT_TAG, Probe, {
    onValue: (state: IScreenOrientationState) => values.push(state),
  });
  await tick();
}

// No Negative group: useScreenOrientation has no guard clause and no throwing path — it seeds a
// value, awaits two native calls, and forwards listener events. Every scenario below is
// Positive; the second axis is "what the effect does instead of erroring" (seed -> fetch ->
// listen -> cleanup), not a rejection path.
describe('useScreenOrientation (Svelte)', () => {
  describe('Positive (seed, dual fetch, listener updates, lifecycle)', () => {
    it('seeds at Orientation.UNKNOWN/OrientationLock.UNKNOWN before the initial fetch resolves', async () => {
      // why: never-settling fetches pin the state at its seed value forever, proving the UNKNOWN
      // pair is the rune's OWN initial value rather than a value that happens to arrive before
      // the mocks resolve in a race.
      getOrientationAsyncMock.mockReturnValue(new Promise<number>(() => {}));
      getOrientationLockAsyncMock.mockReturnValue(
        new Promise<number>(() => {}),
      );
      const values: IScreenOrientationState[] = [];
      await mountScreenOrientation(values);

      expect(values[values.length - 1]).toEqual({
        orientation: 0,
        orientationLock: 9,
      });
    });

    it('updates to the fetched value once BOTH getOrientationAsync() and getOrientationLockAsync() resolve', async () => {
      // why: orientation and its lock come from two independent one-shot calls (Promise.all); the
      // caller must see the combined pair, not just whichever settles first.
      const values: IScreenOrientationState[] = [];
      await mountScreenOrientation(values);

      await vi.waitFor(() =>
        expect(values[values.length - 1]).toEqual({
          orientation: 1,
          orientationLock: 0,
        }),
      );
    });

    it('subscribes to the native listener exactly once, even as the state it writes changes', async () => {
      // why: the source comment claims the effect touches `screenOrientation` write-only, so it
      // has no dependency on its own output and never re-runs. Proving `addOrientationChangeListener`
      // stays at one call — across BOTH the fetch resolving and a listener event landing — is what
      // actually verifies that claim, not merely asserting it once at mount.
      const values: IScreenOrientationState[] = [];
      await mountScreenOrientation(values);
      await vi.waitFor(() =>
        expect(values[values.length - 1].orientation).toBe(1),
      );

      registeredListener?.({
        orientationLock: 5,
        orientationInfo: { orientation: 3 },
      });
      await tick();

      expect(addListenerMock).toHaveBeenCalledTimes(1);
    });

    it('updates the state when the native listener fires, taking both fields from the SAME event', async () => {
      // why: a rotation event carries orientation and lock together (orientationInfo.orientation +
      // orientationLock) — the rune must fold them into one state write, not two independent ones
      // that could observably tear.
      const values: IScreenOrientationState[] = [];
      await mountScreenOrientation(values);
      await vi.waitFor(() =>
        expect(values[values.length - 1].orientation).toBe(1),
      );

      registeredListener?.({
        orientationLock: 5,
        orientationInfo: { orientation: 3 },
      });
      await tick();

      expect(values[values.length - 1]).toEqual({
        orientation: 3,
        orientationLock: 5,
      });
    });

    it('removes the subscription exactly once on unmount', async () => {
      // why: a leaked native listener across mount/unmount cycles would keep firing into an
      // unmounted component's closed-over state — the effect's cleanup is the only thing
      // preventing that, the twin of Vue's onUnmounted.
      await mountScreenOrientation([]);
      unmount(ROOT_TAG);

      expect(removeMock).toHaveBeenCalledTimes(1);
    });
  });
});
