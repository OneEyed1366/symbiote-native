import { installRecordingFabric } from '@symbiote-native/test-utils';
import { describe, expect, it, vi } from 'vitest';
import { cancelAnimation } from 'react-native-reanimated/src/animation';
import { renderHook } from '../../../test-support/render-hook';
import { useSharedValue } from './use-shared-value';

installRecordingFabric();

vi.mock('react-native-reanimated/src/animation', async importOriginal => ({
  ...(await importOriginal<
    typeof import('react-native-reanimated/src/animation')
  >()),
  cancelAnimation: vi.fn(),
}));

describe('useSharedValue', () => {
  it('holds the initial value', () => {
    const hook = renderHook(() => useSharedValue(5), undefined);

    expect(hook.latest().value).toBe(5);
  });

  it('is the same shared value on every render', () => {
    const hook = renderHook(() => useSharedValue(1), undefined);
    const first = hook.latest();

    hook.rerender(undefined);

    expect(hook.latest()).toBe(first);
  });

  it('calls a function initial value once, and holds what it returned', () => {
    const initial = vi.fn(() => 'made');
    const hook = renderHook(() => useSharedValue(initial), undefined);
    hook.rerender(undefined);

    expect(initial).toHaveBeenCalledTimes(1);
    expect(hook.latest().value).toBe('made');
  });

  it('cancels the animation it may be running once the component is gone', () => {
    const hook = renderHook(() => useSharedValue(1), undefined);
    const shared = hook.latest();

    hook.unmount();

    expect(cancelAnimation).toHaveBeenCalledWith(shared);
  });
});
