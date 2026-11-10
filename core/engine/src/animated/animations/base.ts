// Minimal driver base, ported from RN's animations/Animation.js with every
// native path removed: no NativeAnimatedHelper, no
// __startAnimationIfNative, no shouldUseNativeDriver, no FeatureFlags. What
// remains is the JS-only contract: hold the end callback, track whether the
// animation is still active, and fire onEnd at most once.
//
// start() / stop() are abstract: each concrete driver (timing / spring / decay)
// owns its own requestAnimationFrame loop. They are declared as methods (not
// class fields) so a subclass override is not shadowed under
// useDefineForClassFields.

import type {
  IAnimation,
  IAnimationRun,
  IEndCallback,
  IEndResult,
} from '../animation';
import type { AnimatedValue } from '../value';
import { dlog, isDebug } from '../../debug';
import {
  generateNativeAnimationId,
  isNativeAnimatedAvailable,
  nativeAnimated,
  type INativeAnimationConfig,
  type IPlatformConfig,
} from '../native/native-animated';

export const MISSING_DRIVER_WARNING =
  'Animated: `useNativeDriver` was not specified. This is a required option and must be explicitly set to `true` or `false`';
const JS_ON_NATIVE_MESSAGE =
  'Attempting to run JS driven animation on animated node that has been moved to "native" earlier by starting an animation with `useNativeDriver: true`';

export type IAnimationConfig = {
  isInteraction?: boolean;
  iterations?: number;
  // Offload the curve to the stock native module (zero JS per frame).
  // Honoured only when the module is present; otherwise the JS path runs.
  useNativeDriver?: boolean;
  // RN threads both into every native animation config (Animation.js:30-34): the
  // platform bag rides through to native unread; debugID labels the animation in
  // native diagnostics. Optional. Current callers pass nothing.
  platformConfig?: IPlatformConfig;
  debugID?: string;
};

export abstract class BaseAnimation implements IAnimation {
  // `protected` so subclasses read it inside their rAF loop to decide whether to
  // schedule the next frame; cleared by stop().
  protected __active = false;

  protected __iterations: number;
  // RN's Animation holds `_platformConfig` / `__debugID` and folds them into the
  // native config (Animation.js:60-62). Subclasses read them via the protected
  // accessors below so every driver's config carries them uniformly.
  protected readonly __platformConfig: IPlatformConfig | undefined;
  private readonly __debugID: string | undefined;

  private onEndCallback: IEndCallback | null = null;
  private readonly nativeDriverRequested: boolean;
  private nativeId: number | undefined;

  constructor(config: IAnimationConfig) {
    if (config.useNativeDriver == null) console.warn(MISSING_DRIVER_WARNING);
    this.__iterations = config.iterations ?? 1;
    this.nativeDriverRequested = config.useNativeDriver === true;
    this.__platformConfig = config.platformConfig;
    this.__debugID = config.debugID;
  }

  // Mirrors RN's Animation.__getDebugID (Animation.js:192). Returns the label only
  // under DEBUG so production native configs stay lean, undefined otherwise.
  protected __getDebugID(): string | undefined {
    return isDebug() ? this.__debugID : undefined;
  }

  abstract start(run: IAnimationRun): void;

  // Подключает колбэк конца и взводит флаг до запуска цикла в потомке
  // JS-анимация над native-значением бросает сразу, даже если запуск отложен `delay`
  protected begin({ onEnd, animatedValue }: IAnimationRun): void {
    const isNativeDriven =
      this.nativeDriverRequested && isNativeAnimatedAvailable();
    if (!isNativeDriven && animatedValue.__isNative()) {
      throw new Error(JS_ON_NATIVE_MESSAGE);
    }
    this.onEndCallback = onEnd;
    this.__active = true;
  }

  // A native driver overrides this with its curve config (`{type:'frames'|'spring'|'decay', ...}`).
  protected getNativeAnimationConfig(): INativeAnimationConfig {
    throw new Error(
      'This animation type cannot be offloaded to the native driver',
    );
  }

  // Отдаёт кривую native, если драйвер запрошен и модуль есть, тогда цикл rAF не нужен
  // Возвращает true, когда native взял анимацию, иначе остаётся JS
  protected startNativeIfNeeded(animatedValue: AnimatedValue): boolean {
    if (!this.nativeDriverRequested) return false;
    if (!isNativeAnimatedAvailable()) {
      dlog(
        'useNativeDriver requested but native animated module is missing; using JS driver',
      );
      return false;
    }
    this.nativeId = generateNativeAnimationId();
    // The value owns the native handshake (make native, mint tag, sync back on
    // completion); we hand over only what THIS driver owns: the curve, RN's
    // Animation.js:137 platform bag, this animation's id, and its own end callback.
    animatedValue.__startNativeAnimation(
      this.getNativeAnimationConfig(),
      this.nativeId,
      result => this.__notifyAnimationEnd(result),
      this.__platformConfig,
    );
    return true;
  }

  stop(): void {
    if (this.nativeId !== undefined) {
      nativeAnimated.stopAnimation(this.nativeId);
    }
    this.__active = false;
  }

  // Fire the completion callback at most once. start() and stop() each run at
  // most once over an animation's life, and so does this.
  protected __notifyAnimationEnd(result: IEndResult): void {
    const callback = this.onEndCallback;
    if (callback !== null) {
      this.onEndCallback = null;
      callback(result);
    }
  }
}
