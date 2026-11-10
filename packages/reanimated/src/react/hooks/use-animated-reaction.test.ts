import { installRecordingFabric } from '@symbiote-native/test-utils';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { renderHook } from '../../../test-support/render-hook';
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
    renderHook(
      () => useAnimatedReaction(reading(shared), workletOf(react, [], 12)),
      undefined,
    );
    await settle();
    react.mockClear();

    shared.value = 2;
    await settle();

    expect(react).toHaveBeenCalledWith(2, 1);
  });

  it('does not react again while what prepare returns stays the same', async () => {
    const { shared } = createSharedValue(1);
    const react = vi.fn();
    const hook = renderHook(
      () => useAnimatedReaction(reading(shared), workletOf(react, [], 12)),
      undefined,
    );
    await settle();
    react.mockClear();

    hook.rerender(undefined);
    await settle();

    expect(react).not.toHaveBeenCalled();
  });

  it('stops reacting once the component is gone', async () => {
    const { shared } = createSharedValue(1);
    const react = vi.fn();
    const hook = renderHook(
      () => useAnimatedReaction(reading(shared), workletOf(react, [], 12)),
      undefined,
    );
    await settle();

    hook.unmount();
    await settle();
    react.mockClear();
    shared.value = 5;
    await settle();

    expect(react).not.toHaveBeenCalled();
  });

  it('refuses a prepare that is not a worklet', () => {
    expect(() =>
      renderHook(
        () => useAnimatedReaction(() => 1, workletOf(vi.fn(), [], 12)),
        undefined,
      ),
    ).toThrow(/useAnimatedReaction needs a worklet/);
  });
});
