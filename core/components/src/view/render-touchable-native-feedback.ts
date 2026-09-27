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

// TouchableNativeFeedback.js:202 — the OS alone; RN's minSdk is past the old API-23 gate.
export function canUseNativeForeground(): boolean {
  return Platform.OS === 'android';
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

// RN runs the color through processColor here; we keep the string and the engine's Android rule
// converts it (Java reads it with getInt, a string would fail). A null color is "no tint".
export function rippleBackground(
  color: string,
  borderless: boolean,
  rippleRadius?: number,
): IRippleBackground {
  return { type: 'RippleAndroid', color, borderless, rippleRadius };
}

// `backgroundProps` mapped the resolved background + `useForeground` onto the native slot — now
// the `#ifdef ANDROID` tail of `foldCloneOntoChild` in `SymbioteFabricProps.cpp`, covered by
// `android-rules.android.itest.ts` and `clone-onto-child-payload.itest.ts`.

// `canUseNativeForeground` below stays: it's a QUESTION an app asks the platform (RN's own public
// static), not a rule deciding a payload — same class as reading a folded `accessibilityState`.

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
