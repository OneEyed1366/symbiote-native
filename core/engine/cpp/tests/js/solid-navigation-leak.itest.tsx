// A screen swapped out by a conditional is garbage once nothing names it
// The C++ tree must follow: a node-to-ancestor edge in JS would keep every old screen alive

import { createSignal, For, Show, type JSX } from 'solid-js';
import { mount, unmount } from '@symbiote-native/solid';
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
  { name: 'view', rows: 30, slack: 150 },
  { name: 'scroll-view', rows: 30, slack: 150 },
  { name: 'view', rows: 1, slack: 2 },
  { name: 'scroll-view', rows: 1, slack: 2 },
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

const rowsOf = (count: number): number[] =>
  Array.from({ length: count }, (_, row) => row);

const Rows = (props: { count: number }): JSX.Element => (
  <For each={rowsOf(props.count)}>
    {row => (
      <view>
        <text>{`row ${row}`}</text>
      </view>
    )}
  </For>
);

const Plain = (props: { count: number }): JSX.Element => (
  <view>
    <Rows count={props.count} />
  </view>
);

const Scrolling = (props: { count: number }): JSX.Element => (
  <scroll-view>
    <Rows count={props.count} />
  </scroll-view>
);

const SCREEN_OF = { view: Plain, 'scroll-view': Scrolling } as const;

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

const settle = async (
  Screen: (props: { count: number }) => JSX.Element,
  count: number,
  cycles: number,
): Promise<number> => {
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

describe('the Solid adapter on the real engine', () => {
  for (const { name, rows, slack } of SCREENS) {
    it(`gives back the ${name} screens of ${rows} rows it navigated away from`, async () => {
      const oneScreen = await settle(SCREEN_OF[name], rows, 0);
      const afterSwaps = await settle(SCREEN_OF[name], rows, SCREEN_SWAPS);
      const afterMore = await settle(SCREEN_OF[name], rows, SCREEN_SWAPS * 2);
      print(
        `${name} x${rows}: 0 swaps ${oneScreen}, ${SCREEN_SWAPS} ${afterSwaps}, ${SCREEN_SWAPS * 2} ${afterMore}`,
      );

      expect(oneScreen).toBeGreaterThan(0);
      expect(afterSwaps - oneScreen).toBeLessThan(slack + 1);
      expect(afterMore - afterSwaps).toBeLessThan(slack + 1);
    });
  }
});

report();
