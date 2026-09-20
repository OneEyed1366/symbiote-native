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
import type { IViewStyle, ISymbioteEvent } from '@symbiote-native/engine';
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

// Button.js:394-437, one constant per literal so a value cannot drift silently. The LABEL's seven
// went with `resolveButtonTextStyle` on 2026-09-18 — they live in `SymbioteFabricProps.cpp` beside
// the rule that reads them and are deliberately not duplicated here.
const ANDROID_BUTTON_BLUE = '#2196F3';
const ANDROID_DISABLED_BACKGROUND = '#dfdfdf';
const ANDROID_ELEVATION = 4;
const ANDROID_DISABLED_ELEVATION = 0;
const ANDROID_BORDER_RADIUS = 2;

// `BUTTON_ACCESSIBILITY_ROLE` and `resolveButtonImportantForAccessibility` WERE HERE and are gone
// (2026-09-18). Both are `foldButtonProps` in `SymbioteFabricProps.cpp` now, and neither had a
// caller left afterwards — only its own unit test, which is the shape this project calls a mirror:
// a JS copy of a rule that runs elsewhere, kept alive by the test that asserts it. It would have
// stayed green forever while meaning nothing.

// `buttonTextStyle` AND `resolveButtonTextStyle` ARE GONE (2026-09-18) — the label's style is
// `foldButtonLabelStyle` in `SymbioteFabricProps.cpp`, reached off the label text's own tag. Its
// constants live THERE now and are not mirrored here; this file keeps only what Android's own fold
// still needs.
//
// It was the last rule in this primitive to move and it needed a seam none of the others did. Its
// inputs are the BUTTON's `color` and `disabled`, and the node it hangs on is the button's
// GRANDCHILD on iOS (`button -> view -> text`) and its child on Android — so `ownerProps`, which
// answers "my parent", could not reach it. `IAncestorLookup` asks for the nearest ancestor carrying
// a tag instead, which is a CSS ancestor selector and makes one rule right on both trees.

// `buttonViewStyle` AND `resolveButtonViewStyle` ARE GONE (2026-09-18), and with them the last of
// Button's folds. The Material look is inside `foldButtonProps` in `SymbioteFabricProps.cpp`, behind
// `#ifdef ANDROID` — where it belongs, since `{}` on iOS was the whole of its other branch.
//
// Its five constants went too rather than staying as a copy nothing reads.
//
// WHAT MADE THIS ONE DIFFERENT from the four ports before it: the Android branch is no longer
// untestable. The test host grew an arm that compiles `#ifdef ANDROID`
// (`core/engine/cpp/tests/CMakeLists.txt`, `SYMBIOTE_PLATFORM_ANDROID`), so the style, the `color`
// override and the disabled greying are asserted against the COMMITTED PAYLOAD in
// `core/engine/cpp/tests/js/android-rules.itest.ts` — strictly better than the mocked-`Platform.OS`
// unit test that went with them, which asserted a JS function rather than what Fabric receives.

// `resolveButtonTitle` IS GONE (2026-09-18) — the uppercase-on-Android rule is `foldButtonLabel` in
// `SymbioteFabricProps.cpp`, reached off the label's own tag. It had no caller left but its own two
// unit tests, which is the orphan shape this migration keeps turning up: a JS copy of a rule that
// runs elsewhere, kept alive by the test asserting it, green forever and proving nothing.
//
// A COVERAGE GAP WENT WITH IT, recorded rather than hidden. The C++ rule is `#ifdef ANDROID` — a raw
// text commits as `RCTRawText` on both platforms, so unlike `Switch`/`AndroidSwitch` there is no view
// NAME for a rule to branch on — and this host is not Android. The deleted Android test reached the
// branch by mocking `Platform.OS`; what it mocked was a JS function that no longer exists. Same
// class as `android_ripple` and `decelerationRate`'s constants, and closing it means an Android arm
// of the test host, not a mock.
//
// One behaviour difference shipped with the move and is deliberate: RN uppercases through
// JavaScript's full-Unicode `toUpperCase`, and the C++ rule is ASCII-only. See `foldButtonLabel`.

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
