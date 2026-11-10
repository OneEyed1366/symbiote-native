// The driver contract. A concrete animation (timing / spring / decay, all
// Phase 2) is a number -> number machine: `start` is handed the value's current
// number and an `onUpdate` it calls each frame with the next number; `onEnd`
// fires exactly once. This interface is the seam between AnimatedValue and the
// drivers, so it lives here, free of any concrete driver.

import type { AnimatedValue } from './value';

// `value` and `offset` come only from a native driver, they are what native ended on
export type IEndResult = {
  finished: boolean;
  value?: number;
  offset?: number;
};

export type IEndCallback = (result: IEndResult) => void;

// Всё, что значение отдаёт драйверу при запуске, у RN это позиционные аргументы
export type IAnimationRun = {
  readonly fromValue: number;
  readonly onUpdate: (value: number) => void;
  readonly onEnd: IEndCallback;
  readonly previousAnimation: IAnimation | null;
  readonly animatedValue: AnimatedValue;
};

export type IAnimation = {
  start(run: IAnimationRun): void;
  stop(): void;
};
