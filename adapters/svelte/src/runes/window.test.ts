// The `svelte/reactivity/window` twins, exercised inside a REAL compiled Svelte component mounted
// through the real render pipeline — same compile-then-dynamic-import shape as
// runes/attachments.smoke.test.ts and packages/network/src/svelte/runes/use-network-state.test.ts.
// A component is required, not optional: `createSubscriber` only subscribes when `.current` is
// read inside a tracking effect, so a bare read in a plain test would prove nothing about either
// updates or teardown.
//
// The "native source emits" half is driven through `Dimensions.set()`, RN's own public static that
// native pushes metrics through — so the real engine Dimensions module, its real 'change' fan-out
// and its real listener bookkeeping are all in the path. Only `addEventListener` is wrapped, to
// get a handle on the subscription whose removal is being asserted.
//
// No Negative group: every export here is a pure mapping over `Dimensions`/`PixelRatio` with no
// guard clause and no input to reject.

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

if (globalThis.window === undefined)
  Object.assign(globalThis, { window: globalThis });
if (globalThis.navigator === undefined) {
  Object.assign(globalThis, { navigator: { product: 'ReactNative' } });
}

const ROOT_TAG = 91_931;
const SECOND_ROOT_TAG = 91_933;
const PROBE_OUT = join(__dirname, '.smoke-compiled-window-probe.mjs');
const SECOND_PROBE_OUT = join(
  __dirname,
  '.smoke-compiled-window-second-probe.mjs',
);

const INITIAL: IDimensionsPayload = {
  window: { width: 400, height: 800, scale: 3, fontScale: 1 },
  screen: { width: 410, height: 900, scale: 3, fontScale: 1 },
};
const ROTATED: IDimensionsPayload = {
  window: { width: 800, height: 400, scale: 2, fontScale: 1 },
  screen: { width: 900, height: 410, scale: 2, fontScale: 1 },
};

const fabric = installFabric();
const tick = (): Promise<void> =>
  new Promise(resolve => setTimeout(resolve, 0));

const addEventListener = Dimensions.addEventListener.bind(Dimensions);
let removals: Array<ReturnType<typeof vi.fn>> = [];

beforeEach(() => {
  fabric.reset();
  removals = [];
  vi.spyOn(Dimensions, 'addEventListener').mockImplementation(
    (type, listener) => {
      const subscription: IEventSubscription = addEventListener(type, listener);
      const remove = vi.fn(() => subscription.remove());
      removals.push(remove);
      return { remove };
    },
  );
  Dimensions.set(INITIAL);
});

afterEach(() => {
  unmount(ROOT_TAG);
  unmount(SECOND_ROOT_TAG);
  vi.restoreAllMocks();
  rmSync(PROBE_OUT, { force: true });
  rmSync(SECOND_PROBE_OUT, { force: true });
});

// One probe reading all five values at once — each carries its own createSubscriber, so this also
// pins down how many engine subscriptions the set costs.
const PROBE = `<script lang="ts">
  import {
    innerWidth,
    innerHeight,
    outerWidth,
    outerHeight,
    devicePixelRatio,
  } from './window';
  let { onValue }: { onValue: (metrics: unknown) => void } = $props();
  $effect(() => {
    onValue({
      innerWidth: innerWidth.current,
      innerHeight: innerHeight.current,
      outerWidth: outerWidth.current,
      outerHeight: outerHeight.current,
      devicePixelRatio: devicePixelRatio.current,
    });
  });
</script>
<symbiote-view p={{}} />`;

interface IMetrics {
  innerWidth: number;
  innerHeight: number;
  outerWidth: number;
  outerHeight: number;
  devicePixelRatio: number;
}

async function mountProbe(values: IMetrics[]): Promise<void> {
  writeFileSync(
    PROBE_OUT,
    compile(PROBE, {
      generate: 'client',
      fragments: 'tree',
      css: 'external',
      filename: 'WindowProbe.svelte',
    }).js.code,
  );
  const mod: unknown = await import(`file://${PROBE_OUT}`);
  if (mod === null || typeof mod !== 'object' || !('default' in mod)) {
    throw new Error('WindowProbe.svelte produced no default export');
  }
  const probe: unknown = mod.default;
  if (typeof probe !== 'function')
    throw new Error('WindowProbe.svelte default export is not a component');
  const component: Component = probe;
  mount(ROOT_TAG, component, {
    onValue: (metrics: IMetrics) => values.push(metrics),
  });
  await tick();
}

