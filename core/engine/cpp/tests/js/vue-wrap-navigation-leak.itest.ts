// A scroll view wrapped by a refresh control is garbage once the screen is swapped out
// Only the Android scroll behavior reaches the engine wrap path

import { registerRefreshControlBehavior } from '@symbiote-native/components';
import { readSurfaceTelemetry } from '@symbiote-native/engine';
import { h, mount, ref, unmount } from '@symbiote-native/vue';

import { registerScrollViewBehavior } from '../../../../components/src/behaviors/scroll-view/index.android';

import {
  collectGarbage,
  committedShape,
  describe,
  expect,
  flushTimers,
  it,
  print,
  report,
} from './harness';

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

const rows = (count: number): ReturnType<typeof h>[] =>
  Array.from({ length: count }, (_, row) =>
    h('view', { key: row }, [h('text', null, `row ${row}`)]),
  );

// One swap per tick, so every screen is committed before the next one replaces it
const advance = async (
  surface: { commit(): void },
  bump: () => void,
  steps: number,
): Promise<void> => {
  if (steps === 0) return;
  bump();
  await tick();
  surface.commit();
  await advance(surface, bump, steps - 1);
};

// Two component types, so a swap unmounts a component instance the way a navigation does
const screenOf = (count: number) => ({
  render: () =>
    h('scroll-view', null, [
      h('refresh-control', { refreshing: false }),
      ...rows(count),
    ]),
});

const settle = async (count: number, cycles: number): Promise<number> => {
  const cycle = ref(0);
  const [first, second] = [screenOf(count), screenOf(count)];
  const surface = mount(ROOT_TAG, {
    render: () => h('view', null, [h(cycle.value % 2 === 0 ? first : second)]),
  });
  await tick();
  surface.commit();
  await advance(
    surface,
    () => {
      cycle.value += 1;
    },
    cycles,
  );
  const live = liveNodes();
  unmount(ROOT_TAG);
  return live;
};

describe('the Vue adapter on the real engine, with a wrapped scroll view', () => {
  // Vue asks for the owner's parent and gets the wrapper, so a swap left the old screen in place
  it('removes the swapped-out wrapped screen from the committed tree', async () => {
    const cycle = ref(0);
    const [first, second] = [screenOf(1), screenOf(1)];
    const surface = mount(ROOT_TAG, {
      render: () =>
        h('view', null, [h(cycle.value % 2 === 0 ? first : second)]),
    });
    await tick();
    surface.commit();
    const oneScreen = committedShape();
    await advance(
      surface,
      () => {
        cycle.value += 1;
      },
      2,
    );

    expect(committedShape()).toBe(oneScreen);
    unmount(ROOT_TAG);
  });

  for (const { count, slack } of SCREEN_SIZES) {
    it(`gives back the wrapped screens of ${count} rows it navigated away from`, async () => {
      const oneScreen = await settle(count, 0);
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
