// RN's `useAnimatedValue`, `useAnimatedValueXY` and `useAnimatedColor` as composables: `setup()`
// runs once per component, so each call is the one instance. `markRaw` keeps `reactive()` from
// wrapping the node in a Proxy

import { markRaw } from '@vue/runtime-core';
import {
  createAnimatedColor,
  createAnimatedValue,
  createAnimatedValueXY,
  type AnimatedColor,
  type AnimatedValue,
  type AnimatedValueXY,
  type IAnimatedValueConfig,
  type IColorInput,
} from '@symbiote-native/engine';

export function useAnimatedValue(
  initialValue: number,
  config?: IAnimatedValueConfig,
): AnimatedValue {
  return markRaw(createAnimatedValue(initialValue, config));
}

export function useAnimatedValueXY(
  initialValue: { x: number; y: number },
  config?: IAnimatedValueConfig,
): AnimatedValueXY {
  return markRaw(createAnimatedValueXY(initialValue, config));
}

export function useAnimatedColor(
  inputValue?: IColorInput,
  config?: IAnimatedValueConfig,
): AnimatedColor {
  return markRaw(createAnimatedColor(inputValue, config));
}
