// Button's Android half — the look that did not exist here at all until 2026-09-09. Its own file
// with its own mock, the shape `behaviors/ripple-android.test.ts` already uses.
//
// The mock replaces `select` as well as `OS`, and that is load-bearing rather than thorough:
// `platform/index.ios.ts:101` hardcodes `if ('ios' in spec) return spec.ios`, so a mock supplying
// only `OS: 'android'` leaves the module-load styles on the iOS branch and this suite would pin a
// shape no Android build produces.
import { describe, expect, it, vi } from 'vitest';

vi.mock('@symbiote-native/engine', async () => {
  const actual = await vi.importActual<
    typeof import('@symbiote-native/engine')
  >('@symbiote-native/engine');
  return {
    ...actual,
    Platform: {
      ...actual.Platform,
      OS: 'android',
      select: <T>(spec: {
        android?: T;
        ios?: T;
        native?: T;
        default?: T;
      }): T | undefined => {
        if ('android' in spec) return spec.android;
        if ('native' in spec) return spec.native;
        return spec.default;
      },
    },
  };
});

const { resolveButtonTextStyle, resolveButtonViewStyle } =
  await import('./render-button');

const ANDROID_BLUE = '#2196F3';
const ANDROID_TEXT = 'white';
const ANDROID_DISABLED_BACKGROUND = '#dfdfdf';
const ANDROID_DISABLED_TEXT = '#a1a1a1';
const CUSTOM = '#ff0000';

describe('Button folds on Android', () => {
  it('paints the Material button on the inner VIEW, which is the whole point of that node', () => {
    expect(resolveButtonViewStyle(undefined, undefined)).toEqual({
      elevation: 4,
      backgroundColor: ANDROID_BLUE,
      borderRadius: 2,
    });
  });

  it('sends `color` to the BUTTON, not to the text — the reverse of iOS', () => {
    expect(resolveButtonViewStyle(CUSTOM, undefined).backgroundColor).toBe(
      CUSTOM,
    );
    expect(resolveButtonTextStyle(CUSTOM, undefined).color).toBe(ANDROID_TEXT);
  });

  it('flattens and greys the button when disabled, over any color', () => {
    expect(resolveButtonViewStyle(CUSTOM, true)).toEqual({
      elevation: 0,
      backgroundColor: ANDROID_DISABLED_BACKGROUND,
      borderRadius: 2,
    });
    expect(resolveButtonTextStyle(undefined, true).color).toBe(
      ANDROID_DISABLED_TEXT,
    );
  });

  it('styles the label white and bold, with no fontSize of its own', () => {
    expect(resolveButtonTextStyle(undefined, undefined)).toEqual({
      textAlign: 'center',
      margin: 8,
      color: ANDROID_TEXT,
      fontWeight: '500',
    });
  });

  // THE UPPERCASE CASE LEFT ON 2026-09-18 AND NOTHING REPLACED IT HEADLESSLY, which is a gap worth
  // stating rather than a move. `Button.js:352-353` renders the title uppercased on Android, and
  // that is `foldButtonLabel` in `SymbioteFabricProps.cpp` now — behind `#ifdef ANDROID`, because a
  // raw text commits as `RCTRawText` on both platforms and there is no view NAME to branch on the
  // way `Switch`/`AndroidSwitch` gives one.
  //
  // This case reached the branch by mocking `Platform.OS`, and what it mocked was a JS function that
  // no longer exists — it would pass forever against a mock of nothing. Same class as
  // `android_ripple` and `decelerationRate`'s constants: a compile-time branch is only testable in a
  // build that compiles it, so closing this means an Android arm of the C++ test host.
});
