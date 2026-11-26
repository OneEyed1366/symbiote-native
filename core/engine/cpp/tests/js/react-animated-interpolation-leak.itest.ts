// A sticky header hangs its own interpolation on the scroll value every header shares
// A swapped-out screen must leave that value, or the value keeps every old header and its screen

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

const navigation = (scroll: AnimatedValue) =>
  function Navigation(): ReactElement {
    const [cycle, setCycle] = useState(0);
    bump = () => setCycle(value => value + 1);
    const pin = scroll.interpolate({
      inputRange: [0, 100],
      outputRange: [0, 100],
    });
    const header = createElement(
      'view',
      { style: { transform: [{ translateY: pin }] } },
      rows(),
    );
    return createElement(
      'view',
      null,
      createElement('view', { key: cycle % 2 }, header),
    );
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
  const scroll = new AnimatedValue(0);
  const surface = mount(ROOT_TAG, createElement(navigation(scroll)));
  await tick();
  surface.commit();
  await advance(surface, cycles);
  const live = liveNodes();
  const subscribed = scroll.__getChildren().length;
  unmount(ROOT_TAG);
  return { live, subscribed };
};

describe('the React adapter on the real engine, with an interpolation on a shared scroll value', () => {
  it('leaves only the standing header on the value and gives back the swapped screens', async () => {
    await settle(1);
    const oneScreen = await settle(1);
    const afterSwaps = await settle(SCREEN_SWAPS);
    const afterMore = await settle(SCREEN_SWAPS * 2);
    print(
      `interpolation x${ROWS}: live ${oneScreen.live}, ${afterSwaps.live}, ${afterMore.live}; subscribed ${oneScreen.subscribed}, ${afterSwaps.subscribed}, ${afterMore.subscribed}`,
    );

    expect(oneScreen.subscribed).toBeGreaterThan(0);
    expect(afterSwaps.subscribed).toBe(oneScreen.subscribed);
    expect(afterMore.subscribed).toBe(oneScreen.subscribed);
    expect(afterSwaps.live - oneScreen.live).toBeLessThan(SLACK + 1);
    expect(afterMore.live - afterSwaps.live).toBeLessThan(SLACK + 1);
  });
});

report();
