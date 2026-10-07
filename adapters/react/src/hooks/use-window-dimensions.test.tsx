// RN's `useWindowDimensions`: the window metrics, re-read when `Dimensions` reports a change
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { Dimensions, type IDisplayMetrics } from '@symbiote-native/engine';
import { mount, unmount, useWindowDimensions } from '@symbiote-native/react';
import { installRecordingFabric } from '@symbiote-native/test-utils';

const ROOT_TAG = 90_411;
const fabric = installRecordingFabric();
const tick = (): Promise<void> =>
  new Promise(resolve => setTimeout(resolve, 0));

const FIRST: IDisplayMetrics = {
  width: 400,
  height: 800,
  scale: 3,
  fontScale: 1,
};
const ROTATED: IDisplayMetrics = {
  width: 800,
  height: 400,
  scale: 3,
  fontScale: 1,
};

function mountProbe(): IDisplayMetrics[] {
  const seen: IDisplayMetrics[] = [];
  function Probe(): null {
    seen.push(useWindowDimensions());
    return null;
  }
  mount(ROOT_TAG, <Probe />);
  return seen;
}

beforeEach(() => {
  fabric.reset();
  Dimensions.set({ window: FIRST, screen: FIRST });
});
afterEach(() => unmount(ROOT_TAG));

describe('useWindowDimensions', () => {
  it('starts from the current window metrics', async () => {
    const seen = mountProbe();
    await tick();

    expect(seen.at(-1)).toEqual(FIRST);
  });

  it('returns the new metrics once the window changes', async () => {
    const seen = mountProbe();
    await tick();

    Dimensions.set({ window: ROTATED, screen: ROTATED });
    await tick();

    expect(seen.at(-1)).toEqual(ROTATED);
  });

  it('does not render again for a change that leaves the metrics as they were', async () => {
    const seen = mountProbe();
    await tick();
    const rendersBefore = seen.length;

    Dimensions.set({ window: { ...FIRST }, screen: { ...FIRST } });
    await tick();

    expect(seen).toHaveLength(rendersBefore);
  });
});
