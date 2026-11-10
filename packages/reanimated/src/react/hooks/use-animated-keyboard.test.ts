import { installRecordingFabric } from '@symbiote-native/test-utils';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { KeyboardState } from 'react-native-reanimated/src/commonTypes';
import * as core from 'react-native-reanimated/src/core';
import { renderHook } from '../../../test-support/render-hook';
import { useAnimatedKeyboard } from './use-animated-keyboard';

installRecordingFabric();

vi.mock('react-native-reanimated/src/core', async importOriginal => ({
  ...(await importOriginal<typeof core>()),
  subscribeForKeyboardEvents: vi.fn(),
  unsubscribeFromKeyboardEvents: vi.fn(),
}));

const subscribe = vi.mocked(core.subscribeForKeyboardEvents);
const unsubscribe = vi.mocked(core.unsubscribeFromKeyboardEvents);

beforeEach(() => {
  subscribe.mockReset();
  unsubscribe.mockReset();
  subscribe.mockReturnValue(5);
});

describe('useAnimatedKeyboard', () => {
  it('starts unknown and zero high', () => {
    const hook = renderHook(() => useAnimatedKeyboard(), undefined);

    expect(hook.latest().state.value).toBe(KeyboardState.UNKNOWN);
    expect(hook.latest().height.value).toBe(0);
  });

  it('subscribes once however often it renders', () => {
    const hook = renderHook(() => useAnimatedKeyboard(), undefined);

    hook.rerender(undefined);

    expect(subscribe).toHaveBeenCalledTimes(1);
  });

  it('is the same info on every render', () => {
    const hook = renderHook(() => useAnimatedKeyboard(), undefined);
    const first = hook.latest();

    hook.rerender(undefined);

    expect(hook.latest()).toBe(first);
  });

  it('writes what the keyboard reports into the shared values', () => {
    const hook = renderHook(() => useAnimatedKeyboard(), undefined);
    const call = subscribe.mock.calls[0];

    call?.[0](KeyboardState.OPEN, 300);

    expect(hook.latest().state.value).toBe(KeyboardState.OPEN);
    expect(hook.latest().height.value).toBe(300);
  });

  it('unsubscribes by its id once the component is gone', () => {
    const hook = renderHook(() => useAnimatedKeyboard(), undefined);

    hook.unmount();

    expect(unsubscribe).toHaveBeenCalledWith(5);
  });
});
