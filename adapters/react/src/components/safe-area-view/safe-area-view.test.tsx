// Co-located React-driven test.
// Proves the SafeAreaView primitive: its Fabric view name, the style passthrough,
// children nesting, the standard ViewProps (testID/accessibilityLabel/accessible)
// reaching the safe-area node, and onLayout routing as a real `topLayout` event.
//
// SCOPE: SafeAreaView is a single flat function component (adapters/react/src/components/
// safe-area-view/index.ts) with no core/components split — there is no reducer/render half
// living elsewhere, so this file is the complete coverage, not merely a wiring proof.
// `resolveAccessibilityProps` and the class/style routeProp merge are shared engine infra with
// their own coverage elsewhere (core/engine) — N/A here, this file only proves SafeAreaView
// actually calls/forwards through them onto a real committed node.
//
// No Negative group: the component has exactly one conditional (`onLayout !== undefined`),
// no guard clause, nothing throws. Both branches of that conditional are exercised below.

import { type ReactElement } from 'react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { SafeAreaView, View, mount, unmount } from '@symbiote-native/react';
import { installFabric, type IFakeNode } from '@symbiote-native/test-utils';

const TEST_ID = 'safe-area';
const ACCESSIBILITY_LABEL = 'screen';
const ROOT_TAG = 220;

let layoutFired = false;

function App(): ReactElement {
  return (
    <SafeAreaView
      style={{ flex: 1, backgroundColor: '#fff' }}
      testID={TEST_ID}
      accessibilityLabel={ACCESSIBILITY_LABEL}
      accessible={true}
      onLayout={() => {
        layoutFired = true;
      }}
    >
      <View />
    </SafeAreaView>
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
  // why: SafeAreaView must render its own intrinsic (the node the native host insets), not
  // silently degrade to a plain View — the product contract IS the distinct native view name.
  it('commits a SafeAreaView wrapping its children under the app container', () => {
    mount(ROOT_TAG, <App />);
    expect(fabric.serialize(fabric.appRoot().children)).toBe('SafeAreaView(RCTView)');
  });

  // why: SafeAreaView has no JS-side layout math of its own (the header comment: "there is no
  // JS-side translation") — a caller's style must reach the real node unmodified for the native
  // host to apply, and children must nest under it rather than beside it.
  it('flattens style onto the safe-area node and nests children', () => {
    mount(ROOT_TAG, <App />);
    const safe = safeAreaNode();
    expect(safe.props.flex).toBe(1);
    expect(safe.props.backgroundColor).toBe('#fff');
    expect(safe.children).toHaveLength(1);
    expect(safe.children[0].viewName).toBe('RCTView');
  });

  // why: testID/accessibilityLabel/accessible are the standard cross-component contract every
  // primitive must honor for testing and a11y tooling — SafeAreaView must not swallow them while
  // routing through resolveAccessibilityProps + `...accessibilityRest`.
  it('passes the standard ViewProps through to the safe-area node', () => {
    mount(ROOT_TAG, <App />);
    const safe = safeAreaNode();
    expect(safe.props.testID).toBe(TEST_ID);
    expect(safe.props.accessibilityLabel).toBe(ACCESSIBILITY_LABEL);
    expect(safe.props.accessible).toBe(true);
  });

  // why: onLayout is the only prop the component destructures and conditionally re-attaches
  // (`if (onLayout !== undefined)`) rather than blindly spreading — proves that attach actually
  // reaches the native node as a live listener a real topLayout event fires through.
  it('routes onLayout as a topLayout event', () => {
    mount(ROOT_TAG, <App />);
    const safe = safeAreaNode();
    fabric.fireEvent(safe.instanceHandle, 'topLayout', {});
    expect(layoutFired).toBe(true);
  });

  // why: closes the other branch of the same conditional above — omitting onLayout must NOT
  // leave a stray `onLayout` key on the committed node (which would mean an unwanted listener,
  // or worse, a stale one from a previous render carried forward by the diff).
  it('omits onLayout from the committed node when the prop is not passed', () => {
    mount(
      ROOT_TAG,
      <SafeAreaView testID={TEST_ID}>
        <View />
      </SafeAreaView>,
    );
    const safe = safeAreaNode();
    expect('onLayout' in safe.props).toBe(false);
  });
});
