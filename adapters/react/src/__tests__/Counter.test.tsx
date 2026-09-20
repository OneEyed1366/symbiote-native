// React-driven pipeline test, run against a fake Fabric slot instead of a simulator.
// Proves the engine's mutation->clone-on-write commit, the React mutation host config,
// and the tap->recommit round-trip.

import { useState, type ReactElement } from 'react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mount, unmount } from '@symbiote-native/react';
import {
  createLiveTree,
  installRecordingFabric,
  type IAuthoredNode,
} from '@symbiote-native/test-utils';

function Counter(): ReactElement {
  const [count, setCount] = useState(0);
  return (
    <view onPress={() => setCount(value => value + 1)}>
      <text>{`count: ${count}`}</text>
    </view>
  );
}

const ROOT_TAG = 11;

// The fake `nativeFabricUIManager` is a process singleton (RN installs it once via
// InitializeCore), and the engine registers its event handler against the live slot on the
// first mount via a module-level one-shot. So the slot is installed ONCE; the per-test unit
// is the mounted surface: `beforeEach(reset)` clears recordings, `afterEach(unmount)` tears
// the surface down so every `it` mounts from scratch.
const fabric = installRecordingFabric();
const live = createLiveTree(fabric);
beforeEach(() => fabric.reset());
afterEach(() => unmount(ROOT_TAG));

// The app's own View — the non-box-none RCTView (the box-none one is the AppContainer/surface).
function appView(): IAuthoredNode {
  const view = fabric.find(
    n => n.viewName === 'RCTView' && n.props.pointerEvents !== 'box-none',
  );
  if (view === undefined) throw new Error('app View was never created');
  return view;
}

describe('React Counter on the engine', () => {
  // Positive only: mount/commit/recommit have no throwing contract on valid React trees —
  // there is nothing here for a Negative group to assert against.
  describe('Positive', () => {
    // why: proves the FIRST commit already produces the real Fabric shape (View->Text->RawText)
    // wrapped by the synthetic AppContainer, not just "something got created". Serialized from the
    // app's own View rather than the surface root, since the surface commits AS a root child.
    it('mounts View > Text > RawText under a box-none AppContainer', () => {
      mount(ROOT_TAG, <Counter />);
      expect(live.serialize(appView().handle)).toBe(
        'RCTView(RCTText(RCTRawText "count: 0"))',
      );
    });

    // why: proves the full round-trip — a native touch event reaches React state, state drives
    // a re-render, and the engine's clone-on-write recommit lands the new tree on Fabric. This is
    // the one test that exercises event->state->recommit end to end, not just initial paint.
    it('a tap increments the counter and recommits', () => {
      mount(ROOT_TAG, <Counter />);

      const view = appView();
      // A press is an honest gesture: a touch that starts and ends on the same node. Fabric
      // hands the View's instanceHandle straight back.
      fabric.fireEvent(view.instanceHandle, 'topTouchStart');
      fabric.fireEvent(view.instanceHandle, 'topTouchEnd');

      expect(live.serialize(appView().handle)).toBe(
        'RCTView(RCTText(RCTRawText "count: 1"))',
      );
    });
  });
});
