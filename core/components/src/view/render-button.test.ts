// Button's folds on the DEFAULT (iOS) platform. The Android half is a separate file with its own
// `Platform` mock — `Platform.select` hardcodes its own host (`platform/index.ios.ts:101`), so
// mocking `OS` alone would leave the module-load styles on the wrong branch and the test would pin
// a shape no build produces.
//
// The rows that matter are the ones where the two platforms DISAGREE, because those are the only
// inputs that can tell a correct fold from one that ignores the platform: `color` tints the TEXT
// here and the BUTTON there, the disabled greys differ, and the title is uppercased there only.
import { describe, expect, it } from 'vitest';
import { resolveButtonDisabled } from './render-button';

// EVERY PLATFORM-VARYING CASE LEFT THIS FILE ON 2026-09-18, and the file survives for the one fold
// that does not vary: `resolveButtonDisabled`, which the press MACHINE reads and which is therefore
// still JS.
//
// What went and where. The label's style and the title's uppercase are `foldButtonLabelStyle` and
// `foldButtonLabel` in `SymbioteFabricProps.cpp`; the inner view's style is inside
// `foldButtonProps`. All three asserted a JS function that no longer exists, so none could be
// pointed at anything here.
//
// Their iOS half is `core/engine/cpp/tests/js/button-derived-payload.itest.ts`, against the payload
// a commit actually sent. Their ANDROID half is `core/engine/cpp/tests/js/android-rules.android
// .itest.ts` — which is new: `#ifdef ANDROID` used to mean "pinned nowhere headless", and the test
// host now has an arm that compiles those branches (`pnpm run test:android`).

describe('Button folds that do not vary by platform', () => {
  // Button.js:337 — an explicit `disabled` wins, and only its ABSENCE lets the accessibility side
  // decide. The engine folds `aria-disabled` into the committed accessibilityState on its own, but
  // a payload fold cannot suppress the press or grey the label, which is what this is for.
  it('lets aria-disabled decide when `disabled` is absent', () => {
    expect(resolveButtonDisabled(undefined, true, undefined)).toBe(true);
    expect(
      resolveButtonDisabled(undefined, undefined, { disabled: true }),
    ).toBe(true);
  });

  it('lets an explicit `disabled` win, including an explicit false', () => {
    expect(resolveButtonDisabled(false, true, { disabled: true })).toBe(false);
  });

  // `importantForAccessibility` left this file with the function it tested (2026-09-18): the rule is
  // `foldButtonProps` in the engine now, and the resolver had no caller left but this case. Asserted
  // against the committed payload in `core/engine/cpp/tests/js/button-payload.itest.ts`.
});
