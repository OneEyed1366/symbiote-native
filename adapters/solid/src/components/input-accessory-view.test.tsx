// Solid twin of adapters/react/src/components/input-accessory-view/input-accessory-view.test.tsx.
// Drives REAL compiled Solid JSX through the universal renderer into the fake Fabric slot.
//
// THE SUBJECT IS THE BARE TAG. There is no InputAccessoryView component any more — an app writes
// `<input-accessory-view>` and the nativeID/backgroundColor/style mapping runs in the tag's own
// behavior, so what this file proves is that the tag reaches it, keeps its host identity across an
// update, and hosts a live Solid subtree.
//
// Every assertion reads fabric.committed, never fabric.find: the creation log records a node's
// props at FIRST commit and never reflects a later clone, so a component frozen at mount would
// look correct there (symbiote-engine-core §8).
//
// No Negative group: InputAccessoryView has no guard clause and no branch that throws — every
// prop is optional and forwarded.

import { createSignal } from 'solid-js';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  createLiveTree,
  installRecordingFabric,
  seedWindowDimensions,
  type ILiveNode,
} from '@symbiote-native/test-utils';
// SIDE-EFFECT IMPORT: the nativeID/backgroundColor/style mapping lives in the tag's behavior, and
// only this module installs it. An app reaches it through the package barrel; a test does not.
import '../register';
import { mount, unmount } from '../render';
// SIDE-EFFECT IMPORT, and the suite is worthless without it: `input-accessory-view` gets its
// nativeID / backgroundColor / style mapping from a host behavior, and only `register` installs it.

const ROOT_TAG = 831;
const ACCESSORY_VIEW = 'RCTInputAccessoryView';
const NATIVE_ID = 'accessory-1';
const BACKGROUND_COLOR = '#eeeeee';
const ACCESSORY_STYLE = { flex: 1 };

const fabric = installRecordingFabric();
const live = createLiveTree(fabric);
const tick = (): Promise<void> =>
  new Promise(resolve => setTimeout(resolve, 0));

beforeEach(() => {
  fabric.reset();
  seedWindowDimensions();
});
afterEach(() => unmount(ROOT_TAG));

function committed(predicate: (node: ILiveNode) => boolean): ILiveNode {
  const found = live.findLive(live.appRoot(), predicate);
  if (found === undefined) throw new Error('no committed node matched');
  return found;
}

function accessory(): ILiveNode {
  return committed(node => node.viewName === ACCESSORY_VIEW);
}

describe('Solid InputAccessoryView on the engine', () => {
  describe('Positive', () => {
    // A wrong view name resolves no component and the toolbar never appears
    it('commits a real RCTInputAccessoryView carrying nativeID, backgroundColor and a flattened style', async () => {
      mount(ROOT_TAG, () => (
        <input-accessory-view
          nativeID={NATIVE_ID}
          backgroundColor={BACKGROUND_COLOR}
          style={ACCESSORY_STYLE}
        />
      ));
      await tick();

      const props = accessory().payload;
      expect(props.nativeID).toBe(NATIVE_ID);
      expect(props.backgroundColor).toBe(BACKGROUND_COLOR);
      expect(props.flex).toBe(1);
    });

    // RN renders the children inside a SafeAreaView that fills the accessory
    it('nests the caller-supplied children in a safe area view', async () => {
      mount(ROOT_TAG, () => (
        <input-accessory-view nativeID={NATIVE_ID}>
          <text>Done</text>
        </input-accessory-view>
      ));
      await tick();

      const children = accessory().children;
      expect(children).toHaveLength(1);
      expect(children[0].viewName).toBe('SafeAreaView');
      expect(children[0].children[0].viewName).toBe('RCTText');
    });

    // The accessory docks to a text input only by the shared id, so neither side may rewrite it
    it('keeps the nativeID <-> inputAccessoryViewID docking pair intact', async () => {
      mount(ROOT_TAG, () => (
        <view>
          <text-input inputAccessoryViewID={NATIVE_ID} />
          <input-accessory-view nativeID={NATIVE_ID} />
        </view>
      ));
      await tick();

      const input = committed(
        node => node.viewName === 'RCTSinglelineTextInputView',
      );
      expect(input.payload.inputAccessoryViewID).toBe(
        accessory().payload.nativeID,
      );
    });

    // Native reads only `accessibility*`, the engine folds the aliases from their hyphenated names
    // (fold cases in `core/engine/cpp/tests/js/aria-payload.itest.ts`)
    it('forwards the aria aliases under their authored names', async () => {
      mount(ROOT_TAG, () => (
        <input-accessory-view aria-label="toolbar" aria-busy={true} />
      ));
      await tick();

      const props = accessory().payload;
      expect(props['aria-label']).toBe('toolbar');
      expect(props['aria-busy']).toBe(true);
    });

    // A body runs once, so a destructured prop would freeze at its mount value
    it('re-commits the same host node when backgroundColor changes after mount', async () => {
      const [color, setColor] = createSignal(BACKGROUND_COLOR);
      mount(ROOT_TAG, () => (
        <input-accessory-view nativeID={NATIVE_ID} backgroundColor={color()} />
      ));
      await tick();
      // Node IDENTITY rather than a creation count: a rebuild that netted out even would satisfy
      // a count, and the identity moving is what the case is about.
      const hostAtMount = accessory().handle;
      expect(accessory().payload.backgroundColor).toBe(BACKGROUND_COLOR);

      setColor('#ff0000');
      await tick();

      expect(accessory().payload.backgroundColor).toBe('#ff0000');
      expect(accessory().handle, 'the host node kept its identity').toBe(
        hostAtMount,
      );
    });

    // `spread` has no removal pass, so a cleared key would keep painting the old colour
    it('clears backgroundColor on the host when the prop goes undefined', async () => {
      const [color, setColor] = createSignal<string | undefined>(
        BACKGROUND_COLOR,
      );
      mount(ROOT_TAG, () => (
        <input-accessory-view nativeID={NATIVE_ID} backgroundColor={color()} />
      ));
      await tick();
      expect(accessory().payload.backgroundColor).toBe(BACKGROUND_COLOR);

      setColor(undefined);
      await tick();

      // Absent rather than null, the op stream deletes the key with `NO_VALUE`
      expect(Object.hasOwn(accessory().payload, 'backgroundColor')).toBe(false);
      // The record held the colour after the mount, so its absence means a clearing op was sent
      const recorded = fabric.find(node => node.viewName === ACCESSORY_VIEW);
      expect(Object.hasOwn(recorded?.props ?? {}, 'backgroundColor')).toBe(
        false,
      );
    });
  });
});
