// The whole benchmark screen through the Svelte adapter, all eight device steps, headless
// The steps, the oracle and the one-file-per-arm rule are explained in `bench-suite.ts`
// Effects are batched, so a step settles with `tick()` inside the stopwatch, as on a device

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
      // One more than every other adapter: the root, the `createSurface` container, the screen's
      // wrapper and the mount-target root view (`createRootElement` in `adapters/svelte`)
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
