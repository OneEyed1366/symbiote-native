// A scroll view wrapped by a refresh control is garbage once the screen is swapped out
// Only the Android scroll behavior reaches the `{ owner }` wrap path of the Svelte renderer

import { registerRefreshControlBehavior } from '@symbiote-native/components';
import { readSurfaceTelemetry } from '@symbiote-native/engine';
import { mount, unmount } from '@symbiote-native/svelte';

import { registerScrollViewBehavior } from '../../../../components/src/behaviors/scroll-view/index.android';

import {
  collectGarbage,
  describe,
  expect,
  flushTimers,
  it,
  print,
  report,
} from './harness';

// esbuild resolves this through the `.svelte` loader in `scripts/run-itests.mjs`
import WrapNavigation from './svelte-wrap-navigation-probe.svelte';

const ROOT_TAG = 1;
const SCREEN_SWAPS = 20;
// C++ frees a dropped tree one level per collection, and a screen row is three levels deep
const COLLECTIONS = 8;
const SCREEN_SIZES = [
  { count: 1, slack: 2 },
  { count: 30, slack: 150 },
] as const;

registerScrollViewBehavior();
registerRefreshControlBehavior();

const tick = (): Promise<void> =>
  new Promise(resolve => {
    setTimeout(resolve, 0);
    flushTimers();
  });

const liveNodes = (): number => {
  for (let pass = 0; pass < COLLECTIONS; pass += 1) collectGarbage();
  return readSurfaceTelemetry(ROOT_TAG)?.liveNodes ?? -1;
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

const settle = async (count: number, cycles: number): Promise<number> => {
  await advance(mount(ROOT_TAG, WrapNavigation, { cycles, count }), cycles + 2);
  const live = liveNodes();
  unmount(ROOT_TAG);
  return live;
};

describe('the Svelte adapter on the real engine, with a wrapped scroll view', () => {
  for (const { count, slack } of SCREEN_SIZES) {
    it(`gives back the wrapped screens of ${count} rows it navigated away from`, async () => {
      // The first unmount of a wrapped app leaves four nodes once, so the baseline comes after it
      await settle(count, 1);
      const oneScreen = await settle(count, 1);
      const afterSwaps = await settle(count, SCREEN_SWAPS);
      const afterMore = await settle(count, SCREEN_SWAPS * 2);
      print(
        `wrap x${count}: 0 swaps ${oneScreen}, ${SCREEN_SWAPS} ${afterSwaps}, ${SCREEN_SWAPS * 2} ${afterMore}`,
      );

      expect(oneScreen).toBeGreaterThan(0);
      expect(afterSwaps - oneScreen).toBeLessThan(slack + 1);
      expect(afterMore - afterSwaps).toBeLessThan(slack + 1);
    });
  }
});

report();
