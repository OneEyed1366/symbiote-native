// Co-located regression of the CONTROLLED refresh path.
// When onRefresh fires and the parent flips refreshing -> true,
// that true must reach the committed PullToRefreshView node, or native's UIRefreshControl is
// never told to keep spinning. The sibling refresh-control.test.tsx covers the static
// refreshing:false mount; this covers the false->true flip. We fire the real `topRefresh`
// event (same discrete-lane flush path the device uses) and inspect the recommitted tree.
// Green here means a missing spinner is native/visual, not JS.
//
// Positive-only for the same reason as refresh-control.test.tsx: RefreshControl has no
// throwing path, so there is no Negative group.

import { useState, type ReactElement } from 'react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { View, ScrollView, RefreshControl, mount, unmount } from '@symbiote-native/react';
import { installFabric, type IFakeNode } from '@symbiote-native/test-utils';

const ROOT_TAG = 62;

function App(): ReactElement {
  const [refreshing, setRefreshing] = useState(false);
  return (
    <ScrollView
      refreshControl={
        <RefreshControl refreshing={refreshing} onRefresh={() => setRefreshing(true)} />
      }
    >
      <View />
    </ScrollView>
  );
}

// The flip produces a CLONE of the refresh node with new props, so walk the committed tree
// (not `fabric.find`, which records only the originally created node).
function findRefresh(nodes: IFakeNode[]): IFakeNode | undefined {
  for (const node of nodes) {
    if (node.viewName === 'PullToRefreshView') return node;
    const found = findRefresh(node.children);
    if (found) return found;
  }
  return undefined;
}

const fabric = installFabric();
beforeEach(() => fabric.reset());
afterEach(() => unmount(ROOT_TAG));

describe('React RefreshControl controlled flip on the engine (Positive — completes without error)', () => {
  // why: `refreshing` is a CONTROLLED prop — RefreshControl itself holds no internal
  // spinner state, the app owns it and must re-push it every commit. If the clone-on-write
  // recommit dropped the new value, the spinner would freeze at its stale state forever
  // after the very first pull, since native never gets told to keep spinning.
  it('propagates refreshing:false -> true to the committed node after topRefresh', () => {
    mount(ROOT_TAG, <App />);

    const before = findRefresh(fabric.committed);
    expect(before, 'a PullToRefreshView committed at mount').toBeDefined();
    expect(before?.props.refreshing).toBe(false);

    // Native fires the pull gesture -> onRefresh -> setRefreshing(true).
    fabric.fireEvent(before!.instanceHandle, 'topRefresh', {});

    const after = findRefresh(fabric.committed);
    expect(after?.props.refreshing).toBe(true);
  });
});
