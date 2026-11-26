// A screen swapped out by a conditional is garbage once nothing names it
// The C++ tree must follow: a node-to-ancestor edge in JS would keep every old screen alive

import '@angular/compiler';
import { CUSTOM_ELEMENTS_SCHEMA, Component, signal } from '@angular/core';
import { mount, unmount } from '@symbiote-native/angular';
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

let plain: PlainScreens | undefined;
let scrolling: ScrollScreens | undefined;

class PlainScreens {
  readonly cycle = signal(0);
  readonly rows = signal<number[]>([]);
  constructor() {
    // eslint-disable-next-line @typescript-eslint/no-this-alias
    plain = this;
  }
}

class ScrollScreens {
  readonly cycle = signal(0);
  readonly rows = signal<number[]>([]);
  constructor() {
    // eslint-disable-next-line @typescript-eslint/no-this-alias
    scrolling = this;
  }
}

Component({
  selector: 'symbiote-plain-screens',
  standalone: true,
  schemas: [CUSTOM_ELEMENTS_SCHEMA],
  template: `
    <view>
      @if (cycle() % 2 === 0) {
        <view>@for (row of rows(); track row) {<view><text>{{ 'row ' + row }}</text></view>}</view>
      } @else {
        <view>@for (row of rows(); track row) {<view><text>{{ 'row ' + row }}</text></view>}</view>
      }
    </view>
  `,
})(PlainScreens);

Component({
  selector: 'symbiote-scroll-screens',
  standalone: true,
  schemas: [CUSTOM_ELEMENTS_SCHEMA],
  template: `
    <view>
      @if (cycle() % 2 === 0) {
        <scroll-view>@for (row of rows(); track row) {<view><text>{{ 'row ' + row }}</text></view>}</scroll-view>
      } @else {
        <scroll-view>@for (row of rows(); track row) {<view><text>{{ 'row ' + row }}</text></view>}</scroll-view>
      }
    </view>
  `,
})(ScrollScreens);

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
  screen: typeof PlainScreens | typeof ScrollScreens,
  current: () => PlainScreens | ScrollScreens | undefined,
  count: number,
  cycles: number,
): Promise<number> => {
  const surface = mount(ROOT_TAG, screen);
  const instance = current();
  instance?.rows.set(Array.from({ length: count }, (_, row) => row));
  await tick();
  surface.commit();
  await advance(
    surface,
    () => current()?.cycle.update(value => value + 1),
    cycles,
  );
  const live = liveNodes();
  unmount(ROOT_TAG);
  return live;
};

describe('the Angular adapter on the real engine', () => {
  for (const { name, rows, slack } of SCREENS) {
    it(`gives back the ${name} screens of ${rows} rows it navigated away from`, async () => {
      const [screen, current] =
        name === 'view'
          ? ([PlainScreens, () => plain] as const)
          : ([ScrollScreens, () => scrolling] as const);
      const oneScreen = await settle(screen, current, rows, 0);
      const afterSwaps = await settle(screen, current, rows, SCREEN_SWAPS);
      const afterMore = await settle(screen, current, rows, SCREEN_SWAPS * 2);
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