// A second, independent probe reading only `innerWidth` — used to prove the module-level
// singleton claim in dimensions-value.ts's own header comment: "N components reading
// innerWidth.current share exactly one" listener, not one per reading component.
const SECOND_PROBE = `<script lang="ts">
  import { innerWidth } from './window';
  let { onValue }: { onValue: (width: number) => void } = $props();
  $effect(() => { onValue(innerWidth.current); });
</script>
<symbiote-view p={{}} />`;

async function mountSecondProbe(values: number[]): Promise<void> {
  writeFileSync(
    SECOND_PROBE_OUT,
    compile(SECOND_PROBE, {
      generate: 'client',
      fragments: 'tree',
      css: 'external',
      filename: 'WindowSecondProbe.svelte',
    }).js.code,
  );
  const mod: unknown = await import(`file://${SECOND_PROBE_OUT}`);
  if (mod === null || typeof mod !== 'object' || !('default' in mod)) {
    throw new Error('WindowSecondProbe.svelte produced no default export');
  }
  const probe: unknown = mod.default;
  if (typeof probe !== 'function')
    throw new Error(
      'WindowSecondProbe.svelte default export is not a component',
    );
  const component: Component = probe;
  mount(SECOND_ROOT_TAG, component, {
    onValue: (width: number) => values.push(width),
  });
  await tick();
}

describe('Positive — svelte/reactivity/window twins', () => {
  // why: proves the mapping each export makes (window→inner*, screen→outer*,
  // PixelRatio.get()→devicePixelRatio) is right at the very first read, inside a real `$effect`.
  it('seeds from the engine Dimensions module', async () => {
    const values: IMetrics[] = [];
    await mountProbe(values);

    expect(values[values.length - 1]).toEqual({
      innerWidth: 400,
      innerHeight: 800,
      outerWidth: 410,
      outerHeight: 900,
      devicePixelRatio: 3,
    });
  });

  // why: the whole point of these twins is that a component re-renders on a native metric
  // change (rotation, split-screen resize) the way `svelte/reactivity/window` does on the web —
  // a value that only seeds once and never updates would defeat the replacement's purpose.
  it('updates every value when the native source emits a change', async () => {
    const values: IMetrics[] = [];
    await mountProbe(values);

    Dimensions.set(ROTATED);
    await tick();

    expect(values[values.length - 1]).toEqual({
      innerWidth: 800,
      innerHeight: 400,
      outerWidth: 900,
      outerHeight: 410,
      devicePixelRatio: 2,
    });
  });

  // Each value owns its own createSubscriber, so five values cost five engine listeners — but not
  // one per READ: the getter is read on every effect re-run, and createSubscriber refcounts, so
  // the count stays at five across the rotation below rather than climbing.
  it('attaches one Dimensions subscription per value, and no more on re-read', async () => {
    const values: IMetrics[] = [];
    await mountProbe(values);
    expect(removals).toHaveLength(5);

    Dimensions.set(ROTATED);
    await tick();

    expect(removals).toHaveLength(5);
  });

  // why: dimensions-value.ts's own header comment makes this an explicit product claim — "N
  // components reading innerWidth.current share exactly one" engine listener, because `start`
  // runs lazily on the first read and refcounts every further one. Every other test in this file
  // mounts a single component reading 5 DIFFERENT values, which proves per-value cost but never
  // proves per-READER sharing — this is the one scenario that actually exercises two independent
  // mounted components reading the SAME value.
  it('shares one underlying subscription across two independently mounted readers', async () => {
    const firstValues: IMetrics[] = [];
    await mountProbe(firstValues);
    expect(removals).toHaveLength(5);

    const secondValues: number[] = [];
    await mountSecondProbe(secondValues);

    expect(removals).toHaveLength(5);
    expect(secondValues[secondValues.length - 1]).toBe(400);
  });

  // why: createSubscriber's teardown must actually fire on unmount, or every component reading
  // any of these values leaks an engine Dimensions listener on every screen it unmounts from.
  it('removes the subscription on unmount and stops tracking further changes', async () => {
    const values: IMetrics[] = [];
    await mountProbe(values);
    const emittedWhileMounted = values.length;

    unmount(ROOT_TAG);
    // createSubscriber counts down its subscribers a microtask after teardown, so the removal is
    // not synchronous with unmount.
    await tick();
    expect(removals).toHaveLength(5);
    for (const remove of removals) expect(remove).toHaveBeenCalledTimes(1);

    Dimensions.set(ROTATED);
    await tick();
    expect(values).toHaveLength(emittedWhileMounted);
  });
});
