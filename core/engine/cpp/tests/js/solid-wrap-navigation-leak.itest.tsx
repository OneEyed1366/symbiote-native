// A scroll view wrapped by a refresh control is garbage once the screen is swapped out
// Only the Android scroll behavior reaches the engine wrap path

import { createSignal, For, Show, type JSX } from 'solid-js';
import { registerRefreshControlBehavior } from '@symbiote-native/components';
import { mount, unmount } from '@symbiote-native/solid';
import { readSurfaceTelemetry } from '@symbiote-native/engine';

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

const rowsOf = (count: number): number[] =>
  Array.from({ length: count }, (_, row) => row);

const Screen = (props: { count: number }): JSX.Element => (
  <scroll-view>
    <refresh-control refreshing={false} />
    <For each={rowsOf(props.count)}>
      {row => (
        <view>
          <text>{`row ${row}`}</text>
        </view>
      )}
    </For>
  </scroll-view>
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

const settle = async (count: number, cycles: number): Promise<number> => {
  const [cycle, setCycle] = createSignal(0);
  const surface = mount(ROOT_TAG, () => (
    <view>
      <Show when={cycle() % 2 === 0} fallback={<Screen count={count} />}>
        <Screen count={count} />
      </Show>
    </view>
  ));
  await tick();
  surface.commit();
  await advance(surface, () => setCycle(value => value + 1), cycles);
  const live = liveNodes();
  unmount(ROOT_TAG);
  return live;
};

describe('the Solid adapter on the real engine, with a wrapped scroll view', () => {
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
