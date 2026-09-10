// Button: shared render half (framework-agnostic). Ported against RN's own
// `Libraries/Components/Button.js` — a touchable wrapping a `View` wrapping a `Text`, where the
// VIEW is what carries the look on Android and is empty on iOS.
//
// The inner view is not optional chrome. RN's Button is the one control in the library that ships
// a finished appearance, and on Android that appearance — a filled, elevated, rounded Material
// button with an uppercased label — lives entirely on that node. A port that renders only the
// touchable and the text is an iOS port, which is what this file was until 2026-09-09: blue text on
// nothing, wherever Android was.
//
// What is NOT here, because a layer below already does it: the `aria-*` -> `accessibilityState`
// fold RN performs in `Button.js:326-331`. The engine folds those for every node
// (`core/engine/src/accessibility-props.ts`), so repeating it here would fold twice.

import { Platform } from '@symbiote-native/engine';
import type {
  ITextStyle,
  IViewStyle,
  ISymbioteEvent,
} from '@symbiote-native/engine';
import type { IAccessibilityProps, IAriaProps } from '../accessibility-props';

// Author-facing props: the framework-agnostic public surface every adapter exposes. Button has
// no children (it takes a `title` string), so the whole surface is agnostic and lives here once.
export interface IButtonProps extends IAccessibilityProps, IAriaProps {
  title: string;
  onPress?: (event: ISymbioteEvent) => void;
  color?: string;
  disabled?: boolean;
  // Suppress the native tap sound (Button.js:50). Forwarded to the pressable, which owns sound
  // suppression via android_disableSound.
  touchSoundDisabled?: boolean;
  // Locate this button in end-to-end tests (Button.js:144). Forwarded to the root.
  testID?: string;
  // tvOS / Android-TV focus props (Button.js:68,79). Typed and forwarded; inert on a phone host.
  hasTVPreferredFocus?: boolean;
  nextFocusDown?: number;
  nextFocusForward?: number;
  nextFocusLeft?: number;
  nextFocusRight?: number;
  nextFocusUp?: number;
}

// Button.js:394-437, one constant per literal so a value cannot drift silently.
const IOS_BUTTON_BLUE = '#007AFF';
const IOS_DISABLED_TEXT = '#cdcdcd';
const ANDROID_BUTTON_BLUE = '#2196F3';
const ANDROID_DISABLED_BACKGROUND = '#dfdfdf';
const ANDROID_DISABLED_TEXT = '#a1a1a1';
const ANDROID_TEXT = 'white';
const ANDROID_ELEVATION = 4;
const ANDROID_DISABLED_ELEVATION = 0;
const ANDROID_BORDER_RADIUS = 2;
const TEXT_MARGIN = 8;
const IOS_FONT_SIZE = 18;
const ANDROID_FONT_WEIGHT = '500';

// RN's Button is accessibilityRole="button"; the role string is a native accessibility enum value.
export const BUTTON_ACCESSIBILITY_ROLE = 'button';

// `styles.text` — the platform-invariant half plus the platform's own. RN spells the margin as
// MARGIN, not padding: the label pushes the button's edges outward rather than insetting itself,
// so a background (Android) or a tap target (both) is 16pt taller than the glyphs.
export const buttonTextStyle: ITextStyle = {
  textAlign: 'center',
  margin: TEXT_MARGIN,
  ...Platform.select({
    ios: { color: IOS_BUTTON_BLUE, fontSize: IOS_FONT_SIZE },
    android: { color: ANDROID_TEXT, fontWeight: ANDROID_FONT_WEIGHT },
    default: { color: IOS_BUTTON_BLUE, fontSize: IOS_FONT_SIZE },
  }),
};

// `styles.button` — empty on iOS, the whole Material look on Android.
export const buttonViewStyle: IViewStyle =
  Platform.select({
    ios: {},
    android: {
      elevation: ANDROID_ELEVATION,
      backgroundColor: ANDROID_BUTTON_BLUE,
      borderRadius: ANDROID_BORDER_RADIUS,
    },
    default: {},
  }) ?? {};

/**
 * The label style with `color` and `disabled` folded in.
 *
 * `color` tints the TEXT on iOS and the BUTTON on Android (Button.js:318-324), so on Android this
 * ignores it — see `resolveButtonViewStyle`, which is where it lands there. `disabled` wins over
 * `color` on both, because RN pushes `textDisabled` after the tint.
 */
export function resolveButtonTextStyle(
  color: string | undefined,
  disabled: boolean | undefined,
): ITextStyle {
  const style: ITextStyle = { ...buttonTextStyle };
  if (color !== undefined && Platform.OS !== 'android') style.color = color;
  if (disabled === true) {
    style.color =
      Platform.OS === 'android' ? ANDROID_DISABLED_TEXT : IOS_DISABLED_TEXT;
  }
  return style;
}

/**
 * The inner view's style with `color` and `disabled` folded in — `{}` on iOS in every combination,
 * which is RN's own answer there and the reason the node looked droppable.
 */
export function resolveButtonViewStyle(
  color: string | undefined,
  disabled: boolean | undefined,
): IViewStyle {
  if (Platform.OS !== 'android') return buttonViewStyle;
  const style: IViewStyle = { ...buttonViewStyle };
  if (color !== undefined) style.backgroundColor = color;
  if (disabled === true) {
    style.elevation = ANDROID_DISABLED_ELEVATION;
    style.backgroundColor = ANDROID_DISABLED_BACKGROUND;
  }
  return style;
}

/**
 * The label as it is rendered: UPPERCASE on Android (Button.js:352-353).
 *
 * RN also asserts the title is a string one line above. Not reproduced: the assert is a dev-only
 * `invariant`, and every adapter here types `title: string`.
 */
export function resolveButtonTitle(title: string): string {
  return Platform.OS === 'android' ? title.toUpperCase() : title;
}

/**
 * Whether the button is disabled, which `aria-disabled` may decide on its own.
 *
 * Button.js:337-338 — `props.disabled != null ? props.disabled : accessibilityState.disabled`. The
 * engine already folds `aria-disabled` into the committed `accessibilityState`, but that fold is a
 * PAYLOAD fold: it cannot suppress the press or grey the label, which is what this is for.
 */
export function resolveButtonDisabled(
  disabled: boolean | undefined,
  ariaDisabled: boolean | undefined,
  accessibilityState: { disabled?: boolean } | undefined,
): boolean | undefined {
  if (disabled !== undefined) return disabled;
  return ariaDisabled ?? accessibilityState?.disabled;
}

/**
 * Button.js:356-359 — `'no'` becomes `'no-hide-descendants'`, so the label inside cannot take
 * focus separately from the button that contains it.
 */
export function resolveButtonImportantForAccessibility(
  value: IAccessibilityProps['importantForAccessibility'],
): IAccessibilityProps['importantForAccessibility'] {
  return value === 'no' ? 'no-hide-descendants' : value;
}
