import type {
  AnimatedKeyboardInfo,
  AnimatedKeyboardOptions,
} from 'react-native-reanimated/src/commonTypes';
import { KeyboardState } from 'react-native-reanimated/src/commonTypes';
import {
  makeMutable,
  subscribeForKeyboardEvents,
  unsubscribeFromKeyboardEvents,
} from 'react-native-reanimated/src/core';

export type IAnimatedKeyboardController = {
  info: AnimatedKeyboardInfo;
  // Idempotent, so an adapter can call it both on creation and again after a hot reload
  subscribe: () => void;
  unsubscribe: () => void;
};

const NO_OPTIONS: AnimatedKeyboardOptions = {
  isStatusBarTranslucentAndroid: undefined,
  isNavigationBarTranslucentAndroid: undefined,
};

export function createAnimatedKeyboard(
  options: AnimatedKeyboardOptions = NO_OPTIONS,
): IAnimatedKeyboardController {
  const info: AnimatedKeyboardInfo = {
    state: makeMutable<KeyboardState>(KeyboardState.UNKNOWN),
    height: makeMutable(0),
  };
  let listenerId = -1;
  let isSubscribed = false;
  return {
    info,
    subscribe: () => {
      if (isSubscribed) return;
      listenerId = subscribeForKeyboardEvents((state, height) => {
        'worklet';
        info.state.value = state;
        info.height.value = height;
      }, options);
      isSubscribed = true;
    },
    unsubscribe: () => {
      if (!isSubscribed) return;
      unsubscribeFromKeyboardEvents(listenerId);
      isSubscribed = false;
    },
  };
}
