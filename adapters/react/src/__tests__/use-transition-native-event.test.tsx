// A real onPress runs through flushExternalUpdate (discrete priority + flushSyncWork). If
// that unconditionally forced ALL pending lanes to commit, wrapping the state update in
// startTransition from inside a native event would be pointless. Ground-truth check.

import { useState, useTransition, type ReactElement } from 'react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mount, unmount } from '@symbiote-native/react';
import {
  createLiveTree,
  installRecordingFabric,
  type IAuthoredNode,
} from '@symbiote-native/test-utils';

const ROOT_TAG = 217;
const fabric = installRecordingFabric();
const live = createLiveTree(fabric);
beforeEach(() => fabric.reset());
afterEach(() => unmount(ROOT_TAG));

function appView(): IAuthoredNode {
  const view = fabric.find(
    n => n.viewName === 'RCTView' && n.props.pointerEvents !== 'box-none',
  );
  if (view === undefined) throw new Error('app View was never created');
  return view;
}

function App(): ReactElement {
  const [count, setCount] = useState(0);
  const [, startTransition] = useTransition();
  return (
    <view onPress={() => startTransition(() => setCount(value => value + 1))}>
      <text>{`count: ${count}`}</text>
    </view>
  );
}

describe('startTransition from a native onPress', () => {
  it('leaves the update pending right after the synchronous event dispatch', () => {
    mount(ROOT_TAG, <App />);
    const view = appView();

    fabric.fireEvent(view.instanceHandle, 'topTouchStart');
    fabric.fireEvent(view.instanceHandle, 'topTouchEnd');

    expect(live.serialize(appView().handle)).toBe(
      'RCTView(RCTText(RCTRawText "count: 0"))',
    );
  });

  it('commits once the transition lane is allowed to flush', async () => {
    mount(ROOT_TAG, <App />);
    const view = appView();

    fabric.fireEvent(view.instanceHandle, 'topTouchStart');
    fabric.fireEvent(view.instanceHandle, 'topTouchEnd');
    await new Promise(resolve => setTimeout(resolve, 50));

    expect(live.serialize(appView().handle)).toBe(
      'RCTView(RCTText(RCTRawText "count: 1"))',
    );
  });
});
