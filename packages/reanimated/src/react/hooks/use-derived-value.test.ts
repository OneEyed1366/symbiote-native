import { installRecordingFabric } from '@symbiote-native/test-utils';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { vi } from 'vitest';
import { renderHook } from '../../../test-support/render-hook';
import { settle, workletOf } from '../../../test-support/worklet';
import { createSharedValue } from '../../core/shared-value';
import { useDerivedValue } from './use-derived-value';

installRecordingFabric();

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

function doubling(source: { value: number }) {
  return workletOf(() => source.value * 2, [source], 7);
}

describe('useDerivedValue', () => {
  it('starts out as what the updater returns', () => {
    const { shared } = createSharedValue(4);

    const hook = renderHook(() => useDerivedValue(doubling(shared)), undefined);

    expect(hook.latest().value).toBe(8);
  });

  it('follows the shared values the updater reads', async () => {
    const { shared } = createSharedValue(1);
    const hook = renderHook(() => useDerivedValue(doubling(shared)), undefined);

    shared.value = 5;
    await settle();

    expect(hook.latest().value).toBe(10);
  });

  it('is the same derived value on every render', () => {
    const { shared } = createSharedValue(1);
    const hook = renderHook(() => useDerivedValue(doubling(shared)), undefined);
    const first = hook.latest();

    hook.rerender(undefined);

    expect(hook.latest()).toBe(first);
  });

  it('follows the new shared value once the updater reads another one', async () => {
    const first = createSharedValue(1).shared;
    const second = createSharedValue(100).shared;
    const hook = renderHook(
      (source: { value: number }) => useDerivedValue(doubling(source)),
      first,
    );
    await settle();

    hook.rerender(second);
    second.value = 150;
    await settle();

    expect(hook.latest().value).toBe(300);
  });

  it('stops following once the component is gone', async () => {
    const { shared } = createSharedValue(1);
    const hook = renderHook(() => useDerivedValue(doubling(shared)), undefined);
    const derived = hook.latest();
    await settle();

    hook.unmount();
    await settle();
    shared.value = 9;
    await settle();

    expect(derived.value).toBe(2);
  });

  it('refuses an updater that is not a worklet', () => {
    expect(() => renderHook(() => useDerivedValue(() => 1), undefined)).toThrow(
      /useDerivedValue needs a worklet/,
    );
  });
});
