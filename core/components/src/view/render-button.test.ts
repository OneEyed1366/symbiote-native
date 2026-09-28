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

// The only fold that does not vary by platform: `resolveButtonDisabled`, read by the press
// MACHINE, so it stays JS. Every platform-varying fold is `SymbioteFabricProps.cpp`'s — iOS
// asserted in `button-derived-payload.itest.ts`, Android in `android-rules.android.itest.ts`.

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

  // `importantForAccessibility` is `foldButtonProps` in the engine now, asserted against the
  // committed payload in `button-payload.itest.ts`.
});
