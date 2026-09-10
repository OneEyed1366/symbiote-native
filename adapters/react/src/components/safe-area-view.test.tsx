// Co-located React-driven test.
// Proves the SafeAreaView primitive: its Fabric view name, the style passthrough,
// children nesting, the standard ViewProps (testID/accessibilityLabel/accessible)
// reaching the safe-area node, and onLayout routing as a real `topLayout` event.
//
// SCOPE: there is no component any more — `<safe-area-view>` is a bare tag, and this suite is
// what says the tag alone still carries everything the wrapper used to. The aria fold moved to the
// engine's `fabricProps` and `id -> nativeID` to `foldHostBag`; both have their own coverage in
// core, so what is proven here is that they reach a real committed node from the tag path.
//
// It passes UNCHANGED apart from the spelling, which is the point: a suite that survives its
// subject being deleted was testing the primitive rather than the wrapper.

import { type ReactElement } from 'react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { View, mount, unmount } from '@symbiote-native/react';
import { installFabric, type IFakeNode } from '@symbiote-native/test-utils';

const TEST_ID = 'safe-area';
const ACCESSIBILITY_LABEL = 'screen';
const ROOT_TAG = 220;

let layoutFired = false;

function App(): ReactElement {
  return (
    <safe-area-view
      style={{ flex: 1, backgroundColor: '#fff' }}
      testID={TEST_ID}
      accessibilityLabel={ACCESSIBILITY_LABEL}
      accessible={true}
      onLayout={() => {
        layoutFired = true;
      }}
    >
      <View />
    </safe-area-view>
  );
}

const fabric = installFabric();
beforeEach(() => {
  fabric.reset();
  layoutFired = false;
});
afterEach(() => unmount(ROOT_TAG));

function safeAreaNode(): IFakeNode {
  const node = fabric.find(n => n.viewName === 'SafeAreaView');
  expect(node, 'a SafeAreaView was created').toBeDefined();
  return node!;
}

describe('SafeAreaView', () => {
  // why: the tag must resolve to its own intrinsic (the node the native host insets), not
  // silently degrade to a plain View — the product contract IS the distinct native view name.
  it('commits a SafeAreaView wrapping its children under the app container', () => {
    mount(ROOT_TAG, <App />);
    expect(fabric.serialize(fabric.appRoot().children)).toBe(
      'SafeAreaView(RCTView)',
    );
  });

  // why: there is no JS-side layout math here at all — a caller's style must reach the real node
  // unmodified for the native host to apply, and children must nest under it, not beside it.
  it('flattens style onto the safe-area node and nests children', () => {
    mount(ROOT_TAG, <App />);
    const safe = safeAreaNode();
    expect(safe.props.flex).toBe(1);
    expect(safe.props.backgroundColor).toBe('#fff');
    expect(safe.children).toHaveLength(1);
    expect(safe.children[0].viewName).toBe('RCTView');
  });

  // why: testID/accessibilityLabel/accessible are the standard cross-component contract every
  // primitive must honor for testing and a11y tooling — the tag path must not swallow them on its
  // way through the engine's own accessibility fold.
  it('passes the standard ViewProps through to the safe-area node', () => {
    mount(ROOT_TAG, <App />);
    const safe = safeAreaNode();
    expect(safe.props.testID).toBe(TEST_ID);
    expect(safe.props.accessibilityLabel).toBe(ACCESSIBILITY_LABEL);
    expect(safe.props.accessible).toBe(true);
  });

  // why: proves the listener actually reaches the native node, so a real topLayout event fires
  // through it — and with it the gated `onLayout` boolean without which native never measures.
  it('routes onLayout as a topLayout event', () => {
    mount(ROOT_TAG, <App />);
    const safe = safeAreaNode();
    fabric.fireEvent(safe.instanceHandle, 'topLayout', {});
    expect(layoutFired).toBe(true);
  });

  // why: the other half of the gate — omitting onLayout must NOT leave a stray `onLayout` key on
  // the committed node, which would tell native to measure a view nobody is listening to.
  it('omits onLayout from the committed node when the prop is not passed', () => {
    mount(
      ROOT_TAG,
      <safe-area-view testID={TEST_ID}>
        <View />
      </safe-area-view>,
    );
    const safe = safeAreaNode();
    expect('onLayout' in safe.props).toBe(false);
  });
});
