// A screen swapped out must leave the animated value it shared, or the value keeps every old screen
// Reading the child list is the positive control: it is full while a screen stands

import { createElement, useState, type ReactElement } from 'react';

import { AnimatedValue, readSurfaceTelemetry } from '@symbiote-native/engine';
import { mount, unmount } from '@symbiote-native/react';

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

const rows = (): ReactElement[] =>
  Array.from({ length: ROWS }, (_, row) =>
    createElement(
      'view',
      { key: row },
      createElement('text', null, `row ${row}`),
    ),
  );

let bump = (): void => undefined;

const navigation = (shared: AnimatedValue) =>
  function Navigation(): ReactElement {
    const [cycle, setCycle] = useState(0);
    bump = () => setCycle(value => value + 1);
    const screen = createElement(
      'view',
      { key: cycle % 2, style: { opacity: shared } },
      rows(),
    );
    return createElement('view', null, screen);
  };

// One swap per tick, so every screen is committed before the next one replaces it
const advance = async (
  surface: { commit(): void },
  steps: number,
): Promise<void> => {
  if (steps === 0) return;
  bump();
  await tick();
  surface.commit();
  await advance(surface, steps - 1);
};

const settle = async (
  cycles: number,
): Promise<{ live: number; subscribed: number }> => {
  const shared = new AnimatedValue(1);
  const surface = mount(ROOT_TAG, createElement(navigation(shared)));
  await tick();
  surface.commit();
  await advance(surface, cycles);
  const live = liveNodes();
  const subscribed = shared.__getChildren().length;
  unmount(ROOT_TAG);
  return { live, subscribed };
};

describe('the React adapter on the real engine, with an animated value shared by every screen', () => {
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
