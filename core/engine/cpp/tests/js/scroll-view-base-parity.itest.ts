// The one constant this migration could NOT de-duplicate, held to its copy by a test.
//
// WHY TWO COPIES EXIST AND ARE BOTH RIGHT. `foldScrollViewProps` composes RN's base style onto every
// scroll view (`SymbioteFabricProps.cpp`), which covers the ordinary case. Android's RefreshControl
// path does not go through it: RN WRAPS the scroll view in an `AndroidSwipeRefreshLayout` and splits
// the app's style across the two boxes, composing `baseStyle` onto BOTH —
// `StyleSheet.compose(baseStyle, outer)` and `StyleSheet.compose(baseStyle, inner)`
// (`ScrollView.js:1854-1863`, whose own comment says "the ScrollView still needs the baseStyle to be
// scrollable"). That split reads the OWNER's style from the WRAPPER's fold, i.e. one node reading
// another, which is composition and stays in JS — so JS needs the base value too.
//
// The wrapper's half is the reason it cannot simply read the engine's output: a fold sees only its
// OWN node's bag, and the wrapper's bag never had the base composed onto it.
//
// SO THE DUPLICATION IS STRUCTURAL, and the honest answer to a mirror that cannot be removed is to
// make it LOUD. Edit either copy alone and this goes red, naming the key that drifted. Without it the
// two paths diverge in silence, and the divergence only shows on an Android device with a
// RefreshControl attached — which is the narrowest possible place to discover it.
//
// This is the only cross-language constant check in the suite, and it works because the itest
// harness can see BOTH sides in one process: the payload C++ actually committed, and the JS module
// the Android wrap will actually read.

import {
  registerScrollViewBehavior,
  SCROLL_VIEW_BASE_HORIZONTAL,
  SCROLL_VIEW_BASE_VERTICAL,
} from '@symbiote-native/components';

import {
  committedPayloadOf,
  createElement,
  createSurface,
  type ISymbioteNode,
} from '@symbiote-native/engine';

import { describe, expect, it, mounted, print, report } from './harness';

const ROOT_TAG = 1;

registerScrollViewBehavior();

/** The payload of a scroll view carrying NO app style, so every style key in it is the base's. */
function committedBase(tag: string): Readonly<Record<string, unknown>> {
  const surface = createSurface(ROOT_TAG);
  const node: ISymbioteNode = createElement('RCTScrollView', false, tag);
  surface.appendChild(node);
  surface.commit();
  mounted();

  const payload = committedPayloadOf(node);
  if (payload === undefined) throw new Error('nothing committed');
  return payload;
}

function expectBaseMatches(
  tag: string,
  base: Readonly<Record<string, unknown>>,
): void {
  const payload = committedBase(tag);
  for (const [key, value] of Object.entries(base)) {
    // Key by key rather than as an object: the payload carries more than the base (the axis flag,
    // the bounce pair, `nestedScrollEnabled`), so a whole-object comparison would be asserting
    // those too and would fail for reasons that have nothing to do with this file's question.
    expect(`${key}=${String(payload[key])}`).toBe(`${key}=${String(value)}`);
  }
}

describe('the engine composes the same base style JS still holds', () => {
  // why: the vertical base is what makes an ordinary list clip and scroll. If the C++ literal drifts
  // from this module, an Android scroll view WITH a RefreshControl keeps the JS value and one
  // WITHOUT it keeps the C++ value — two scroll views in one app, styled differently, with nothing
  // red anywhere.
  it('matches SCROLL_VIEW_BASE_VERTICAL key for key', () => {
    print(
      `DEBUG vertical base: ${Object.keys(SCROLL_VIEW_BASE_VERTICAL).join(',')}`,
    );
    expectBaseMatches('scroll-view', SCROLL_VIEW_BASE_VERTICAL);
  });

  // why: the horizontal base differs in exactly one key (`flexDirection`), which is precisely the
  // kind of near-identical pair where a one-sided edit hides. Both axes are checked so a copy-paste
  // fix to one of them cannot pass by resembling the other.
  it('matches SCROLL_VIEW_BASE_HORIZONTAL key for key', () => {
    expectBaseMatches('horizontal-scroll-view', SCROLL_VIEW_BASE_HORIZONTAL);
  });

  // why: THE CONTROL. If the two bases were accidentally made identical — the likeliest way to
  // "fix" a drift — both cases above would still pass while the horizontal axis silently laid its
  // content out in a column. The pair must differ, and differ in the axis key.
  it('keeps the two bases different on the axis key', () => {
    expect(SCROLL_VIEW_BASE_VERTICAL.flexDirection).toBe('column');
    expect(SCROLL_VIEW_BASE_HORIZONTAL.flexDirection).toBe('row');
  });
});

report();
