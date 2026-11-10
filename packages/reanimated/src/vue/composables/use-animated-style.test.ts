import { installRecordingFabric } from '@symbiote-native/test-utils';
import { nextTick, reactive } from '@vue/runtime-core';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { startMapper } from 'react-native-reanimated/src/core';
import { updateProps } from 'react-native-reanimated/src/updateProps';
import { renderComposable } from '../../../test-support/render-composable';
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

function withSpiedMapper<Module extends { startMapper: typeof startMapper }>(
  actual: Module,
): Module {
  return { ...actual, startMapper: vi.fn(actual.startMapper) };
}

vi.mock('react-native-reanimated/src/core', async importOriginal =>
  withSpiedMapper(
    await importOriginal<typeof import('react-native-reanimated/src/core')>(),
  ),
);

const VIEW = { tag: 7, shadowNodeWrapper: {} };
const writes: IUpdateWrite[] = [];

beforeEach(() => {
  vi.useFakeTimers();
  vi.mocked(startMapper).mockClear();
  recordUpdateWrites(updateProps, writes);
});

afterEach(() => vi.useRealTimers());

function opacityOf(source: { value: number }) {
  return workletOf(() => ({ opacity: source.value }), [source], 21);
}

function attached(handle: ReturnType<typeof useAnimatedStyle>) {
  handle.viewDescriptors.add(VIEW, handle.styleUpdaterContainer);
}

// What the mapper was handed as the closure, one entry per start
function closuresOfMappers(): unknown[] {
  return vi.mocked(startMapper).mock.calls.map(call => call[1]);
}

describe('useAnimatedStyle', () => {
  it('starts out as what the updater returns', () => {
    const { shared } = createSharedValue(0.5);

    const composable = renderComposable(() =>
      useAnimatedStyle(opacityOf(shared)),
    );

    expect(composable.result().initial.value).toEqual({ opacity: 0.5 });
  });

  it('writes to an attached view when a shared value changes', async () => {
    const { shared } = createSharedValue(1);
    const composable = renderComposable(() =>
      useAnimatedStyle(opacityOf(shared)),
    );
    attached(composable.result());
    await settle();
    writes.length = 0;

    shared.value = 0.25;
    await settle();

    expect(writes).toEqual([
      { views: [VIEW], updates: { opacity: 0.25 }, isAnimatedProps: false },
    ]);
  });

  it('stops writing once the component is gone', async () => {
    const { shared } = createSharedValue(1);
    const composable = renderComposable(() =>
      useAnimatedStyle(opacityOf(shared)),
    );
    attached(composable.result());
    await settle();

    composable.unmount();
    await settle();
    writes.length = 0;
    shared.value = 0.3;
    await settle();

    expect(writes).toEqual([]);
  });

  it('refuses an updater that is not a worklet', () => {
    expect(() => useAnimatedStyle(() => ({ opacity: 1 }))).toThrow(
      /useAnimatedStyle needs a worklet/,
    );
  });

  describe('with an updater that reads a reactive object', () => {
    function scaleOf(props: { scale: number }) {
      return workletOf(() => ({ opacity: props.scale }), [props], 22);
    }

    it('hands the runtime a copy of the object, never the object itself', () => {
      const props = reactive({ scale: 1 });

      renderComposable(() => useAnimatedStyle(scaleOf(props)));

      const [closure] = closuresOfMappers();
      expect(closure).toEqual([{ scale: 1 }]);
      expect(Array.isArray(closure) && closure[0]).not.toBe(props);
    });

    it('starts the mapper again over what the object holds after a change', async () => {
      const props = reactive({ scale: 1 });
      renderComposable(() => useAnimatedStyle(scaleOf(props)));

      props.scale = 0.5;
      await nextTick();

      expect(closuresOfMappers()).toEqual([[{ scale: 1 }], [{ scale: 0.5 }]]);
    });

    it('starts the mapper once for several changes before the next tick', async () => {
      const props = reactive({ scale: 1 });
      renderComposable(() => useAnimatedStyle(scaleOf(props)));

      props.scale = 0.5;
      props.scale = 0.25;
      await nextTick();

      expect(closuresOfMappers()).toHaveLength(2);
    });

    it('does not start it again once the component is gone', async () => {
      const props = reactive({ scale: 1 });
      const composable = renderComposable(() =>
        useAnimatedStyle(scaleOf(props)),
      );

      composable.unmount();
      props.scale = 0.5;
      await nextTick();

      expect(closuresOfMappers()).toHaveLength(1);
    });
  });
});
