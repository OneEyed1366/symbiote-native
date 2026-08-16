// Co-located Svelte-driven test (ADR 0025) for useClipboard, the Svelte twin of
// vue/composables/use-clipboard's own test. Mocks the whole core module (never expo-modules-core
// internals) since this exercises rune mount/unmount lifecycle timing, not any native view —
// there is none here, so no ViewConfig fixture is needed. Runs the rune inside a REAL compiled
// .svelte component — same compile-then-dynamic-import pattern as
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
// The real Metro pipeline's own .svelte.ts compile step (TS-strip + compileModule), reused here so
// the test drives the actually-shipped compile path rather than a parallel implementation.
import metroSvelteTransformer from '@symbiote-native/svelte/metro-svelte-transformer';
import type { IClipboardEvent } from '../../core';
// Imported from the types module directly (not the mocked `../../core` barrel below) — a pure
// enum declaration with no expo-modules-core native resolution, so it's safe to import unmocked
// here purely to build a type-correct fixture event.
import { ContentType } from '../../core/types';

const {
  compileSvelteModuleFile,
}: { compileSvelteModuleFile: (src: string, filename: string) => string } = metroSvelteTransformer;

if (globalThis.window === undefined) Object.assign(globalThis, { window: globalThis });
if (globalThis.navigator === undefined) {
  Object.assign(globalThis, { navigator: { product: 'ReactNative' } });
}

const ROOT_TAG = 91_631;
const PROBE_OUT = join(__dirname, '.smoke-compiled-use-clipboard-probe.mjs');
const RUNE_OUT = join(__dirname, '.smoke-compiled-use-clipboard.svelte.mjs');

type IListener = (event: IClipboardEvent) => void;

let registeredListener: IListener | undefined;
const removeMock = vi.fn();
const addClipboardListenerMock = vi.fn((listener: IListener) => {
  registeredListener = listener;
  return { remove: removeMock };
});

vi.mock('../../core', () => ({
  addClipboardListener: (listener: IListener) => addClipboardListenerMock(listener),
}));

const fabric = installFabric();
const tick = (): Promise<void> => new Promise(resolve => setTimeout(resolve, 0));

beforeEach(() => {
  fabric.reset();
  registeredListener = undefined;
  addClipboardListenerMock.mockClear();
  removeMock.mockClear();
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
  const source = readFileSync(join(__dirname, 'use-clipboard.svelte.ts'), 'utf-8');
  writeFileSync(RUNE_OUT, compileSvelteModuleFile(source, 'use-clipboard.svelte.ts'));
}

async function loadProbe(): Promise<Component> {
  compileRuneModule();
  const result = compile(
    `<script lang="ts">
       import { useClipboard } from './.smoke-compiled-use-clipboard.svelte.mjs';
       let { onValue }: { onValue: (event: unknown) => void } = $props();
       const clipboard = useClipboard();
       $effect(() => { onValue(clipboard.current); });
     </script>
     <symbiote-view p={{}} />`,
    { ...COMPILE_OPTIONS, filename: 'ClipboardProbe.svelte' },
  );
  writeFileSync(PROBE_OUT, result.js.code);
  const mod: unknown = await import(`file://${PROBE_OUT}`);
  if (mod === null || typeof mod !== 'object' || !('default' in mod)) {
    throw new Error('ClipboardProbe.svelte produced no default export');
  }
  return mod.default as Component;
}

function isClipboardEvent(value: unknown): value is IClipboardEvent {
  return typeof value === 'object' && value !== null && 'contentTypes' in value;
}

async function mountClipboard(): Promise<(IClipboardEvent | null)[]> {
  const values: (IClipboardEvent | null)[] = [];
  const Probe = await loadProbe();
  mount(ROOT_TAG, Probe, {
    onValue: (value: unknown) => values.push(isClipboardEvent(value) ? value : null),
  });
  await tick();
  return values;
}

// No Negative group: unlike battery/brightness/cellular, this rune has no one-shot fetch either —
// it only ever subscribes, writes on event, and unsubscribes. No guard clause, nothing meant to
// reject/throw.
describe('useClipboard (Svelte)', () => {
  describe('Positive — boxed value tracks the native listener and unmount', () => {
    // why: unlike battery/locales/calendars there is no synchronous or one-shot-async clipboard
    // read on mount (clipboard content is push-only) — so the contract is genuinely "no event
    // yet", not a fetched sentinel, and null is the only honest starting value.
    it('starts null before any clipboard-change event arrives', async () => {
      const values = await mountClipboard();

      expect(values[0]).toBeNull();
    });

    // why: the rune's whole purpose is surfacing clipboard-change events as they happen — a
    // consumer that only read the initial null would never see anything the user copies.
    it('updates the boxed value when the native listener fires', async () => {
      const values = await mountClipboard();
      const fired: IClipboardEvent = { contentTypes: [ContentType.IMAGE] };

      registeredListener?.(fired);

      await vi.waitFor(() => expect(values[values.length - 1]).toEqual(fired));
    });

    // why: a rune that outlives its subscription leaks a live native listener into a scope Svelte
    // already considers destroyed — the effect's teardown is what prevents that leak.
    it('removes the subscription on unmount', async () => {
      await mountClipboard();

      unmount(ROOT_TAG);

      expect(removeMock).toHaveBeenCalledTimes(1);
    });
  });
});
