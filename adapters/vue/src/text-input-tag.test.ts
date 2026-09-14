// `text-input` as a TAG, measured through Vue's own renderer. The controlled value/text fold and
// the imperative ref surface (focus/blur/clear/isFocused) live on the engine node
// (`core/components/src/behaviors/text-input.ts`) and are fully unit-tested there; this file
// proves the VUE WIRING: a compiled `h('text-input', …)` element reaches the tag, its `value` folds
// to the native `text` prop and its native `change` event reaches `onValueChange`, and a ref-held
// host instance drives focus/blur/clear/isFocused through `buildTextInputHandle` — the same
// bridge-smoke shape React's and Solid's TextInput suites already carry
// (`.docs/test-cases/rn-parity.test-cases.md`).
//
// No Negative group: nothing here throws.
import { defineComponent, h, shallowRef } from '@vue/runtime-core';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { isSymbioteNode, type ISymbioteEvent } from '@symbiote-native/engine';
import { mount, unmount } from '@symbiote-native/vue';
import { installFabric, type IFakeNode } from '@symbiote-native/test-utils';
import { buildTextInputHandle } from '@symbiote-native/components';
import type { IHostInstance } from './host-instance';

const ROOT_TAG = 9_990;
const SINGLELINE_VIEW = 'RCTSinglelineTextInputView';
const fabric = installFabric();

const settle = async (): Promise<void> => {
  await new Promise(resolve => setTimeout(resolve, 0));
  await new Promise(resolve => setTimeout(resolve, 0));
};

function inputNode(): IFakeNode {
  const node = fabric.find(n => n.viewName === SINGLELINE_VIEW);
  if (node === undefined) throw new Error(`no ${SINGLELINE_VIEW} was created`);
  return node;
}

function isHostInstance(el: unknown): el is IHostInstance {
  return isSymbioteNode(el);
}

async function mountInputRef(): Promise<IHostInstance> {
  const nodeRef = shallowRef<IHostInstance | null>(null);
  mount(
    ROOT_TAG,
    defineComponent({
      setup: () => () =>
        h('text-input', {
          value: 'hello',
          ref: (el: unknown) => {
            nodeRef.value = isHostInstance(el) ? el : null;
          },
        }),
    }),
  );
  await settle();
  const node = nodeRef.value;
  if (node === null) throw new Error('ref never resolved to a host instance');
  return node;
}

beforeEach(() => fabric.reset());
afterEach(() => unmount(ROOT_TAG));

describe('Vue: `text-input` as a tag', () => {
  it('folds value into the native text prop and derives onValueChange', async () => {
    let changedText: string | undefined;
    mount(
      ROOT_TAG,
      defineComponent({
        setup: () => () =>
          h('text-input', {
            value: 'hi',
            onValueChange: (event: ISymbioteEvent & { text: string }) => {
              changedText = event.text;
            },
          }),
      }),
    );
    await settle();

    expect(inputNode().props.text).toBe('hi');

    fabric.fireEvent(inputNode().instanceHandle, 'topChange', {
      text: 'hix',
      eventCount: 1,
      selection: { start: 3, end: 3 },
    });
    await settle();
    expect(changedText).toBe('hix');
  });

  it('drives focus/blur/clear through a ref-held host instance', async () => {
    const handle = buildTextInputHandle(await mountInputRef());

    handle.focus();
    expect(fabric.commands.some(c => c.commandName === 'focus')).toBe(true);

    fabric.commands.length = 0;
    handle.blur();
    expect(fabric.commands.some(c => c.commandName === 'blur')).toBe(true);

    fabric.commands.length = 0;
    handle.clear();
    const setText = fabric.commands.find(
      c => c.commandName === 'setTextAndSelection',
    );
    expect(
      setText,
      'a setTextAndSelection command was dispatched',
    ).toBeDefined();
    expect(setText!.args[1]).toBe('');
  });

  it('tracks isFocused() from real topFocus/topBlur events', async () => {
    const handle = buildTextInputHandle(await mountInputRef());

    expect(handle.isFocused()).toBe(false);
    fabric.fireEvent(inputNode().instanceHandle, 'topFocus', {});
    expect(handle.isFocused()).toBe(true);
    fabric.fireEvent(inputNode().instanceHandle, 'topBlur', {});
    expect(handle.isFocused()).toBe(false);
  });
});
