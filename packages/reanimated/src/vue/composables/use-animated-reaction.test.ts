import { installRecordingFabric } from '@symbiote-native/test-utils';
import { nextTick, reactive } from '@vue/runtime-core';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { renderComposable } from '../../../test-support/render-composable';
import { settle, workletOf } from '../../../test-support/worklet';
import { createSharedValue } from '../../core/shared-value';
import { useAnimatedReaction } from './use-animated-reaction';

installRecordingFabric();

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

function reading(source: { value: number }) {
  return workletOf(() => source.value, [source], 11);
}

describe('useAnimatedReaction', () => {
  it('reacts to what prepare returns, and to the value before it', async () => {
    const { shared } = createSharedValue(1);
    const react = vi.fn();
    renderComposable(() =>
      useAnimatedReaction(reading(shared), workletOf(react, [], 12)),
    );
    await settle();
    react.mockClear();

    shared.value = 2;
    await settle();

    expect(react).toHaveBeenCalledWith(2, 1);
  });

  it('stops reacting once the component is gone', async () => {
    const { shared } = createSharedValue(1);
    const react = vi.fn();
    const composable = renderComposable(() =>
      useAnimatedReaction(reading(shared), workletOf(react, [], 12)),
    );
    await settle();

    composable.unmount();
    await settle();
    react.mockClear();
    shared.value = 5;
    await settle();

    expect(react).not.toHaveBeenCalled();
  });

  it('refuses a prepare that is not a worklet', () => {
    expect(() =>
      useAnimatedReaction(() => 1, workletOf(vi.fn(), [], 12)),
    ).toThrow(/useAnimatedReaction needs a worklet/);
  });

  it('keeps reacting after a reactive object it prepares from has changed', async () => {
    const props = reactive({ base: 10 });
    const { shared } = createSharedValue(1);
    const react = vi.fn();
    const prepare = workletOf(
      () => shared.value + props.base,
      [shared, props],
      13,
    );
    renderComposable(() =>
      useAnimatedReaction(prepare, workletOf(react, [], 12)),
    );
    await settle();

    props.base = 20;
    await nextTick();
    await settle();
    react.mockClear();
    shared.value = 2;
    await settle();

    expect(react).toHaveBeenCalledTimes(1);
  });
});
