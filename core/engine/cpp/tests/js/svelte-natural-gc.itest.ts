// Screens swapped away with NO forced collection during the swaps, as a device runs
// Dead screens must still leave the C++ tree on the collector's own schedule, or memory climbs

import { readSurfaceTelemetry } from '@symbiote-native/engine';
import { mount, unmount } from '@symbiote-native/svelte';

import {
  collectGarbage,
  describe,
  expect,
  flushTimers,
  it,
  print,
  report,
} from './harness';

import Navigation from './svelte-navigation-probe.svelte';

const ROOT_TAG = 1;
const ROWS = 30;
const SWAP_COUNTS = [800, 1_600, 3_200, 6_400] as const;
const COLLECTIONS = 8;

const tick = (): Promise<void> =>
  new Promise(resolve => {
    setTimeout(resolve, 0);
    flushTimers();
  });

// Readable only while a surface is mounted: it comes from the surface telemetry
const liveNodes = (): number => readSurfaceTelemetry(ROOT_TAG)?.liveNodes ?? -1;

// `liveNodes` is one counter for the whole process, so an earlier run's garbage is cleared first
const clearProcess = (): number => {
  for (let pass = 0; pass < COLLECTIONS; pass += 1) collectGarbage();
  return liveNodes();
};

// One swap per tick, so every screen is committed before the next one replaces it
const advance = async (
  surface: { commit(): void },
  steps: number,
): Promise<void> => {
  if (steps === 0) return;
  await tick();
  surface.commit();
  await advance(surface, steps - 1);
};

// `base` is the mounted tree once the process is clear, the result is what the swaps left on top
const run = async (
  swaps: number,
): Promise<{ base: number; increment: number }> => {
  const surface = mount(ROOT_TAG, Navigation, { cycles: swaps, count: ROWS });
  // The telemetry needs a commit behind it. Two swaps, so the base and the end show the same branch
  await advance(surface, 2);
  const base = clearProcess();
  await advance(surface, swaps);
  const increment = liveNodes() - base;
  unmount(ROOT_TAG);
  return { base, increment };
};

const runAll = async (
  counts: readonly number[],
): Promise<{ base: number; increment: number }[]> => {
  const [next, ...rest] = counts;
  if (next === undefined) return [];
  return [await run(next), ...(await runAll(rest))];
};

describe('the Svelte adapter on the real engine, without a forced collection', () => {
  it('does not leave more dead screens after more swaps', async () => {
    const runs = await runAll(SWAP_COUNTS);
    print(
      `natural gc x${ROWS}: sizes ${SWAP_COUNTS.join('/')}, increments ${runs.map(each => each.increment).join('/')}`,
    );

    // Whatever the order, the run with the most swaps may not leave more dead nodes than the run
    // with the fewest, plus one menu of slack
    const bySwaps = SWAP_COUNTS.map((swaps, at) => ({ swaps, run: runs[at] }));
    const fewest = bySwaps.reduce((a, b) => (b.swaps < a.swaps ? b : a));
    const most = bySwaps.reduce((a, b) => (b.swaps > a.swaps ? b : a));
    expect(fewest.run?.base).toBeGreaterThan(0);
    expect(most.run?.increment).toBeLessThan(
      (fewest.run?.increment ?? 0) + (fewest.run?.base ?? 0) + 1,
    );
  });
});

report();
