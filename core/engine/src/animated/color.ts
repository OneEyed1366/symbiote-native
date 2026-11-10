// AnimatedColor: animates a color through four channel values (r, g, b, a), ported from RN's
// AnimatedColor.js. `__getValue()` is an `rgba(...)` string the injected color processor turns
// into the platform int

import {
  AnimatedWithChildren,
  flushValues,
  type IListenerValue,
} from './graph';
import { AnimatedValue, type IAnimatedValueConfig } from './value';
import {
  nativeAnimated,
  type INativeNodeConfig,
  type IPlatformConfig,
} from './native/native-animated';
import {
  isOpaqueColorValue,
  processColor,
  type IOpaqueColorValue,
} from '../platform-color';

import { DEFAULT_COLOR, normalizeColor, type IRgbaValue } from './rgba';

// Re-exported so every existing `from './color'` import keeps working; the definitions now
// live in the dependency-free ./rgba leaf (see its header for the cycle it breaks).
export { normalizeColor, type IRgbaValue };

type IChannel = number | AnimatedValue;
type IRgbaInput = {
  r: IChannel;
  g: IChannel;
  b: IChannel;
  a: IChannel;
};
type IColorCallback = (value: string | IOpaqueColorValue) => void;

// Обычный цвет раскладывается на каналы, непрозрачный отдаётся как есть
function toRgbaOrOpaque(
  value: IRgbaValue | string | number | IOpaqueColorValue,
): IRgbaValue | IOpaqueColorValue {
  if (isOpaqueColorValue(value)) return value;
  if (typeof value === 'object') return value;
  return normalizeColor(value) ?? DEFAULT_COLOR;
}
export type IColorInput =
  IRgbaInput | IRgbaValue | string | number | IOpaqueColorValue;

function isRgbaInput(value: IColorInput): value is IRgbaInput {
  return (
    typeof value === 'object' && value !== null && 'r' in value && 'g' in value
  );
}

function toChannel(value: IChannel): AnimatedValue {
  return value instanceof AnimatedValue ? value : new AnimatedValue(value);
}

// Resolve any input form to four concrete channel values (numbers or pre-built
// AnimatedValues), so the constructor can wrap each in an AnimatedValue.
function resolveInput(value?: IColorInput): IRgbaInput {
  if (value === undefined || isOpaqueColorValue(value)) return DEFAULT_COLOR;
  if (typeof value === 'string' || typeof value === 'number') {
    return normalizeColor(value) ?? DEFAULT_COLOR;
  }
  if (isRgbaInput(value)) return value;
  return DEFAULT_COLOR;
}

export class AnimatedColor extends AnimatedWithChildren {
  readonly r: AnimatedValue;
  readonly g: AnimatedValue;
  readonly b: AnimatedValue;
  readonly a: AnimatedValue;

  // Непрозрачный платформенный цвет (`PlatformColor`) живёт вне каналов, пока не задан обычный
  private nativeColor: IOpaqueColorValue | null = null;

  constructor(value?: IColorInput, config?: IAnimatedValueConfig) {
    super();
    if (isOpaqueColorValue(value)) this.nativeColor = value;
    const input = resolveInput(value);
    this.r = toChannel(input.r);
    this.g = toChannel(input.g);
    this.b = toChannel(input.b);
    this.a = toChannel(input.a);
    if (config?.useNativeDriver) this.__makeNative();
  }

  // The CSS color string the commit layer's color processor converts to a platform
  // int. Channels are rounded; alpha stays fractional.
  override __getValue(): string | IOpaqueColorValue {
    if (this.nativeColor !== null) return this.nativeColor;
    const r = Math.round(numericValue(this.r));
    const g = Math.round(numericValue(this.g));
    const b = Math.round(numericValue(this.b));
    const a = numericValue(this.a);
    return `rgba(${r}, ${g}, ${b}, ${a})`;
  }

  // Четыре канала подряд дали бы четыре коммита и четыре вызова слушателей с промежуточным `rgba()`
  // Поэтому запись подавлена, потом один flush по всем каналам и один вызов слушателей
  setValue(value: IRgbaValue | string | number | IOpaqueColorValue): void {
    const processed = toRgbaOrOpaque(value);
    const wasOpaque = this.nativeColor !== null;
    this.withSuspendedCallbacks(() => {
      if (isOpaqueColorValue(processed)) {
        this.nativeColor = processed;
        return;
      }
      this.nativeColor = null;
      this.r.setValue(processed.r);
      this.g.setValue(processed.g);
      this.b.setValue(processed.b);
      this.a.setValue(processed.a);
    });
    if (this.isNative && wasOpaque !== (this.nativeColor !== null)) {
      nativeAnimated.updateAnimatedNodeConfig(
        this.__getNativeTag(),
        this.__getNativeConfig(),
      );
    }
    flushValues([this.r, this.g, this.b, this.a]);
    this.__callListeners(this.__getValue());
  }

  resetAnimation(callback?: IColorCallback): void {
    for (const channel of this.channels()) channel.resetAnimation();
    callback?.(this.__getValue());
  }

  private channels(): readonly AnimatedValue[] {
    return [this.r, this.g, this.b, this.a];
  }

  // setOffset / flattenOffset / extractOffset do NOT flush or fire listeners in
  // symbiote's per-channel AnimatedValue (offset writes are silent), so there is
  // no 4×-fire to suspend here, matching RN, where only setValue suspends.
  setOffset(offset: IRgbaValue): void {
    this.r.setOffset(offset.r);
    this.g.setOffset(offset.g);
    this.b.setOffset(offset.b);
    this.a.setOffset(offset.a);
  }

  flattenOffset(): void {
    this.r.flattenOffset();
    this.g.flattenOffset();
    this.b.flattenOffset();
    this.a.flattenOffset();
  }

  extractOffset(): void {
    this.r.extractOffset();
    this.g.extractOffset();
    this.b.extractOffset();
    this.a.extractOffset();
  }

  stopAnimation(callback?: IColorCallback): void {
    for (const channel of this.channels()) channel.stopAnimation();
    callback?.(this.__getValue());
  }

  // Слушателю цвета нужна собранная строка, а не число канала, поэтому берём `__getValue()`
  // Пока `setValue` пишет каналы, счётчик подавления делает вызов пустым
  override __callListeners(_value: IListenerValue): void {
    super.__callListeners(this.__getValue());
  }

  override __attach(): void {
    this.r.__addChild(this);
    this.g.__addChild(this);
    this.b.__addChild(this);
    this.a.__addChild(this);
    super.__attach();
  }

  override __detach(): void {
    this.r.__removeChild(this);
    this.g.__removeChild(this);
    this.b.__removeChild(this);
    this.a.__removeChild(this);
    super.__detach();
  }

  override __makeNative(platformConfig?: IPlatformConfig): void {
    this.r.__makeNative(platformConfig);
    this.g.__makeNative(platformConfig);
    this.b.__makeNative(platformConfig);
    this.a.__makeNative(platformConfig);
    super.__makeNative(platformConfig);
  }

  override __getNativeConfig(): INativeNodeConfig {
    return {
      type: 'color',
      r: this.r.__getNativeTag(),
      g: this.g.__getNativeTag(),
      b: this.b.__getNativeTag(),
      a: this.a.__getNativeTag(),
      nativeColor:
        this.nativeColor === null ? null : processColor(this.nativeColor),
    };
  }
}

function numericValue(node: AnimatedValue): number {
  const value = node.__getValue();
  return typeof value === 'number' ? value : 0;
}
