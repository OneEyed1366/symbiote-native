// Co-located React-driven test.
//
// renderInputAccessoryView() itself — nativeID/backgroundColor/style forwarding, passthrough
// merge, "no structural children" — is framework-agnostic and already unit-tested in
// core/components/src/__tests__/wave1-core.test.ts (`describe('renderInputAccessoryView')`).
// This file stays on the React-specific half of the <components_split_logic_view_lifecycle>
// split: does the Descriptor->createElement bridge actually carry those props onto a real
// Fabric node through a real mount, and does React nest user children the way the core render
// fn assumes it will.
//
// No Negative group: InputAccessoryView (adapters/react/.../input-accessory-view/index.ts) is
// a plain prop-forwarding FC with no guard clause and no branch that throws — there is no
// contract-accurate throwing scenario to assert.

import { type ReactElement } from 'react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { InputAccessoryView, Text, TextInput, View, mount, unmount } from '@symbiote-native/react';
import { installFabric, type IFakeNode } from '@symbiote-native/test-utils';

const NATIVE_ID = 'accessory-1';
const BACKGROUND_COLOR = '#eee';
const ROOT_TAG = 230;

function App(): ReactElement {
  return (
    <View>
      <TextInput inputAccessoryViewID={NATIVE_ID} />
      <InputAccessoryView
        nativeID={NATIVE_ID}
        backgroundColor={BACKGROUND_COLOR}
        style={{ flex: 1 }}
      >
        <Text>Done</Text>
      </InputAccessoryView>
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
  describe('Positive — mounts through the real Descriptor->React->Fabric bridge', () => {
    // why: renderInputAccessoryView() forwarding nativeID/backgroundColor/style is proven at
    // the unit level in core; this proves the React FC's createElement(host.type, host.props)
    // bridge (input-accessory-view/index.ts) doesn't drop or mistranslate any of them on the
    // way to a real Fabric node, and that the engine flattens the style prop the same way
    // through this component's own mount path.
    it('mounts a real RCTInputAccessoryView carrying nativeID, backgroundColor, and flattened style', () => {
      mount(ROOT_TAG, <App />);
      const accessory = accessoryNode();
      expect(accessory.props.nativeID).toBe(NATIVE_ID);
      expect(accessory.props.backgroundColor).toBe(BACKGROUND_COLOR);
      expect(accessory.props.flex).toBe(1);
    });

    // why: core's renderInputAccessoryView() deliberately returns zero structural children
    // ("the adapter adds user children" — render-input-accessory-view.ts comment). This test
    // proves the React half of that split contract actually holds: createElement(host.type,
    // host.props, children) nests the caller's <Text> under the host instead of losing it.
    it('nests the caller-supplied ReactNode children directly under the host', () => {
      mount(ROOT_TAG, <App />);
      const accessory = accessoryNode();
      expect(accessory.children).toHaveLength(1);
      expect(accessory.children[0].viewName).toBe('RCTText');
    });

    // why: an InputAccessoryView docks to a TextInput purely by a shared string id (RN
    // convention, no runtime linking code) — nativeID here must equal inputAccessoryViewID
    // there. This proves neither component's own prop-routing mutates or drops that id
    // somewhere along its own path when both are mounted together.
    it('keeps the nativeID <-> inputAccessoryViewID docking pair intact across both components', () => {
      mount(ROOT_TAG, <App />);
      const input = fabric.find(n => n.viewName === 'RCTSinglelineTextInputView');
      expect(input, 'a TextInput was created').toBeDefined();
      expect(input!.props.inputAccessoryViewID).toBe(accessoryNode().props.nativeID);
    });
  });
});
