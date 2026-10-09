// RN's `useAnimatedValue`, `useAnimatedValueXY` and `useAnimatedColor`: the instance is built on
// the first render and kept, so later renders ignore their arguments

import { useRef } from 'react';
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

// `useRef(factory())` would build a throwaway instance on every render
function useOnce<T>(create: () => T): T {
  const ref = useRef<T | null>(null);
  ref.current ??= create();
  return ref.current;
}

export function useAnimatedValue(
  initialValue: number,
  config?: IAnimatedValueConfig,
): AnimatedValue {
  return useOnce(() => createAnimatedValue(initialValue, config));
}

export function useAnimatedValueXY(
  initialValue: { x: number; y: number },
  config?: IAnimatedValueConfig,
): AnimatedValueXY {
  return useOnce(() => createAnimatedValueXY(initialValue, config));
}

export function useAnimatedColor(
  inputValue?: IColorInput,
  config?: IAnimatedValueConfig,
): AnimatedColor {
  return useOnce(() => createAnimatedColor(inputValue, config));
}
