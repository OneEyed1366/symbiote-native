import { installRecordingFabric } from '@symbiote-native/test-utils';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { KeyboardState } from 'react-native-reanimated/src/commonTypes';
import * as core from 'react-native-reanimated/src/core';
import { renderComposable } from '../../../test-support/render-composable';
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
    const composable = renderComposable(() => useAnimatedKeyboard());

    expect(composable.result().state.value).toBe(KeyboardState.UNKNOWN);
    expect(composable.result().height.value).toBe(0);
  });

  it('subscribes once', () => {
    renderComposable(() => useAnimatedKeyboard());

    expect(subscribe).toHaveBeenCalledTimes(1);
  });

  it('writes what the keyboard reports into the shared values', () => {
    const composable = renderComposable(() => useAnimatedKeyboard());
    const call = subscribe.mock.calls[0];

    call?.[0](KeyboardState.OPEN, 300);

    expect(composable.result().state.value).toBe(KeyboardState.OPEN);
    expect(composable.result().height.value).toBe(300);
  });

  it('unsubscribes by its id once the component is gone', () => {
    const composable = renderComposable(() => useAnimatedKeyboard());

    composable.unmount();

    expect(unsubscribe).toHaveBeenCalledWith(5);
  });
});
