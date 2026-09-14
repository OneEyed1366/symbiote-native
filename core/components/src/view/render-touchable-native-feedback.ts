// TouchableNativeFeedback: the shared render half (framework-agnostic). The static background
// factories (SelectableBackground / Ripple / …) are pure dict producers, and the mapping of a
// resolved background + useForeground onto the native prop Android reads is platform-invariant,
// both live here so every adapter inherits the exact same surface. The adapter only attaches these
// statics onto its component value and nests the feedback View under its Pressable.

import { Platform } from '@symbiote-native/engine';

// The two background dict shapes RN's static factories produce. A discriminated union on `type`
// so a caller narrows without a cast.
export interface IThemeAttrBackground {
  type: 'ThemeAttrAndroid';
  attribute: 'selectableItemBackground' | 'selectableItemBackgroundBorderless';
  rippleRadius?: number;
}

export interface IRippleBackground {
  type: 'RippleAndroid';
  color: string | null;
  borderless: boolean;
  rippleRadius?: number;
}

export type INativeFeedbackBackground =
  IThemeAttrBackground | IRippleBackground;

// Native foreground ripple is Android-only (API 23+). RN gates this on Platform.OS === 'android'
// && Platform.Version >= 23. Version is a string on iOS (where the gate is irrelevant) and a
// number on Android, so guard the type at runtime before the numeric compare, no cast.
const ANDROID_FOREGROUND_MIN_VERSION = 23;

export function canUseNativeForeground(): boolean {
  return (
    Platform.OS === 'android' &&
    typeof Platform.Version === 'number' &&
    Platform.Version >= ANDROID_FOREGROUND_MIN_VERSION
  );
}

export function selectableBackground(
  rippleRadius?: number,
): IThemeAttrBackground {
  return {
    type: 'ThemeAttrAndroid',
    attribute: 'selectableItemBackground',
    rippleRadius,
  };
}

export function selectableBackgroundBorderless(
  rippleRadius?: number,
): IThemeAttrBackground {
  return {
    type: 'ThemeAttrAndroid',
    attribute: 'selectableItemBackgroundBorderless',
    rippleRadius,
  };
}

// RN runs the color string through processColor (→ a native int); we have no native bridge here,
// so we keep the string and let Android resolve it. A null color is the documented "no tint".
export function rippleBackground(
  color: string,
  borderless: boolean,
  rippleRadius?: number,
): IRippleBackground {
  return { type: 'RippleAndroid', color, borderless, rippleRadius };
}

// Maps the resolved background + useForeground onto the native prop Android reads. useForeground
// only paints the foreground when the platform supports it (canUseNativeForeground); otherwise it
// falls back to the background slot, matching RN. On iOS both props are inert.
export function backgroundProps(
  background: INativeFeedbackBackground,
  useForeground: boolean,
): Record<string, INativeFeedbackBackground> {
  if (useForeground && canUseNativeForeground()) {
    return { nativeForegroundAndroid: background };
  }
  return { nativeBackgroundAndroid: background };
}

/**
 * RN's four statics, under RN's own spelling — `TouchableNativeFeedback.Ripple(color, borderless)`.
 *
 * A NAMESPACE OBJECT rather than a component value, and that is the whole of what survived the
 * wrapper: the element is a tag now, and a tag is a string, which cannot carry properties. Shared
 * rather than copied five times because every member is a pure dict producer with no framework in
 * it; each adapter re-exports it verbatim, as it does the background types beside it.
 *
 * NOT the spelling for NEW code, and not redundant either. RN's docs point at `Pressable`'s
 * declarative `android_ripple={{ color, borderless }}`, which the pressable behavior resolves
 * (`behaviors/pressable.ts`, `asRippleConfig`). These four stay because the
 * `touchable-native-feedback` tag folds `background` and nothing else produces that value.
 */
export const TouchableNativeFeedback = {
  SelectableBackground: selectableBackground,
  SelectableBackgroundBorderless: selectableBackgroundBorderless,
  Ripple: rippleBackground,
  canUseNativeForeground,
};
