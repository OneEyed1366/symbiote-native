// AnimatedMock: ported from RN's AnimatedMock.js. When the host reports
// Platform.isDisableAnimations (reduced-motion accessibility setting, or a test
// environment), RN swaps the whole Animated namespace for this mock: the surface
// is identical but every animation jumps straight to its final value and fires the
// end callback synchronously, with no frames. Snapshot tests and reduced-motion
// users get the resting state without flake. The value graph, operators, easing,
// events and createAnimatedComponent are reused verbatim from the live engine.
// Only the driver factories (timing/spring/decay) and compositions are mocked.

import { AnimatedValue } from './value';
import { AnimatedNode } from './graph';
import { AnimatedDrivers } from './drivers';
import { dlog } from '../debug';
import type { IEndCallback, IEndResult } from './animation';
import {
  isSpringConfig,
  isTimingConfig,
  type ICompositeAnimation,
  type ITimingConfig,
  type ISpringConfig,
  type IDecayConfig,
  type IParallelConfig,
  type IVectorSpringConfig,
  type IVectorTimingConfig,
} from './animations/composition';
import { splitChannels, type IVectorValue } from './animations/vector';

// Prevent a callback invocation from recursively triggering another callback,
// which may trigger another animation (RN's AnimatedMock.js:36-60).
let inAnimationCallback = false;
function mockAnimationStart(
  start: (callback?: IEndCallback) => void,
): (callback?: IEndCallback) => void {
  return callback => {
    const guardedCallback =
      callback === undefined
        ? callback
        : (result: IEndResult): void => {
            if (inAnimationCallback) {
              dlog(
                'Ignoring recursive animation callback when running mock animations',
              );
              return;
            }
            inAnimationCallback = true;
            try {
              callback(result);
            } finally {
              inAnimationCallback = false;
            }
          };
    start(guardedCallback);
  };
}

const emptyAnimation: ICompositeAnimation = {
  start: () => {},
  stop: () => {},
  reset: () => {},
};

function mockCompositeAnimation(
  animations: ICompositeAnimation[],
): ICompositeAnimation {
  return {
    ...emptyAnimation,
    start: mockAnimationStart(callback => {
      animations.forEach(animation => animation.start());
      callback?.({ finished: true });
    }),
  };
}

// `toValue` is widened to `number | AnimatedNode` at the composition layer; the
// mock needs a concrete number to land on, so resolve a node target to its current
// value (RN reaches the same number through `anyValue`).
function resolveToValue(toValue: number | AnimatedNode): number {
  if (toValue instanceof AnimatedNode) {
    const current = toValue.__getValue();
    return typeof current === 'number' ? current : 0;
  }
  return toValue;
}

type IJumpConfig = { toValue: number | AnimatedNode };

// Значение или каждый канал вектора сразу садится в свою цель
function jumpTo<TConfig extends IJumpConfig>(
  value: AnimatedValue | IVectorValue,
  config: object,
  isScalarConfig: (candidate: unknown) => candidate is TConfig,
): ICompositeAnimation {
  return {
    ...emptyAnimation,
    start: mockAnimationStart(callback => {
      if (value instanceof AnimatedValue) {
        if (isScalarConfig(config))
          value.setValue(resolveToValue(config.toValue));
      } else {
        for (const part of splitChannels(value, config, isScalarConfig)) {
          part.value.setValue(resolveToValue(part.config.toValue));
        }
      }
      callback?.({ finished: true });
    }),
  };
}

function spring(
  value: AnimatedValue,
  config: ISpringConfig,
): ICompositeAnimation;
function spring(
  value: IVectorValue,
  config: IVectorSpringConfig,
): ICompositeAnimation;
function spring(
  value: AnimatedValue | IVectorValue,
  config: ISpringConfig | IVectorSpringConfig,
): ICompositeAnimation {
  return jumpTo(value, config, isSpringConfig);
}

function timing(
  value: AnimatedValue,
  config: ITimingConfig,
): ICompositeAnimation;
function timing(
  value: IVectorValue,
  config: IVectorTimingConfig,
): ICompositeAnimation;
function timing(
  value: AnimatedValue | IVectorValue,
  config: ITimingConfig | IVectorTimingConfig,
): ICompositeAnimation {
  return jumpTo(value, config, isTimingConfig);
}

// Decay has no toValue to land on, so RN returns the empty animation (AnimatedMock.js:121).
function decay(
  _value: AnimatedValue,
  _config: IDecayConfig,
): ICompositeAnimation {
  return emptyAnimation;
}

function sequence(animations: ICompositeAnimation[]): ICompositeAnimation {
  return mockCompositeAnimation(animations);
}

function parallel(
  animations: ICompositeAnimation[],
  _config?: IParallelConfig,
): ICompositeAnimation {
  return mockCompositeAnimation(animations);
}

function delay(_time: number): ICompositeAnimation {
  return emptyAnimation;
}

function stagger(
  _time: number,
  animations: ICompositeAnimation[],
): ICompositeAnimation {
  return mockCompositeAnimation(animations);
}

function loop(_animation: ICompositeAnimation): ICompositeAnimation {
  return emptyAnimation;
}

// Фабрики анимаций сразу приходят к цели, остальное (значения, операторы, события) настоящее
// Компоненты и `createAnimatedComponent` добавляет адаптер
export const AnimatedMock = {
  ...AnimatedDrivers,
  timing,
  spring,
  decay,
  parallel,
  sequence,
  stagger,
  loop,
  delay,
};
