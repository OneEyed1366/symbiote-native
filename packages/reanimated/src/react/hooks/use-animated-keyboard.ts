import { useEffect, useState } from 'react';
import type {
  AnimatedKeyboardInfo,
  AnimatedKeyboardOptions,
} from 'react-native-reanimated/src/commonTypes';
import { createAnimatedKeyboard } from '../../core/animated-keyboard';

/** @deprecated upstream deprecates it in favor of `react-native-keyboard-controller` */
export function useAnimatedKeyboard(
  options?: AnimatedKeyboardOptions,
): AnimatedKeyboardInfo {
  const [keyboard] = useState(() => createAnimatedKeyboard(options));
  // Subscribed on the first render, as upstream, and again after a hot reload has let go
  keyboard.subscribe();
  useEffect(() => {
    keyboard.subscribe();
    return keyboard.unsubscribe;
  }, [keyboard]);
  return keyboard.info;
}
