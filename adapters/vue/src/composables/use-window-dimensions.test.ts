// `useWindowDimensions` of Vue: the window metrics, replaced when `Dimensions` reports a change

import { defineComponent, h, type Ref, type VNode } from '@vue/runtime-core';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { Dimensions, type IDisplayMetrics } from '@symbiote-native/engine';
import { mount, unmount } from '@symbiote-native/vue';
import { installRecordingFabric } from '@symbiote-native/test-utils';
import { useWindowDimensions } from './use-window-dimensions';

const ROOT_TAG = 90_512;
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

function mountProbe(): Ref<IDisplayMetrics> {
  let dimensions: Ref<IDisplayMetrics> | undefined;
  const Probe = defineComponent(() => {
    dimensions = useWindowDimensions();
    return (): VNode => h('view');
  });
  mount(ROOT_TAG, { render: (): VNode => h(Probe) });
  if (dimensions === undefined) throw new Error('the probe did not set up');
  return dimensions;
}

beforeEach(() => {
  fabric.reset();
  Dimensions.set({ window: FIRST, screen: FIRST });
});
afterEach(() => unmount(ROOT_TAG));

describe('useWindowDimensions', () => {
  it('starts from the current window metrics', async () => {
    const dimensions = mountProbe();
    await tick();

    expect(dimensions.value).toEqual(FIRST);
  });

  it('holds the new metrics once the window changes', async () => {
    const dimensions = mountProbe();
    await tick();

    Dimensions.set({ window: ROTATED, screen: ROTATED });

    expect(dimensions.value).toEqual(ROTATED);
  });

  it('keeps the same value for a change that leaves the metrics as they were', async () => {
    const dimensions = mountProbe();
    await tick();
    const before = dimensions.value;

    Dimensions.set({ window: { ...FIRST }, screen: { ...FIRST } });

    expect(dimensions.value).toBe(before);
  });

  it('stops following after unmount', async () => {
    const dimensions = mountProbe();
    await tick();
    unmount(ROOT_TAG);

    Dimensions.set({ window: ROTATED, screen: ROTATED });

    expect(dimensions.value).toEqual(FIRST);
  });
});
