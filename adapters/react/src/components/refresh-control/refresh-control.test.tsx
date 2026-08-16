// Co-located proof of the RefreshControl primitive wired into ScrollView.
// Asserts the iOS nesting
// (PullToRefreshView is a child of RCTScrollView, a sibling BEFORE RCTScrollContentView),
// that `refreshing` and a string prop (`title`) pass through as real Fabric props, that the
// Android-only `enabled` prop forwards to native, and that firing topRefresh on the
// refresh-control node calls onRefresh, all against the fake Fabric slot, no simulator.
// A failure here is in JS.
//
// RefreshControl (adapters/react/src/components/refresh-control/index.ts) is a plain
// functional component with no reducer/render split into core/components and no guard
// clause on any prop — every branch is either a `dlog` side effect or an unconditional
// object spread onto `createElement('symbiote-refresh-control', ...)`. There is no input
// this component rejects, so there is no Negative (toThrow) group here — only Positive.
// `resolveAccessibilityProps` is shared infrastructure exercised elsewhere (activity-indicator,
// image, modal tests) and not RefreshControl-specific, so it stays out of scope here.
// The Android WRAP-style routing (RefreshControl wraps ScrollView instead of nesting inside
// it) is covered by the sibling scroll-view-android-refresh.test.tsx, not duplicated here.

import { type ReactElement } from 'react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { View, ScrollView, RefreshControl, mount, unmount } from '@symbiote-native/react';
import { installFabric, type IFakeNode } from '@symbiote-native/test-utils';

const ROOT_TAG = 61;

// onRefresh records into a module-level flag (the App is module-level); reset per test.
let refreshed = false;

function App(): ReactElement {
  return (
    <ScrollView
      refreshControl={
        <RefreshControl
          refreshing={false}
          enabled={true}
          title="Pull to refresh"
          onRefresh={() => {
            refreshed = true;
          }}
        />
      }
    >
      <View />
    </ScrollView>
  );
}

const fabric = installFabric();
beforeEach(() => {
  fabric.reset();
  refreshed = false;
});
afterEach(() => unmount(ROOT_TAG));

describe('React RefreshControl on the engine (Positive — completes without error)', () => {
  // why: iOS has no room in RN's Fabric ScrollView for a wrapper node, so RefreshControl
  // must render as a SIBLING of the content container, positioned before it — reversing the
  // order (or nesting it inside the content container) breaks the native pull gesture.
  it('nests PullToRefreshView before the content container under the ScrollView', () => {
    mount(ROOT_TAG, <App />);

    // appRoot() asserts the single box-none AppContainer root (committed.length === 1 and
    // pointerEvents === 'box-none'), then unwraps it.
    const appRoot = fabric.appRoot();
    expect(fabric.serialize(appRoot.children)).toBe(
      'RCTScrollView(PullToRefreshViewRCTScrollContentView(RCTView))',
    );

    // The serializer runs siblings together, so assert the ordered children of the scroll
    // view directly: refresh control FIRST, content container SECOND.
    const scrollView = appRoot.children[0];
    expect(scrollView?.viewName).toBe('RCTScrollView');
    const childNames = scrollView.children.map((node: IFakeNode) => node.viewName);
    expect(childNames).toEqual(['PullToRefreshView', 'RCTScrollContentView']);
  });

  // why: `refreshing` is the boolean RN spinner state; `enabled` is Android-only
  // (AndroidSwipeRefreshLayout) and was once accidentally stripped, breaking
  // `<RefreshControl enabled={false} />` — both must survive the `...nativeProps` spread
  // onto the native node. `title` stands in for the whole class of plain string/number
  // native-styling props (tintColor, titleColor, progressViewOffset, colors,
  // progressBackgroundColor, size) that ride the same uniform spread: proving one
  // non-boolean field crosses proves the mechanism, asserting each individually would only
  // re-test the object-spread operator, not product behavior.
  it('forwards refreshing:false, the Android-only enabled prop, and title to native', () => {
    mount(ROOT_TAG, <App />);

    const refresh = fabric.find(node => node.viewName === 'PullToRefreshView');
    expect(refresh, 'a PullToRefreshView was created').toBeDefined();
    expect(refresh!.props.refreshing).toBe(false);
    expect(refresh!.props.enabled).toBe(true);
    expect(refresh!.props.title).toBe('Pull to refresh');
  });

  // why: native reports the pull gesture via the direct `topRefresh` event; RefreshControl's
  // entire product purpose is turning that gesture into the app's `onRefresh` callback.
  it('calls onRefresh when topRefresh fires on the refresh-control node', () => {
    mount(ROOT_TAG, <App />);

    const refresh = fabric.find(node => node.viewName === 'PullToRefreshView');
    expect(refresh, 'a PullToRefreshView was created').toBeDefined();

    fabric.fireEvent(refresh!.instanceHandle, 'topRefresh', {});
    expect(refreshed).toBe(true);
  });
});
