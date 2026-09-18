// The whole benchmark screen through the Svelte adapter — all eight device steps, headless.
//
// why, the step definitions, the oracle and the one-file-per-arm rule: `bench-suite.ts`.
//
// Svelte batches its effects, so a step settles with `tick()` and the await sits inside the
// stopwatch — the same turn a device pays.
//
// The keyed `{#each … (row.id)}` is what makes `Replace` a real teardown rather than a thousand
// no-op updates, and the row keeps its own component boundary because that is what the device screen
// has.
//
// RUN ON `build-release` (`pnpm run bench:itest`).

import { tick } from 'svelte';

import { readSurfaceTelemetry } from '@symbiote-native/engine';
import { mount } from '@symbiote-native/svelte';

import { ROOT_TAG, runBenchSuite } from './bench-suite';
import { describe, flushTimers, it, mounted, report } from './harness';
import Screen from './svelte-suite-screen.svelte';
import { benchStateSetter } from './svelte-suite-bridge';

describe('the benchmark screen through the Svelte adapter', () => {
  it('runs the eight device steps', async () => {
    const surface = mount(ROOT_TAG, Screen, {});
    flushTimers();
    surface.commit();
    mounted();

    const apply = benchStateSetter();

    await runBenchSuite({
      name: 'svelte',
      // One more than every other adapter: the root, the container `createSurface` puts under it,
      // the screen's own wrapper, AND the DOM shim's root element (`createRootShimElement`,
      // `adapters/svelte/src/root-element.ts`), which Svelte needs as a mount target and no other
      // adapter has.
      chrome: 4,
      readTelemetry: () => readSurfaceTelemetry(ROOT_TAG),
      apply: async next => {
        apply(next);
        await tick();
        flushTimers();
        surface.commit();
      },
    });
  });
});

report();
