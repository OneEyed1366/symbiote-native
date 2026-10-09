// Состав `Animated` из `AnimatedImplementation` в RN, один на все адаптеры
// Адаптер добавляет сюда только свои компоненты и `createAnimatedComponent`

import { AnimatedColor } from './color';
import { Easing } from './easing';
import {
  attachNativeEvent,
  AnimatedEvent,
  event,
  forkEvent,
  unforkEvent,
} from './event';
import { AnimatedInterpolation, AnimatedNode } from './graph';
import {
  add,
  diffClamp,
  divide,
  modulo,
  multiply,
  subtract,
} from './operators';
import {
  decay,
  delay,
  loop,
  parallel,
  sequence,
  spring,
  stagger,
  timing,
} from './animations/composition';
import { AnimatedValue } from './value';
import { AnimatedValueXY } from './value-xy';

export const AnimatedDrivers = {
  Value: AnimatedValue,
  ValueXY: AnimatedValueXY,
  Color: AnimatedColor,
  Interpolation: AnimatedInterpolation,
  Node: AnimatedNode,
  Easing,
  timing,
  spring,
  decay,
  parallel,
  sequence,
  stagger,
  loop,
  delay,
  add,
  subtract,
  multiply,
  divide,
  modulo,
  diffClamp,
  event,
  attachNativeEvent,
  forkEvent,
  unforkEvent,
  Event: AnimatedEvent,
};
