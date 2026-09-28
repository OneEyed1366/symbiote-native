// Button: shared render half (framework-agnostic). Ported against RN's own
// `Libraries/Components/Button.js` — a touchable wrapping a `View` wrapping a `Text`, where the
// VIEW is what carries the look on Android and is empty on iOS.
//
// The inner view is not optional chrome. RN's Button is the one control in the library that ships
// a finished appearance, and on Android that appearance — a filled, elevated, rounded Material
// button with an uppercased label — lives entirely on that node.
//
// What is NOT here, because a layer below already does it: the `aria-*` -> `accessibilityState`
// fold RN performs in `Button.js:326-331`. The engine folds those for every node
// (`core/engine/src/accessibility-props.ts`), so repeating it here would fold twice.

import type { ISymbioteEvent } from '@symbiote-native/engine';
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

// `BUTTON_ACCESSIBILITY_ROLE`, `resolveButtonImportantForAccessibility`, and the Android style
// constants are `foldButtonProps`/`foldButtonLabelStyle` in `SymbioteFabricProps.cpp` now — no JS
// mirror is kept here to avoid a rule with no caller staying green for the wrong reason.

// `foldButtonLabelStyle` reaches the label's style off its own tag via `IAncestorLookup` —
// needed because the label is the button's GRANDCHILD on iOS but its CHILD on Android, so
// `ownerProps` (nearest parent) can't reach it either way.

// The Material look (`foldButtonProps`, `SymbioteFabricProps.cpp`, `#ifdef ANDROID`) — style,
// `color` override, disabled greying — is asserted against the COMMITTED PAYLOAD in
// `android-rules.itest.ts`, not a JS unit test mocking `Platform.OS`.

// The uppercase-on-Android rule is `foldButtonLabel` in `SymbioteFabricProps.cpp`. Untested here
// (this host isn't Android, and raw text has no view NAME for a rule to branch on). Deliberate
// divergence: RN uppercases via full-Unicode `toUpperCase`, the C++ rule is ASCII-only.

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
