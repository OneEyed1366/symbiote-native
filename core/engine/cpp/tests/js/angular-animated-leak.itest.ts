// A screen swapped out must leave the animated value it shared, or the value keeps every old screen
// Reading the child list is the positive control: it is full while a screen stands

import '@angular/compiler';
import { CUSTOM_ELEMENTS_SCHEMA, Component, signal } from '@angular/core';
import { mount, unmount } from '@symbiote-native/angular';
import { AnimatedValue, readSurfaceTelemetry } from '@symbiote-native/engine';

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
const ROWS = 30;
const SLACK = 150;

const tick = (): Promise<void> =>
  new Promise(resolve => {
    setTimeout(resolve, 0);
    flushTimers();
  });

const liveNodes = (): number => {
  for (let pass = 0; pass < COLLECTIONS; pass += 1) collectGarbage();
  return readSurfaceTelemetry(ROOT_TAG)?.liveNodes ?? -1;
};

let screens: SharedScreens | undefined;

class SharedScreens {
  readonly cycle = signal(0);
  readonly rows = signal<number[]>([]);
  readonly shared = new AnimatedValue(1);
  readonly style = { opacity: this.shared };
  constructor() {
    // eslint-disable-next-line @typescript-eslint/no-this-alias
    screens = this;
  }
}

Component({
  selector: 'symbiote-shared-screens',
  standalone: true,
  schemas: [CUSTOM_ELEMENTS_SCHEMA],
  template: `
    <view>
      @if (cycle() % 2 === 0) {
        <view [style]="style">@for (row of rows(); track row) {<view><text>{{ 'row ' + row }}</text></view>}</view>
      } @else {
        <view [style]="style">@for (row of rows(); track row) {<view><text>{{ 'row ' + row }}</text></view>}</view>
      }
    </view>
  `,
})(SharedScreens);

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
  cycles: number,
): Promise<{ live: number; subscribed: number }> => {
  const surface = mount(ROOT_TAG, SharedScreens);
  screens?.rows.set(Array.from({ length: ROWS }, (_, row) => row));
  await tick();
  surface.commit();
  await advance(
    surface,
    () => screens?.cycle.update(value => value + 1),
    cycles,
  );
  const live = liveNodes();
  const subscribed = screens?.shared.__getChildren().length ?? -1;
  unmount(ROOT_TAG);
  return { live, subscribed };
};

describe('the Angular adapter on the real engine, with an animated value shared by every screen', () => {
  it('leaves only the standing screen on the value and gives back the swapped ones', async () => {
    await settle(1);
    const oneScreen = await settle(1);
    const afterSwaps = await settle(SCREEN_SWAPS);
    const afterMore = await settle(SCREEN_SWAPS * 2);
    print(
      `animated x${ROWS}: live ${oneScreen.live}, ${afterSwaps.live}, ${afterMore.live}; subscribed ${oneScreen.subscribed}, ${afterSwaps.subscribed}, ${afterMore.subscribed}`,
    );

    expect(oneScreen.subscribed).toBeGreaterThan(0);
    expect(afterSwaps.subscribed).toBe(oneScreen.subscribed);
    expect(afterMore.subscribed).toBe(oneScreen.subscribed);
    expect(afterSwaps.live - oneScreen.live).toBeLessThan(SLACK + 1);
    expect(afterMore.live - afterSwaps.live).toBeLessThan(SLACK + 1);
  });
});

report();
