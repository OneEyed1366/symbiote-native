import { installRecordingFabric } from '@symbiote-native/test-utils';
import { nextTick, reactive } from '@vue/runtime-core';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { startMapper } from 'react-native-reanimated/src/core';
import { renderComposable } from '../../../test-support/render-composable';
import { settle, workletOf } from '../../../test-support/worklet';
import { createSharedValue } from '../../core/shared-value';
import { useDerivedValue } from './use-derived-value';

installRecordingFabric();

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

beforeEach(() => {
  vi.useFakeTimers();
  vi.mocked(startMapper).mockClear();
});
afterEach(() => vi.useRealTimers());

function doubling(source: { value: number }) {
  return workletOf(() => source.value * 2, [source], 7);
}

describe('useDerivedValue', () => {
  it('starts out as what the updater returns', () => {
    const { shared } = createSharedValue(4);

    const composable = renderComposable(() =>
      useDerivedValue(doubling(shared)),
    );

    expect(composable.result().value).toBe(8);
  });

  it('follows the shared values the updater reads', async () => {
    const { shared } = createSharedValue(1);
    const composable = renderComposable(() =>
      useDerivedValue(doubling(shared)),
    );

    shared.value = 5;
    await settle();

    expect(composable.result().value).toBe(10);
  });

  it('stops following once the component is gone', async () => {
    const { shared } = createSharedValue(1);
    const composable = renderComposable(() =>
      useDerivedValue(doubling(shared)),
    );
    const derived = composable.result();
    await settle();

    composable.unmount();
    await settle();
    shared.value = 9;
    await settle();

    expect(derived.value).toBe(2);
  });

  it('refuses an updater that is not a worklet', () => {
    expect(() => useDerivedValue(() => 1)).toThrow(
      /useDerivedValue needs a worklet/,
    );
  });

  describe('with an updater that reads a reactive object', () => {
    function scaled(props: { factor: number }) {
      return workletOf(() => props.factor * 2, [props], 8);
    }

    it('starts the mapper again over what the object holds after a change', async () => {
      const props = reactive({ factor: 1 });
      renderComposable(() => useDerivedValue(scaled(props)));

      props.factor = 3;
      await nextTick();

      const closures = vi.mocked(startMapper).mock.calls.map(call => call[1]);
      expect(closures).toEqual([[{ factor: 1 }], [{ factor: 3 }]]);
    });
  });
});
