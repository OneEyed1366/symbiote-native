// `input-accessory-view` as a TAG, measured through Vue's own renderer. The fold itself
// (nativeID/backgroundColor/style forwarding, passthrough merge, no structural children of its
// own) is framework-agnostic and unit-tested in core
// (`core/components/src/behaviors/input-accessory-view.test.ts`); this file proves the VUE
// WIRING: a compiled `h('input-accessory-view', …)` element reaches a real Fabric node, Vue
// nests its own children under it, and the nativeID <-> inputAccessoryViewID docking pair
// (a shared-string-id RN convention, no runtime linking code) survives Vue's own prop routing —
// the same bridge-smoke shape React's and Solid's InputAccessoryView suites already carry
// (`.docs/test-cases/rn-parity.test-cases.md`).
//
// No Negative group: every prop is optional and every path resolves to some descriptor —
// nothing here rejects an input (React's and Solid's twins reach the same conclusion).
import { defineComponent, h } from '@vue/runtime-core';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mount, unmount } from '@symbiote-native/vue';
import { installFabric, type IFakeNode } from '@symbiote-native/test-utils';

const ROOT_TAG = 9_991;
const ACCESSORY_VIEW = 'RCTInputAccessoryView';
const NATIVE_ID = 'accessory-1';
const BACKGROUND_COLOR = '#eeeeee';
const fabric = installFabric();

const settle = async (): Promise<void> => {
  await new Promise(resolve => setTimeout(resolve, 0));
  await new Promise(resolve => setTimeout(resolve, 0));
};

function accessoryNode(): IFakeNode {
  const node = fabric.find(n => n.viewName === ACCESSORY_VIEW);
  if (node === undefined) throw new Error(`no ${ACCESSORY_VIEW} was created`);
  return node;
}

beforeEach(() => fabric.reset());
afterEach(() => unmount(ROOT_TAG));

describe('Vue: `input-accessory-view` as a tag', () => {
  it('mounts a real RCTInputAccessoryView carrying nativeID, backgroundColor, and flattened style', async () => {
    mount(
      ROOT_TAG,
      defineComponent({
        setup: () => () =>
          h('input-accessory-view', {
            nativeID: NATIVE_ID,
            backgroundColor: BACKGROUND_COLOR,
            style: { flex: 1 },
          }),
      }),
    );
    await settle();

    const props = accessoryNode().props;
    expect(props.nativeID).toBe(NATIVE_ID);
    expect(props.backgroundColor).toBe(BACKGROUND_COLOR);
    expect(props.flex).toBe(1);
  });

  it('nests Vue-rendered children directly under the host', async () => {
    mount(
      ROOT_TAG,
      defineComponent({
        setup: () => () =>
          h('input-accessory-view', { nativeID: NATIVE_ID }, [
            h('text', {}, 'Done'),
          ]),
      }),
    );
    await settle();

    const children = accessoryNode().children;
    expect(children).toHaveLength(1);
    expect(children[0].viewName).toBe('RCTText');
  });

  it('keeps the nativeID <-> inputAccessoryViewID docking pair intact across both', async () => {
    mount(
      ROOT_TAG,
      defineComponent({
        setup: () => () =>
          h('view', {}, [
            h('text-input', { inputAccessoryViewID: NATIVE_ID }),
            h('input-accessory-view', { nativeID: NATIVE_ID }),
          ]),
      }),
    );
    await settle();

    const input = fabric.find(n => n.viewName === 'RCTSinglelineTextInputView');
    expect(input, 'a TextInput was created').toBeDefined();
    expect(input!.props.inputAccessoryViewID).toBe(
      accessoryNode().props.nativeID,
    );
  });
});
