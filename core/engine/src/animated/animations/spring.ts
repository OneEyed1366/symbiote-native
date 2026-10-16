// SpringAnimation: ported from RN's animations/SpringAnimation.js, JS path
// only. Integrates the closed form of a damped harmonic oscillator
// each frame and rests once both velocity and displacement fall below their
// thresholds. A spring chained after a previous spring inherits its
// position/velocity/time (getInternalState) so retargeting mid-flight stays
// continuous. The native-config export is dropped.

import type { IAnimationRun } from '../animation';
import { dlog } from '../../debug';
import type { INativeAnimationConfig } from '../native/native-animated';
import { BaseAnimation, type IAnimationConfig } from './base';
import {
  cancelFrame,
  clearTimer,
  requestFrame,
  setTimer,
  type ITimerHandle,
} from './raf';
import {
  fromBouncinessAndSpeed,
  fromOrigamiTensionAndFriction,
} from './spring-config';

export type ISpringAnimationConfig = IAnimationConfig & {
  toValue: number;
  overshootClamping?: boolean;
  restDisplacementThreshold?: number;
  restSpeedThreshold?: number;
  velocity?: number;
  bounciness?: number;
  speed?: number;
  tension?: number;
  friction?: number;
  stiffness?: number;
  damping?: number;
  mass?: number;
  delay?: number;
};

type ISpringInternalState = {
  lastPosition: number;
  lastVelocity: number;
  lastTime: number;
};

function resolveStiffnessDampingMass(config: ISpringAnimationConfig): {
  stiffness: number;
  damping: number;
  mass: number;
} {
  if (
    config.stiffness !== undefined ||
    config.damping !== undefined ||
    config.mass !== undefined
  ) {
    return {
      stiffness: config.stiffness ?? 100,
      damping: config.damping ?? 10,
      mass: config.mass ?? 1,
    };
  }
  if (config.bounciness !== undefined || config.speed !== undefined) {
    const springConfig = fromBouncinessAndSpeed(
      config.bounciness ?? 8,
      config.speed ?? 12,
    );
    return {
      stiffness: springConfig.stiffness,
      damping: springConfig.damping,
      mass: 1,
    };
  }
  const springConfig = fromOrigamiTensionAndFriction(
    config.tension ?? 40,
    config.friction ?? 7,
  );
  return {
    stiffness: springConfig.stiffness,
    damping: springConfig.damping,
    mass: 1,
  };
}

const MAX_STEPS = 64;

type ISpringSample = { position: number; velocity: number };

type IOscillator = {
  zeta: number;
  omega0: number;
  omega1: number;
  x0: number;
  v0: number;
  t: number;
};

function underDamped(
  { zeta, omega0, omega1, x0, v0, t }: IOscillator,
  toValue: number,
): ISpringSample {
  const envelope = Math.exp(-zeta * omega0 * t);
  const sin = Math.sin(omega1 * t);
  const cos = Math.cos(omega1 * t);
  const drive = v0 + zeta * omega0 * x0;
  return {
    position: toValue - envelope * ((drive / omega1) * sin + x0 * cos),
    velocity:
      zeta * omega0 * envelope * ((sin * drive) / omega1 + x0 * cos) -
      envelope * (cos * drive - omega1 * x0 * sin),
  };
}

function criticallyDamped(
  { omega0, x0, v0, t }: Pick<IOscillator, 'omega0' | 'x0' | 'v0' | 't'>,
  toValue: number,
): ISpringSample {
  const envelope = Math.exp(-omega0 * t);
  return {
    position: toValue - envelope * (x0 + (v0 + omega0 * x0) * t),
    velocity: envelope * (v0 * (t * omega0 - 1) + t * x0 * (omega0 * omega0)),
  };
}

export class SpringAnimation extends BaseAnimation {
  private readonly overshootClamping: boolean;
  private readonly restDisplacementThreshold: number;
  private readonly restSpeedThreshold: number;
  private lastVelocity: number;
  private startPosition = 0;
  private lastPosition = 0;
  private readonly toValue: number;
  private readonly stiffness: number;
  private readonly damping: number;
  private readonly mass: number;
  private initialVelocity: number;
  private readonly delay: number;
  private lastTime = 0;
  private frameTime = 0;
  private onUpdate: (value: number) => void = () => {};
  private animationFrame: number | null = null;
  private timeout: ITimerHandle | null = null;

  constructor(config: ISpringAnimationConfig) {
    super(config);
    this.overshootClamping = config.overshootClamping ?? false;
    this.restDisplacementThreshold = config.restDisplacementThreshold ?? 0.001;
    this.restSpeedThreshold = config.restSpeedThreshold ?? 0.001;
    this.initialVelocity = config.velocity ?? 0;
    this.lastVelocity = config.velocity ?? 0;
    this.toValue = config.toValue;
    this.delay = config.delay ?? 0;

    const resolved = resolveStiffnessDampingMass(config);
    if (resolved.stiffness <= 0)
      throw new Error('Stiffness value must be greater than 0');
    if (resolved.damping <= 0)
      throw new Error('Damping value must be greater than 0');
    if (resolved.mass <= 0)
      throw new Error('Mass value must be greater than 0');
    this.stiffness = resolved.stiffness;
    this.damping = resolved.damping;
    this.mass = resolved.mass;
  }

