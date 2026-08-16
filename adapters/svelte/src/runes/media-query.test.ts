// The MediaQuery replacements — `orientation` and `createWidthQuery` — driven the same way as
// runes/window.test.ts: a real compiled Svelte component, mounted through the real render
// pipeline, with the real engine Dimensions module emitting through its public `set()`.

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

describe('MediaQuery replacements', () => {
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
