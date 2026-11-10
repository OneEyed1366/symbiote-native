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
import { mount, unmount } from '@symbiote-native/react';
import {
  createLiveTree,
  installRecordingFabric,
  seedWindowDimensions,
  type ILiveNode,
} from '@symbiote-native/test-utils';

const NATIVE_ID = 'accessory-1';
const BACKGROUND_COLOR = '#eee';
const ROOT_TAG = 230;
const ACCESSORY_STYLE = { flex: 1 };

function App(): ReactElement {
  return (
    <view>
      <text-input inputAccessoryViewID={NATIVE_ID} />
      <input-accessory-view
        nativeID={NATIVE_ID}
        backgroundColor={BACKGROUND_COLOR}
        style={ACCESSORY_STYLE}
      >
        <text>Done</text>
      </input-accessory-view>
    </view>
  );
}

const fabric = installRecordingFabric();
const live = createLiveTree(fabric);
beforeEach(() => {
  fabric.reset();
  seedWindowDimensions();
});
afterEach(() => unmount(ROOT_TAG));

function accessoryNode(): ILiveNode {
  const node = live.findLive(
    live.appRoot(),
    n => n.viewName === 'RCTInputAccessoryView',
  );
  expect(node, 'an RCTInputAccessoryView was created').toBeDefined();
  return node!;
}

describe('InputAccessoryView', () => {
  describe('Positive — mounts through the real tag -> behavior -> Fabric path', () => {
    // The fold is proven in core, this proves the tag path hands all of it to a real Fabric node
    it('mounts a real RCTInputAccessoryView carrying nativeID, backgroundColor, and flattened style', () => {
      mount(ROOT_TAG, <App />);
      const accessory = accessoryNode();
      expect(accessory.payload.nativeID).toBe(NATIVE_ID);
      expect(accessory.payload.backgroundColor).toBe(BACKGROUND_COLOR);
      expect(accessory.payload.flex).toBe(1);
    });

    // RN renders the children inside a SafeAreaView that fills the accessory
    it('nests the caller-supplied ReactNode children in a safe area view', () => {
      mount(ROOT_TAG, <App />);
      const accessory = accessoryNode();
      expect(accessory.children).toHaveLength(1);
      expect(accessory.children[0].viewName).toBe('SafeAreaView');
      expect(accessory.children[0].children[0].viewName).toBe('RCTText');
    });

    // The accessory docks to a text input only by the shared id, so neither side may rewrite it
    it('keeps the nativeID <-> inputAccessoryViewID docking pair intact across both', () => {
      mount(ROOT_TAG, <App />);
      const input = live.findLive(
        live.appRoot(),
        n => n.viewName === 'RCTSinglelineTextInputView',
      );
      expect(input, 'a TextInput was created').toBeDefined();
      expect(input!.payload.inputAccessoryViewID).toBe(
        accessoryNode().payload.nativeID,
      );
    });
  });
});
