// Solid twin of adapters/react/src/components/input-accessory-view/input-accessory-view.test.tsx.
// Drives REAL compiled Solid JSX through the universal renderer into the fake Fabric slot.
//
// Coverage scope: the SOLID-SIDE half per <components_split_logic_view_lifecycle>.
// renderInputAccessoryView itself (nativeID/backgroundColor/style forwarding, the passthrough
// merge, "no structural children") is framework-agnostic and unit-tested in
// core/components/src/__tests__/wave1-core.test.ts; what is Solid's own is the literal-tag bridge,
// the aria fold, the live children, and the two things no other adapter can break — a prop read
// frozen at mount, and a key that vanishes from the bag between runs.
//
// Every assertion reads fabric.committed, never fabric.find: the creation log records a node's
// props at FIRST commit and never reflects a later clone, so a component frozen at mount would
// look correct there (symbiote-engine-core §8).
//
// No Negative group: InputAccessoryView has no guard clause and no branch that throws — every
// prop is optional and forwarded.

import { createSignal } from 'solid-js';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { installFabric, type IFakeNode } from '@symbiote-native/test-utils';
import { mount, unmount } from '../render';
import { Text } from './text';
import { TextInput } from './text-input';
import { View } from './view';
import { InputAccessoryView } from './input-accessory-view';

const ROOT_TAG = 831;
const ACCESSORY_VIEW = 'RCTInputAccessoryView';
const NATIVE_ID = 'accessory-1';
const BACKGROUND_COLOR = '#eeeeee';

const fabric = installFabric();
const tick = (): Promise<void> =>
  new Promise(resolve => setTimeout(resolve, 0));

beforeEach(() => fabric.reset());
afterEach(() => unmount(ROOT_TAG));

function committed(predicate: (node: IFakeNode) => boolean): IFakeNode {
  let found: IFakeNode | undefined;
  const walk = (nodes: IFakeNode[]): void => {
    for (const node of nodes) {
      if (found === undefined && predicate(node)) found = node;
      walk(node.children);
    }
  };
  walk(fabric.committed);
  if (found === undefined) throw new Error('no committed node matched');
  return found;
}

function accessory(): IFakeNode {
  return committed(node => node.viewName === ACCESSORY_VIEW);
}

describe('Solid InputAccessoryView on the engine', () => {
  describe('Positive', () => {
    // why: the docking view is a REAL Fabric host (RCTInputAccessoryView), not a JS wrapper — a
    // wrong view name resolves no component and the toolbar never appears. nativeID and
    // backgroundColor are emitted conditionally by the shared render fn, and `style` has to reach
    // the host flattened, which is the engine's job on the way through.
    it('commits a real RCTInputAccessoryView carrying nativeID, backgroundColor and a flattened style', async () => {
      mount(ROOT_TAG, () => (
        <InputAccessoryView
          nativeID={NATIVE_ID}
          backgroundColor={BACKGROUND_COLOR}
          style={{ flex: 1 }}
        />
      ));
      await tick();

      const props = accessory().props;
      expect(props.nativeID).toBe(NATIVE_ID);
      expect(props.backgroundColor).toBe(BACKGROUND_COLOR);
      expect(props.flex).toBe(1);
    });

    // why: renderInputAccessoryView deliberately returns ZERO structural children — "the adapter
    // adds the user children". This proves Solid's half of that split contract actually holds:
    // the literal tag hosts the live subtree instead of dropping it.
    it('nests the caller-supplied children directly under the host', async () => {
      mount(ROOT_TAG, () => (
        <InputAccessoryView nativeID={NATIVE_ID}>
          <Text>Done</Text>
        </InputAccessoryView>
      ));
      await tick();

      const children = accessory().children;
      expect(children).toHaveLength(1);
      expect(children[0].viewName).toBe('RCTText');
    });

    // why: an accessory docks to a TextInput purely by a shared string id (RN convention, no
    // runtime linking code) — nativeID here must equal inputAccessoryViewID there. Proves neither
    // component's own prop routing mutates or drops that id when both are mounted together.
    it('keeps the nativeID <-> inputAccessoryViewID docking pair intact', async () => {
      mount(ROOT_TAG, () => (
        <View>
          <TextInput inputAccessoryViewID={NATIVE_ID} />
          <InputAccessoryView nativeID={NATIVE_ID} />
        </View>
      ));
      await tick();

      const input = committed(
        node => node.viewName === 'RCTSinglelineTextInputView',
      );
      expect(input.props.inputAccessoryViewID).toBe(accessory().props.nativeID);
    });

    // why: native reads only `accessibility*`. This component owns its host element rather than
    // rendering through a View, so nothing else in the path folds the web aliases — dropping the
    // fold would send `aria-label` to Fabric as a meaningless prop and leave the toolbar
    // unlabelled for a screen reader.
    it('folds aria aliases into the canonical accessibility props', async () => {
      mount(ROOT_TAG, () => (
        <InputAccessoryView aria-label="toolbar" aria-busy={true} />
      ));
      await tick();

      const props = accessory().props;
      expect(props.accessibilityLabel).toBe('toolbar');
      expect(props.accessibilityState).toEqual({ busy: true });
    });

    // why: Solid runs a component body ONCE. Every prop read sits inside the bag accessor
    // precisely so a later change still reaches the host; a single destructure in the component
    // would freeze the toolbar at its mount-time props while every other test here passed. The
    // node-identity assertion is the other half — rebuilding the host would also show the new
    // value, while destroying the identity native state keys on.
    it('re-commits the same host node when backgroundColor changes after mount', async () => {
      const [color, setColor] = createSignal(BACKGROUND_COLOR);
      mount(ROOT_TAG, () => (
        <InputAccessoryView nativeID={NATIVE_ID} backgroundColor={color()} />
      ));
      await tick();
      const createdAtMount = fabric.counts.createNode;
      expect(accessory().props.backgroundColor).toBe(BACKGROUND_COLOR);

      setColor('#ff0000');
      await tick();

      expect(accessory().props.backgroundColor).toBe('#ff0000');
      expect(fabric.counts.createNode, 'the host node kept its identity').toBe(
        createdAtMount,
      );
    });

    // why: renderInputAccessoryView emits `backgroundColor` CONDITIONALLY, so the key VANISHES
    // from the bag the moment a caller clears it. Solid's `spread` walks only the current key set
    // and has no removal pass, so without withStableKeys the native view keeps painting the old
    // colour forever (.claude/rules/solid-descriptor-bridge.md §1). Reading the COMMITTED tree is
    // what makes this observable at all.
    it('clears backgroundColor on the host when the prop goes undefined', async () => {
      const [color, setColor] = createSignal<string | undefined>(
        BACKGROUND_COLOR,
      );
      mount(ROOT_TAG, () => (
        <InputAccessoryView nativeID={NATIVE_ID} backgroundColor={color()} />
      ));
      await tick();
      expect(accessory().props.backgroundColor).toBe(BACKGROUND_COLOR);

      setColor(undefined);
      await tick();

      // The engine's diffProps sends a removed key down as literal null, not absence
      // (symbiote-engine-core §8) — so `null` here IS the cleared state Fabric acts on.
      expect(accessory().props.backgroundColor).toBeNull();
    });
  });
});
