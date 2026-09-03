// Co-located test for the ANDROID ScrollView RefreshControl WRAP style routing.
// On Android a RefreshControl WRAPS the scroll view
// (AndroidSwipeRefreshLayout is the parent). RN splits the user `style` (splitLayoutProps):
// LAYOUT -> wrapper, VISUAL -> inner scroll view. We assert that split.
//
// The barrel ScrollView resolves to the iOS build under vitest, so to test the Android wrap we
// import scroll-view/index.android directly. RefreshControl is platform-agnostic (barrel).
//
// HEADLESS LIMITATION: the intrinsic->native-name table resolves to the iOS build, so the
// RefreshControl node serializes as the iOS native name 'PullToRefreshView' rather than
// Android's 'AndroidSwipeRefreshLayout'. The Android wrap LOGIC under test is identical; the
// style-split assertions key off node ROLE, not native name, so the limitation doesn't weaken them.
//
// SCOPE: `splitLayoutProps` (core/components/src/scroll-view-commands.ts, the layout/visual
// style partition) has no co-located core-level unit test of its own — this file (plus its Vue
// and Angular siblings, scroll-view-android-class.test.ts / scroll-view-class-style.test.ts) is
// its only coverage, each exercised through that adapter's real Android wrap. No Negative group:
// a plain, throwless key-set filter — an unrecognized style key just isn't routed to either
// side (falls through untouched), it does not reject.

import { type ReactElement } from 'react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { View, RefreshControl, mount, unmount } from '@symbiote-native/react';
import { installFabric } from '@symbiote-native/test-utils';
import { ScrollView } from './index.android';

const ROOT_TAG = 52;

// A VERTICAL ScrollView WITH a refreshControl and a style mixing LAYOUT (height, margin) and
// VISUAL (backgroundColor, padding) props: exactly the split the wrap must route.
function App(): ReactElement {
  return (
    <ScrollView
      style={{ height: 200, backgroundColor: '#123', padding: 8, margin: 4 }}
      refreshControl={<RefreshControl refreshing={false} />}
    >
      <View />
    </ScrollView>
  );
}

const fabric = installFabric();
beforeEach(() => fabric.reset());
afterEach(() => unmount(ROOT_TAG));

describe('Android ScrollView RefreshControl wrap', () => {
  // why: Android has no native RefreshControl-as-sibling concept like iOS — RN wraps the whole
  // scroll view in AndroidSwipeRefreshLayout, so the wrap shape itself (outer refresh node,
  // inner scroll view, inner content) IS the platform contract, not an implementation detail.
  it('wraps RCTScrollView in the RefreshControl node under a box-none AppContainer', () => {
    mount(ROOT_TAG, <App />);

    const shape = fabric.serialize(fabric.appRoot().children);
    // The wrap shape: the RefreshControl node WRAPS RCTScrollView, which holds the content.
    expect(
      shape.endsWith('(RCTScrollView(RCTScrollContentView(RCTView)))'),
    ).toBe(true);
  });

  // why: with the scroll view now nested inside the refresh wrapper, whichever node gets the
  // user's `height`/`margin` decides the actual on-screen size — routing them to the wrong node
  // would either double-apply layout or size the wrong box, both visibly broken.
  it('routes LAYOUT props to the wrapper and keeps them off the inner scroll view', () => {
    mount(ROOT_TAG, <App />);

    const inner = fabric.find(node => node.viewName === 'RCTScrollView');
    expect(inner, 'inner RCTScrollView was created').toBeDefined();
    const wrapper = fabric.find(node =>
      node.children.some(kid => kid === inner),
    );
    expect(
      wrapper,
      'a wrapper node wraps the inner RCTScrollView',
    ).toBeDefined();

    // `margin` is a pure-layout key: it drives the wrapper's frame and must NOT leak onto the inner.
    expect(wrapper!.props.margin).toBe(4);
    expect('margin' in inner!.props).toBe(false);
    // `height` is layout too: it sizes the laid-out box (the wrapper).
    expect(wrapper!.props.height).toBe(200);
  });

  // why: the counterpart split — backgroundColor/padding paint CONTENT, so they belong on the
  // scrolling node; landing them on the wrapper would paint/pad the refresh chrome instead of
  // the user's content.
  it('routes VISUAL props to the inner scroll view and keeps them off the wrapper', () => {
    mount(ROOT_TAG, <App />);

    const inner = fabric.find(node => node.viewName === 'RCTScrollView');
    expect(inner, 'inner RCTScrollView was created').toBeDefined();
    const wrapper = fabric.find(node =>
      node.children.some(kid => kid === inner),
    );
    expect(
      wrapper,
      'a wrapper node wraps the inner RCTScrollView',
    ).toBeDefined();

    // backgroundColor and padding paint the scrolling content; they belong on the inner scroll view.
    expect(inner!.props.backgroundColor).toBe('#123');
    expect(inner!.props.padding).toBe(8);
    expect('backgroundColor' in wrapper!.props).toBe(false);
    expect('padding' in wrapper!.props).toBe(false);
  });

  // why: regression guard — an earlier implementation force-set flex:1 on the inner view
  // assuming it always needed to fill the (now separate) wrapper; that assumption silently broke
  // once height moved to the wrapper. The inner view's own base scroll/axis styles and gesture
  // wiring (nestedScrollEnabled, so the inner scroll consumes gestures before the refresh does)
  // must still be intact under the wrap.
  it('leaves the inner scroll view with its vertical base and no hardcoded flex', () => {
    mount(ROOT_TAG, <App />);

    const inner = fabric.find(node => node.viewName === 'RCTScrollView');
    expect(inner, 'inner RCTScrollView was created').toBeDefined();

    // The old INNER_FILL_STYLE forced flex:1 on the inner view; with height routed to the wrapper
    // the inner side has no flex at all.
    expect('flex' in inner!.props).toBe(false);
    // splitLayoutProps must not strip the base style the wrap composes under the visual props.
    expect(inner!.props.overflow).toBe('scroll');
    expect(inner!.props.flexDirection).toBe('column');
    // nestedScrollEnabled is the wrap's gesture wiring: the inner handles the scroll before refresh.
    expect(inner!.props.nestedScrollEnabled).toBe(true);
  });
});
