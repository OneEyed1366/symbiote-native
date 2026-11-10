import { installRecordingFabric } from '@symbiote-native/test-utils';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { updateProps } from 'react-native-reanimated/src/updateProps';
import { renderHook } from '../../../test-support/render-hook';
import {
  recordUpdateWrites,
  type IUpdateWrite,
} from '../../../test-support/update-writes';
import { settle, workletOf } from '../../../test-support/worklet';
import { createSharedValue } from '../../core/shared-value';
import { useAnimatedStyle } from './use-animated-style';

installRecordingFabric();

vi.mock('react-native-reanimated/src/updateProps', () => ({
  updateProps: vi.fn(),
}));

const VIEW = { tag: 7, shadowNodeWrapper: {} };
const writes: IUpdateWrite[] = [];

beforeEach(() => {
  vi.useFakeTimers();
  recordUpdateWrites(updateProps, writes);
});

afterEach(() => vi.useRealTimers());

function opacityOf(source: { value: number }) {
  return workletOf(() => ({ opacity: source.value }), [source], 21);
}

function attached(handle: ReturnType<typeof useAnimatedStyle>) {
  handle.viewDescriptors.add(VIEW, handle.styleUpdaterContainer);
}

describe('useAnimatedStyle', () => {
  it('starts out as what the updater returns', () => {
    const { shared } = createSharedValue(0.5);

    const hook = renderHook(
      () => useAnimatedStyle(opacityOf(shared)),
      undefined,
    );

    expect(hook.latest().initial.value).toEqual({ opacity: 0.5 });
  });

  it('is the same handle on every render', () => {
    const { shared } = createSharedValue(1);
    const hook = renderHook(
      () => useAnimatedStyle(opacityOf(shared)),
      undefined,
    );
    const first = hook.latest();

    hook.rerender(undefined);

    expect(hook.latest()).toBe(first);
  });

  it('writes to an attached view when a shared value changes', async () => {
    const { shared } = createSharedValue(1);
    const hook = renderHook(
      () => useAnimatedStyle(opacityOf(shared)),
      undefined,
    );
    attached(hook.latest());
    await settle();
    writes.length = 0;

    shared.value = 0.25;
    await settle();

    expect(writes).toEqual([
      { views: [VIEW], updates: { opacity: 0.25 }, isAnimatedProps: false },
    ]);
  });

  it('follows the new shared value once the updater reads another one', async () => {
    const first = createSharedValue(1).shared;
    const second = createSharedValue(1).shared;
    const hook = renderHook(
      (source: { value: number }) => useAnimatedStyle(opacityOf(source)),
      first,
    );
    attached(hook.latest());
    await settle();

    hook.rerender(second);
    await settle();
    writes.length = 0;
    first.value = 0.9;
    second.value = 0.1;
    await settle();

    expect(writes.map(write => write.updates)).toEqual([{ opacity: 0.1 }]);
  });

  it('stops writing once the component is gone', async () => {
    const { shared } = createSharedValue(1);
    const hook = renderHook(
      () => useAnimatedStyle(opacityOf(shared)),
      undefined,
    );
    attached(hook.latest());
    await settle();

    hook.unmount();
    await settle();
    writes.length = 0;
    shared.value = 0.3;
    await settle();

    expect(writes).toEqual([]);
  });

  it('refuses an updater that is not a worklet', () => {
    expect(() =>
      renderHook(() => useAnimatedStyle(() => ({ opacity: 1 })), undefined),
    ).toThrow(/useAnimatedStyle needs a worklet/);
  });
});
