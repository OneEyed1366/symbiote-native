// Button's folds on the DEFAULT (iOS) platform. The Android half is a separate file with its own
// `Platform` mock — `Platform.select` hardcodes its own host (`platform/index.ios.ts:101`), so
// mocking `OS` alone would leave the module-load styles on the wrong branch and the test would pin
// a shape no build produces.
//
// The rows that matter are the ones where the two platforms DISAGREE, because those are the only
// inputs that can tell a correct fold from one that ignores the platform: `color` tints the TEXT
// here and the BUTTON there, the disabled greys differ, and the title is uppercased there only.
import { describe, expect, it } from 'vitest';
import {
  resolveButtonDisabled,
  resolveButtonImportantForAccessibility,
  resolveButtonTextStyle,
  resolveButtonTitle,
  resolveButtonViewStyle,
} from './render-button';

const IOS_BLUE = '#007AFF';
const IOS_DISABLED = '#cdcdcd';
const CUSTOM = '#ff0000';

describe('Button folds on iOS', () => {
  it('styles the label blue and spaces it with a MARGIN, as RN does', () => {
    // margin, not padding: the label pushes the button's edges out rather than insetting itself,
    // so the tap target is 16pt taller than the glyphs.
    expect(resolveButtonTextStyle(undefined, undefined)).toEqual({
      textAlign: 'center',
      margin: 8,
      color: IOS_BLUE,
      fontSize: 18,
    });
  });

  it('tints the TEXT with `color` — the half Android does the other way', () => {
    expect(resolveButtonTextStyle(CUSTOM, undefined).color).toBe(CUSTOM);
  });

  it('greys the label when disabled, over any color', () => {
    expect(resolveButtonTextStyle(CUSTOM, true).color).toBe(IOS_DISABLED);
  });

  it('leaves the inner view unstyled in every combination', () => {
    expect(resolveButtonViewStyle(undefined, undefined)).toEqual({});
    expect(resolveButtonViewStyle(CUSTOM, true)).toEqual({});
  });

  it('leaves the title alone', () => {
    expect(resolveButtonTitle('Save')).toBe('Save');
  });
});

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

  // Button.js:356 — the label inside must not take focus separately from the button holding it.
  it('rewrites importantForAccessibility "no" and passes everything else', () => {
    expect(resolveButtonImportantForAccessibility('no')).toBe(
      'no-hide-descendants',
    );
    expect(resolveButtonImportantForAccessibility('yes')).toBe('yes');
    expect(resolveButtonImportantForAccessibility(undefined)).toBeUndefined();
  });
});
