// Proves the synthetic root container, symbiote's equivalent of RN's AppContainer
// (`renderApplication` wraps the app in `<view style={{flex:1}} pointerEvents="box-none">`):
// every commit puts a single box-none, flex:1 RCTView at the top of the child set,
// wrapping the app's own top-level nodes.

import { type ReactElement } from 'react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mount, unmount } from '@symbiote-native/react';
import {
  createLiveTree,
  installRecordingFabric,
} from '@symbiote-native/test-utils';

function App(): ReactElement {
  return (
    <view>
      <text>hello</text>
    </view>
  );
}

const ROOT_TAG = 200;

const fabric = installRecordingFabric();
const live = createLiveTree(fabric);
beforeEach(() => fabric.reset());
afterEach(() => unmount(ROOT_TAG));

describe('synthetic AppContainer root', () => {
  // Positive only: the wrapper is unconditional structural setup around every commit, not a
  // guarded/validated path — no Negative group applies.
  describe('Positive', () => {
    // why: pointerEvents:"box-none" is what makes the wrapper transparent to touches (RN's own
    // AppContainer contract) — a plain RCTView here would swallow touches meant for the app.
    it('wraps the app in a single box-none, flex:1 RCTView', () => {
      mount(ROOT_TAG, <App />);

      // appRoot() asserts the invariant: exactly one root carrying box-none.
      //
      // Its NAME reads `#surface`, not `RCTView`, and that is a correction rather than a
      // regression: the container IS the surface node — created as an `RCTView` and then set to the
      // surface component, which is what `componentOf` reports and what Fabric commits as
      // `RootView`. The stand-in kept the creation name. Everything the case is actually about —
      // box-none, flex, the single child — is unchanged.
      const root = live.nodeOf(live.appRoot());
      expect(root.viewName).toBe('#surface');
      expect(root.payload.flex).toBe(1);
      expect(root.payload.pointerEvents).toBe('box-none');
    });

    // why: the wrapper must add exactly one layer, never nest the app tree deeper or merge
    // multiple top-level app nodes into the wrapper itself.
    it("puts the app's own View as the container's single child", () => {
      mount(ROOT_TAG, <App />);

      const root = live.nodeOf(live.appRoot());
      expect(root.children).toHaveLength(1);
      expect(root.children[0].viewName).toBe('RCTView');
    });
  });
});
