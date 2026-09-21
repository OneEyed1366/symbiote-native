// Co-located proof of the RefreshControl primitive wired into ScrollView.
// Asserts the iOS nesting
// (PullToRefreshView is a child of RCTScrollView, a sibling BEFORE RCTScrollContentView),
// that `refreshing` and a string prop (`title`) pass through as real Fabric props, that the
// Android-only `enabled` prop forwards to native, and that firing topRefresh on the
// refresh-control node calls onRefresh, all against the recording host, no simulator.
// A failure here is in JS.
//
// There is no component any more — `<refresh-control>` is a bare tag, and nothing it accepts is
// rejected, so there is no Negative group here. Neither is there a `refreshControl` PROP to hand it
// to: the control is an ordinary CHILD, and the scroll behavior CLAIMS it, which is what puts it
// beside the content view here and inverts the tree on Android. That Android wrap is the engine's
// (`core/components/src/behaviors/scroll-view/wrap-android.test.ts`) — the adapter no longer has a
// platform build for it to get wrong.

import { type ReactElement } from 'react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mount, unmount } from '@symbiote-native/react';
import {
  createLiveTree,
  installRecordingFabric,
  type ILiveNode,
} from '@symbiote-native/test-utils';

const ROOT_TAG = 61;

// onRefresh records into a module-level flag (the App is module-level); reset per test.
let refreshed = false;

function App(): ReactElement {
  return (
    <scroll-view>
      <refresh-control
        refreshing={false}
        enabled={true}
        title="Pull to refresh"
        onRefresh={() => {
          refreshed = true;
        }}
      />
      <view />
    </scroll-view>
  );
}

const fabric = installRecordingFabric();
const live = createLiveTree(fabric);
beforeEach(() => {
  fabric.reset();
  refreshed = false;
});
afterEach(() => unmount(ROOT_TAG));

// The serializer runs siblings together, same shorthand `fabric.serialize` used to produce.
function serialize(nodes: ILiveNode[]): string {
  return nodes.map(node => live.serialize(node.handle)).join('');
}

describe('React <refresh-control> on the engine (Positive — completes without error)', () => {
  // why: iOS has no room in RN's Fabric ScrollView for a wrapper node, so RefreshControl
  // must render as a SIBLING of the content container, positioned before it — reversing the
  // order (or nesting it inside the content container) breaks the native pull gesture.
  it('nests PullToRefreshView before the content container under the ScrollView', () => {
    mount(ROOT_TAG, <App />);

    const appRoot = live.nodeOf(live.appRoot());
    expect(serialize(appRoot.children)).toBe(
      'RCTScrollView(PullToRefreshViewRCTScrollContentView(RCTView))',
    );

    // The serializer runs siblings together, so assert the ordered children of the scroll
    // view directly: refresh control FIRST, content container SECOND.
    const scrollView = appRoot.children[0];
    expect(scrollView?.viewName).toBe('RCTScrollView');
    const childNames = scrollView.children.map(node => node.viewName);
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

    const refresh = live.findLive(
      live.appRoot(),
      node => node.viewName === 'PullToRefreshView',
    );
    expect(refresh, 'a PullToRefreshView was created').toBeDefined();
    expect(refresh!.payload.refreshing).toBe(false);
    expect(refresh!.payload.enabled).toBe(true);
    expect(refresh!.payload.title).toBe('Pull to refresh');
  });

  // why: native reports the pull gesture via the direct `topRefresh` event; RefreshControl's
  // entire product purpose is turning that gesture into the app's `onRefresh` callback.
  it('calls onRefresh when topRefresh fires on the refresh-control node', () => {
    mount(ROOT_TAG, <App />);

    const refresh = live.findLive(
      live.appRoot(),
      node => node.viewName === 'PullToRefreshView',
    );
    expect(refresh, 'a PullToRefreshView was created').toBeDefined();

    fabric.fireEvent(refresh!.instanceHandle, 'topRefresh', {});
    expect(refreshed).toBe(true);
  });
});
