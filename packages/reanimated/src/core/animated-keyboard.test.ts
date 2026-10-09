import { beforeEach, describe, expect, it, vi } from 'vitest';
import { KeyboardState } from 'react-native-reanimated/src/commonTypes';
import * as core from 'react-native-reanimated/src/core';
import { createAnimatedKeyboard } from './animated-keyboard';

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

function delivered() {
  const call = subscribe.mock.calls[0];
  if (call === undefined) throw new Error('the keyboard was never subscribed');
  return call[0];
}

describe('an animated keyboard made by the controller', () => {
  it('starts unknown and zero high', () => {
    const keyboard = createAnimatedKeyboard();

    expect(keyboard.info.state.value).toBe(KeyboardState.UNKNOWN);
    expect(keyboard.info.height.value).toBe(0);
  });

  it('subscribes with the options it was given', () => {
    const options = { isStatusBarTranslucentAndroid: true };

    createAnimatedKeyboard(options).subscribe();

    expect(subscribe).toHaveBeenCalledWith(expect.any(Function), options);
  });

  it('writes what the keyboard reports into the shared values', () => {
    const keyboard = createAnimatedKeyboard();
    keyboard.subscribe();

    delivered()(KeyboardState.OPEN, 300);

    expect(keyboard.info.state.value).toBe(KeyboardState.OPEN);
    expect(keyboard.info.height.value).toBe(300);
  });

  it('subscribes once however often it is asked to', () => {
    const keyboard = createAnimatedKeyboard();

    keyboard.subscribe();
    keyboard.subscribe();

    expect(subscribe).toHaveBeenCalledTimes(1);
  });

  it('unsubscribes by the id it got, and can subscribe again after', () => {
    const keyboard = createAnimatedKeyboard();
    keyboard.subscribe();

    keyboard.unsubscribe();
    keyboard.subscribe();

    expect(unsubscribe).toHaveBeenCalledWith(5);
    expect(subscribe).toHaveBeenCalledTimes(2);
  });

  it('has nothing to unsubscribe before it subscribed', () => {
    createAnimatedKeyboard().unsubscribe();

    expect(unsubscribe).not.toHaveBeenCalled();
  });
});