  getInternalState(): ISpringInternalState {
    return {
      lastPosition: this.lastPosition,
      lastVelocity: this.lastVelocity,
      lastTime: this.lastTime,
    };
  }

  // Native: hand the oscillator parameters to native (QuartzCore CASpringAnimation).
  protected override getNativeAnimationConfig(): INativeAnimationConfig {
    return {
      type: 'spring',
      stiffness: this.stiffness,
      damping: this.damping,
      mass: this.mass,
      initialVelocity: this.initialVelocity,
      overshootClamping: this.overshootClamping,
      restDisplacementThreshold: this.restDisplacementThreshold,
      restSpeedThreshold: this.restSpeedThreshold,
      toValue: this.toValue,
      iterations: this.__iterations,
      platformConfig: this.__platformConfig,
      debugID: this.__getDebugID(),
    };
  }

  override start(run: IAnimationRun): void {
    const { fromValue, onUpdate, previousAnimation, animatedValue } = run;
    this.begin(run);
    this.startPosition = fromValue;
    this.lastPosition = this.startPosition;
    this.onUpdate = onUpdate;
    this.lastTime = Date.now();
    this.frameTime = 0;

    if (previousAnimation instanceof SpringAnimation) {
      const internalState = previousAnimation.getInternalState();
      this.lastPosition = internalState.lastPosition;
      this.lastVelocity = internalState.lastVelocity;
      this.initialVelocity = this.lastVelocity;
      this.lastTime = internalState.lastTime;
    }

    // Если native взял анимацию, JS-цикл кадров не нужен
    if (this.startNativeIfNeeded(animatedValue)) return;

    if (this.delay === 0) {
      this.onFrame();
    } else {
      this.timeout = setTimer(() => this.onFrame(), this.delay);
    }
  }

  // Затухающий гармонический осциллятор в замкнутой форме, как `CASpringAnimation` в QuartzCore
  // Потерянные кадры (пауза отладчика) сжимаются до MAX_STEPS, чтобы пружина не прыгала в конец
  private sample(now: number): ISpringSample {
    this.frameTime += (now - this.lastTime) / 1_000;
    const k = this.stiffness;
    const m = this.mass;
    const v0 = -this.initialVelocity;
    const t = this.frameTime;
    const zeta = this.damping / (2 * Math.sqrt(k * m));
    const omega0 = Math.sqrt(k / m);
    const x0 = this.toValue - this.startPosition;
    if (zeta >= 1) return criticallyDamped({ omega0, x0, v0, t }, this.toValue);
    const omega1 = omega0 * Math.sqrt(1 - zeta * zeta);
    return underDamped({ zeta, omega0, omega1, x0, v0, t }, this.toValue);
  }

  private hasSettled(position: number, velocity: number): boolean {
    const isOvershooting = this.isOvershooting(position);
    const isResting = Math.abs(velocity) <= this.restSpeedThreshold;
    const isAtTarget =
      this.stiffness === 0 ||
      Math.abs(this.toValue - position) <= this.restDisplacementThreshold;
    return isOvershooting || (isResting && isAtTarget);
  }

  private isOvershooting(position: number): boolean {
    if (!this.overshootClamping || this.stiffness === 0) return false;
    return this.startPosition < this.toValue
      ? position > this.toValue
      : position < this.toValue;
  }

  private onFrame(): void {
    const now = Math.min(Date.now(), this.lastTime + MAX_STEPS);
    const { position, velocity } = this.sample(now);
    this.lastTime = now;
    this.lastPosition = position;
    this.lastVelocity = velocity;

    this.onUpdate(position);
    // Слушатель мог остановить пружину внутри `onUpdate`
    if (!this.__active) return;

    if (!this.hasSettled(position, velocity)) {
      this.animationFrame = requestFrame(() => this.onFrame());
      return;
    }
    if (this.stiffness !== 0) {
      // Садимся точно в цель
      this.lastPosition = this.toValue;
      this.lastVelocity = 0;
      this.onUpdate(this.toValue);
    }
    this.__notifyAnimationEnd({ finished: true });
  }

  override stop(): void {
    super.stop();
    if (this.timeout !== null) {
      clearTimer(this.timeout);
      this.timeout = null;
    }
    if (this.animationFrame !== null) {
      cancelFrame(this.animationFrame);
      this.animationFrame = null;
    }
    dlog('spring animation stopped');
    this.__notifyAnimationEnd({ finished: false });
  }
}
