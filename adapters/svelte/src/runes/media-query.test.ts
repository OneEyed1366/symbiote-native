// The MediaQuery replacements — `orientation` and `createWidthQuery` — driven two ways:
// (1) direct reads of `.current` (legal outside a component per dimensions-value.ts's own
//     contract — `subscribe()` no-ops when called outside a tracking effect), which is the
//     cheapest way to pin down the actual comparison logic and its boundaries;
// (2) a real compiled Svelte component mounted through the real render pipeline, which is the
//     only way to prove the createSubscriber wiring (updates on 'change', teardown on unmount)
//     actually threads through Svelte's reactivity.
// No Negative group: neither export has a throwing path — both are total over their input
// (Dimensions always answers; createWidthQuery accepts any combination of optional bounds).

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { compile } from 'svelte/compiler';
import { rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { Component } from 'svelte';
import {
  Dimensions,
  type IDimensionsPayload,
  type IEventSubscription,
} from '@symbiote-native/engine';
import { installFabric } from '@symbiote-native/test-utils';
import { mount, unmount } from '../render';
import { createWidthQuery, orientation } from './media-query';

if (globalThis.window === undefined) Object.assign(globalThis, { window: globalThis });
if (globalThis.navigator === undefined) {
  Object.assign(globalThis, { navigator: { product: 'ReactNative' } });
}

const ROOT_TAG = 91_932;
const PROBE_OUT = join(__dirname, '.smoke-compiled-media-query-probe.mjs');

const PHONE_PORTRAIT: IDimensionsPayload = {
  window: { width: 400, height: 800, scale: 3, fontScale: 1 },
};
const PHONE_LANDSCAPE: IDimensionsPayload = {
  window: { width: 800, height: 400, scale: 3, fontScale: 1 },
};
const TABLET_PORTRAIT: IDimensionsPayload = {
  window: { width: 834, height: 1_112, scale: 2, fontScale: 1 },
};

const fabric = installFabric();
const tick = (): Promise<void> => new Promise(resolve => setTimeout(resolve, 0));

const addEventListener = Dimensions.addEventListener.bind(Dimensions);
let removals: Array<ReturnType<typeof vi.fn>> = [];

beforeEach(() => {
  fabric.reset();
  removals = [];
  vi.spyOn(Dimensions, 'addEventListener').mockImplementation((type, listener) => {
    const subscription: IEventSubscription = addEventListener(type, listener);
    const remove = vi.fn(() => subscription.remove());
    removals.push(remove);
    return { remove };
  });
  Dimensions.set(PHONE_PORTRAIT);
});

afterEach(() => {
  unmount(ROOT_TAG);
  vi.restoreAllMocks();
  rmSync(PROBE_OUT, { force: true });
});

const PROBE = `<script lang="ts">
  import { orientation, createWidthQuery } from './media-query';
  let { onValue }: { onValue: (state: unknown) => void } = $props();
  const wide = createWidthQuery({ minWidth: 600 });
  const phoneSized = createWidthQuery({ maxWidth: 599 });
  const midRange = createWidthQuery({ minWidth: 600, maxWidth: 900 });
  $effect(() => {
    onValue({
      orientation: orientation.current,
      wide: wide.current,
      phoneSized: phoneSized.current,
      midRange: midRange.current,
    });
  });
</script>
<symbiote-view />`;

interface IQueryState {
  orientation: string;
  wide: boolean;
  phoneSized: boolean;
  midRange: boolean;
}

async function mountProbe(values: IQueryState[]): Promise<void> {
  writeFileSync(
    PROBE_OUT,
    compile(PROBE, {
      generate: 'client',
      fragments: 'tree',
      css: 'external',
      filename: 'MediaQueryProbe.svelte',
      experimental: { customRenderer: '@symbiote-native/svelte/renderer' },
    }).js.code,
  );
  const mod: unknown = await import(`file://${PROBE_OUT}`);
  if (mod === null || typeof mod !== 'object' || !('default' in mod)) {
    throw new Error('MediaQueryProbe.svelte produced no default export');
  }
  const probe: unknown = mod.default;
  if (typeof probe !== 'function')
    throw new Error('MediaQueryProbe.svelte default export is not a component');
  const component: Component = probe;
  mount(ROOT_TAG, component, { onValue: (state: IQueryState) => values.push(state) });
  await tick();
}

// Direct `.current` reads — no compiled component, no mount — exercising the actual comparison
// logic and its documented boundaries. Legal per dimensions-value.ts's own contract: `.current`
// reads through untracked outside a reactive scope.
describe('Positive — orientation and createWidthQuery, direct reads', () => {
  // why: the source comment states this explicitly — "a square window counts as portrait …
  // not a coin flip" (height >= width). Untested, this boundary could silently flip to
  // landscape-on-tie with no test catching it.
  it('treats a square window as portrait, not a coin flip', () => {
    Dimensions.set({ window: { width: 500, height: 500, scale: 1, fontScale: 1 } });
    expect(orientation.current).toBe('portrait');
  });

  it('is landscape when width exceeds height', () => {
    Dimensions.set({ window: { width: 800, height: 400, scale: 1, fontScale: 1 } });
    expect(orientation.current).toBe('landscape');
  });

  // why: the source comment states both bounds are INCLUSIVE, matching CSS min-width/max-width —
  // a width exactly at the bound must still match, not fall just outside it.
  it('matches minWidth exactly (inclusive lower bound)', () => {
    Dimensions.set({ window: { width: 600, height: 800, scale: 1, fontScale: 1 } });
    const query = createWidthQuery({ minWidth: 600 });
    expect(query.current).toBe(true);
  });

  it('matches maxWidth exactly (inclusive upper bound)', () => {
    Dimensions.set({ window: { width: 599, height: 800, scale: 1, fontScale: 1 } });
    const query = createWidthQuery({ maxWidth: 599 });
    expect(query.current).toBe(true);
  });

  // why: with neither bound supplied there is nothing to reject — the query is unconditionally
  // satisfied, the same way an empty CSS media-query condition matches everything.
  it('is unconditionally true when neither bound is given', () => {
    Dimensions.set({ window: { width: 1, height: 1, scale: 1, fontScale: 1 } });
    const query = createWidthQuery({});
    expect(query.current).toBe(true);
  });
});

describe('MediaQuery replacements — reactive wiring through a mounted component', () => {
  // why: proves createDimensionsValue's `.current` read INSIDE a real `$effect` actually reads
  // through to the engine's current state on the very first run, not a stale/undefined default.
  it('seeds from the engine Dimensions module', async () => {
    const values: IQueryState[] = [];
    await mountProbe(values);

    expect(values[values.length - 1]).toEqual({
      orientation: 'portrait',
      wide: false,
      phoneSized: true,
      midRange: false,
    });
  });

  // why: this is the actual product claim — an author reading `orientation.current`/a width
  // query inside a component expects it to re-render on rotation, the same way the web
  // MediaQuery this replaces would. Direct reads above prove the math; this proves the
  // subscription actually drives Svelte's reactivity end to end.
  it('flips orientation and the width queries when the device rotates', async () => {
    const values: IQueryState[] = [];
    await mountProbe(values);

    Dimensions.set(PHONE_LANDSCAPE);
    await tick();

    expect(values[values.length - 1]).toEqual({
      orientation: 'landscape',
      wide: true,
      phoneSized: false,
      midRange: true,
    });
  });

  it('respects an upper bound — a tablet is wide but outside the mid-range band', async () => {
    const values: IQueryState[] = [];
    await mountProbe(values);

    Dimensions.set(TABLET_PORTRAIT);
    await tick();

    expect(values[values.length - 1]).toEqual({
      orientation: 'portrait',
      wide: true,
      phoneSized: false,
      midRange: true,
    });
  });

  // why: createSubscriber's teardown must actually run on unmount, or a component that reads
  // orientation/a width query leaks an engine Dimensions listener every time it is torn down.
  it('removes the subscription on unmount and stops tracking further changes', async () => {
    const values: IQueryState[] = [];
    await mountProbe(values);
    const emittedWhileMounted = values.length;

    unmount(ROOT_TAG);
    await tick();
    for (const remove of removals) expect(remove).toHaveBeenCalledTimes(1);

    Dimensions.set(PHONE_LANDSCAPE);
    await tick();
    expect(values).toHaveLength(emittedWhileMounted);
  });
});
