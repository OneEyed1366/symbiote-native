// `Activity` is React's hide-without-unmount: `mode="hidden"` must keep the subtree's state and
// its children alive while it stops painting. The reconciler asks for that through the host
// config's hideInstance/unhideInstance, which were no-ops here — so hidden content went on
// painting, stacked over whatever replaced it, and only Activity's mount half looked like it
// worked. Asserting the committed style, not the call, because a call that writes nothing is
// exactly the bug.

import { Activity, useState, type ReactElement } from 'react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mount, unmount } from '@symbiote-native/react';
import {
  createLiveTree,
  installRecordingFabric,
  type ILiveNode,
} from '@symbiote-native/test-utils';

const ROOT_TAG = 11;

const fabric = installRecordingFabric();
const live = createLiveTree(fabric);
beforeEach(() => fabric.reset());
afterEach(() => unmount(ROOT_TAG));

// The panel is never unmounted by Activity, only hidden, so it stays a LIVE descendant of the
// root for the whole test — a residency check walks from there rather than trusting the creation
// log, which would still answer for a node ten renders gone.
function panelNode(): ILiveNode | undefined {
  return live.findLive(
    live.appRoot(),
    n => n.props.testID === 'activity-panel',
  );
}

// The engine flattens a style array into individual props at commit, so `display` arrives as a
// top-level PAYLOAD key rather than inside an authored `style` object.
function panelProps(): Record<string, unknown> {
  return panelNode()?.payload ?? {};
}

function Panel({ hidden }: { hidden: boolean }): ReactElement {
  return (
    <Activity mode={hidden ? 'hidden' : 'visible'}>
      <view testID="activity-panel" style={{ backgroundColor: '#24304a' }}>
        <text>panel</text>
      </view>
    </Activity>
  );
}

function Host(): ReactElement {
  const [hidden, setHidden] = useState(false);
  return (
    <view testID="activity-host" onPress={() => setHidden(value => !value)}>
      <Panel hidden={hidden} />
    </view>
  );
}

describe('Activity hides a subtree without unmounting it', () => {
  it('stops the subtree painting and lets it paint again', () => {
    mount(ROOT_TAG, <Host />);

    expect(Object.hasOwn(panelProps(), 'display')).toBe(false);

    const host = fabric.find(entry => entry.props.testID === 'activity-host');
    fabric.fireEvent(host?.instanceHandle, 'topTouchStart');
    fabric.fireEvent(host?.instanceHandle, 'topTouchEnd');

    // Hidden, and STILL PRESENT — an unmount would satisfy "stops painting" while destroying the
    // state Activity exists to preserve, so the node has to survive the check.
    expect(panelProps().display).toBe('none');
    expect(panelNode()).toBeDefined();

    fabric.fireEvent(host?.instanceHandle, 'topTouchStart');
    fabric.fireEvent(host?.instanceHandle, 'topTouchEnd');

    // Unhiding CLEARS the flag rather than writing display:'flex' over it, and leaves the
    // author's own style intact — that reversibility is why the slot lives in the engine. A
    // vanished prop is a missing PAYLOAD key, not a `null`/`undefined` value.
    expect(Object.hasOwn(panelProps(), 'display')).toBe(false);
    expect(panelProps().backgroundColor).toBe('#24304a');
  });
});
