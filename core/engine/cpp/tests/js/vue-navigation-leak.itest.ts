// A screen swapped out by a conditional is garbage once nothing names it
// The C++ tree must follow: a node-to-ancestor edge in JS would keep every old screen alive

import { h, mount, ref, unmount } from '@symbiote-native/vue';
import { readSurfaceTelemetry } from '@symbiote-native/engine';

import {
  collectGarbage,
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
// A leak is near two thousand nodes for 30 rows and about eighty for one, a flat tree moves by none
const SCREENS = [
  { tag: 'view', rows: 30, slack: 150 },
  { tag: 'scroll-view', rows: 30, slack: 150 },
  { tag: 'view', rows: 1, slack: 2 },
  { tag: 'scroll-view', rows: 1, slack: 2 },
] as const;

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
const screenOf = (tag: string, count: number) => ({
  render: () => h(tag, null, rows(count)),
});

const settle = async (
  tag: string,
  count: number,
  cycles: number,
): Promise<number> => {
  const cycle = ref(0);
  const [first, second] = [screenOf(tag, count), screenOf(tag, count)];
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

describe('the Vue adapter on the real engine', () => {
  for (const { tag, rows: count, slack } of SCREENS) {
    it(`gives back the ${tag} screens of ${count} rows it navigated away from`, async () => {
      const oneScreen = await settle(tag, count, 0);
      const afterSwaps = await settle(tag, count, SCREEN_SWAPS);
      const afterMore = await settle(tag, count, SCREEN_SWAPS * 2);
      print(
        `${tag} x${count}: 0 swaps ${oneScreen}, ${SCREEN_SWAPS} ${afterSwaps}, ${SCREEN_SWAPS * 2} ${afterMore}`,
      );

      expect(oneScreen).toBeGreaterThan(0);
      expect(afterSwaps - oneScreen).toBeLessThan(slack + 1);
      expect(afterMore - afterSwaps).toBeLessThan(slack + 1);
    });
  }
});

report();
