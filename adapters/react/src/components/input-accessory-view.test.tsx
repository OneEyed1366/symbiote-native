// Co-located React-driven test.
//
// The fold itself — nativeID/backgroundColor/style forwarding, passthrough merge, "no structural
// children" — is framework-agnostic and unit-tested in core. What this file proves is that the
// fold reaches a real Fabric node from the TAG path, and that React nests user children under it.
//
// There is no component any more: the wrapper was deleted once `registerInputAccessoryViewBehavior`
// put its body on the tag. The suite passes unchanged apart from the spelling.

import { type ReactElement } from 'react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { Text, View, mount, unmount } from '@symbiote-native/react';
import { installFabric, type IFakeNode } from '@symbiote-native/test-utils';

const NATIVE_ID = 'accessory-1';
const BACKGROUND_COLOR = '#eee';
const ROOT_TAG = 230;

function App(): ReactElement {
  return (
    <View>
      <text-input inputAccessoryViewID={NATIVE_ID} />
      <input-accessory-view
        nativeID={NATIVE_ID}
        backgroundColor={BACKGROUND_COLOR}
        style={{ flex: 1 }}
      >
        <Text>Done</Text>
      </input-accessory-view>
    </View>
  );
}

const fabric = installFabric();
beforeEach(() => fabric.reset());
afterEach(() => unmount(ROOT_TAG));

function accessoryNode(): IFakeNode {
  const node = fabric.find(n => n.viewName === 'RCTInputAccessoryView');
  expect(node, 'an RCTInputAccessoryView was created').toBeDefined();
  return node!;
}

describe('InputAccessoryView', () => {
  describe('Positive — mounts through the real tag -> behavior -> Fabric path', () => {
    // why: the fold is proven at the unit level in core; this proves the tag path does not drop
    // or mistranslate any of it on the way to a real Fabric node, and that the engine flattens
    // the style prop the same way through this mount.
    it('mounts a real RCTInputAccessoryView carrying nativeID, backgroundColor, and flattened style', () => {
      mount(ROOT_TAG, <App />);
      const accessory = accessoryNode();
      expect(accessory.props.nativeID).toBe(NATIVE_ID);
      expect(accessory.props.backgroundColor).toBe(BACKGROUND_COLOR);
      expect(accessory.props.flex).toBe(1);
    });

    // why: the fold builds no structural children of its own, so the caller's <Text> must be the
    // host's only child — losing it, or nesting it a level down, is the failure this pins.
    it('nests the caller-supplied ReactNode children directly under the host', () => {
      mount(ROOT_TAG, <App />);
      const accessory = accessoryNode();
      expect(accessory.children).toHaveLength(1);
      expect(accessory.children[0].viewName).toBe('RCTText');
    });

    // why: an InputAccessoryView docks to a TextInput purely by a shared string id (RN
    // convention, no runtime linking code) — nativeID here must equal inputAccessoryViewID
    // there. This proves neither primitive's own prop-routing mutates or drops that id
    // somewhere along its own path when both are mounted together.
    it('keeps the nativeID <-> inputAccessoryViewID docking pair intact across both', () => {
      mount(ROOT_TAG, <App />);
      const input = fabric.find(
        n => n.viewName === 'RCTSinglelineTextInputView',
      );
      expect(input, 'a TextInput was created').toBeDefined();
      expect(input!.props.inputAccessoryViewID).toBe(
        accessoryNode().props.nativeID,
      );
    });
  });
});
