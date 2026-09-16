// Co-located regression of the CONTROLLED refresh path.
// When onRefresh fires and the parent flips refreshing -> true,
// that true must reach the committed PullToRefreshView node, or native's UIRefreshControl is
// never told to keep spinning. The sibling refresh-control.test.tsx covers the static
// refreshing:false mount; this covers the false->true flip. We fire the real `topRefresh`
// event (same discrete-lane flush path the device uses) and inspect the recommitted tree.
// Green here means a missing spinner is native/visual, not JS.
//
// Positive-only for the same reason as refresh-control.test.tsx: the tag has no throwing path,
// so there is no Negative group.

import { useState, type ReactElement } from 'react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mount, unmount } from '@symbiote-native/react';
import {
  createLiveTree,
  installRecordingFabric,
  type ILiveNode,
} from '@symbiote-native/test-utils';

const ROOT_TAG = 62;

function App(): ReactElement {
  const [refreshing, setRefreshing] = useState(false);
  return (
    <scroll-view>
      <refresh-control
        refreshing={refreshing}
        onRefresh={() => setRefreshing(true)}
      />
      <view />
    </scroll-view>
  );
}

const fabric = installRecordingFabric();
const live = createLiveTree(fabric);

// The flip produces a re-clone of the refresh node with new props, so this always re-reads the
// LIVE tree (not the creation log, which would keep the original snapshot).
function findRefresh(): ILiveNode | undefined {
  return live.findLive(
    live.appRoot(),
    node => node.viewName === 'PullToRefreshView',
  );
}

beforeEach(() => fabric.reset());
afterEach(() => unmount(ROOT_TAG));

describe('React <refresh-control> controlled flip on the engine (Positive — completes without error)', () => {
  // why: `refreshing` is a CONTROLLED prop — the tag itself holds no internal
  // spinner state, the app owns it and must re-push it every commit. If the clone-on-write
  // recommit dropped the new value, the spinner would freeze at its stale state forever
  // after the very first pull, since native never gets told to keep spinning.
  it('propagates refreshing:false -> true to the committed node after topRefresh', () => {
    mount(ROOT_TAG, <App />);

    const before = findRefresh();
    expect(before, 'a PullToRefreshView committed at mount').toBeDefined();
    expect(before?.payload.refreshing).toBe(false);

    // Native fires the pull gesture -> onRefresh -> setRefreshing(true).
    fabric.fireEvent(before!.instanceHandle, 'topRefresh', {});

    const after = findRefresh();
    expect(after?.payload.refreshing).toBe(true);
  });
});
