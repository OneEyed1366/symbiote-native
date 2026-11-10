// RN's `useAnimatedValue`, `useAnimatedValueXY` and `useAnimatedColor` without the lifecycle: a
// call builds a value. Adapters whose component body runs once re-export these under their own
// idiom's name, the others (React, Vue) wrap them with their own once-per-component rule

import { AnimatedColor, type IColorInput } from './color';
import { AnimatedValue, type IAnimatedValueConfig } from './value';
import { AnimatedValueXY } from './value-xy';

export const createAnimatedValue = (
  initialValue: number,
  config?: IAnimatedValueConfig,
): AnimatedValue => new AnimatedValue(initialValue, config);

export const createAnimatedValueXY = (
  initialValue: { x: number; y: number },
  config?: IAnimatedValueConfig,
): AnimatedValueXY => new AnimatedValueXY(initialValue, config);

export const createAnimatedColor = (
  inputValue?: IColorInput,
  config?: IAnimatedValueConfig,
): AnimatedColor => new AnimatedColor(inputValue, config);
