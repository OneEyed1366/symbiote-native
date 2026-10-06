// Нативный `change` должен дойти до `@valueChange` и записать текст обратно в `value` ноды
import { defineComponent, h, ref } from '@vue/runtime-core';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { listenerFor } from '@symbiote-native/engine';
import type { ISymbioteEvent } from '@symbiote-native/engine';
import { installRecordingFabric } from '@symbiote-native/test-utils';
import { mount, unmount } from '../../index';

const ROOT_TAG = 7_302;
const fabric = installRecordingFabric();

const flush = (): Promise<void> =>
  new Promise(resolve => setTimeout(resolve, 0));

beforeEach(() => {
  fabric.reset();
});

afterEach(() => {
  unmount(ROOT_TAG);
});

function changeEvent(
  target: ISymbioteEvent['target'],
  text: string,
): ISymbioteEvent {
  return {
    type: 'topChange',
    target,
    currentTarget: target,
    nativeEvent: { text, eventCount: 1 },
    stopPropagation: () => {},
  };
}

describe('Vue <text-input> host tag', () => {
  describe('Positive', () => {
    // Введённый текст попадает в состояние приложения и возвращается в `value` ноды
    it('hands the typed text to @valueChange and writes it back', async () => {
      const inputText = ref('');
      mount(
        ROOT_TAG,
        defineComponent({
          setup: () => () =>
            h('text-input', {
              value: inputText.value,
              onValueChange: (event: { text: string }) => {
                inputText.value = event.text;
              },
            }),
        }),
      );
      await flush();
      const node = fabric.find(one => one.viewName.includes('TextInput'));
      if (node === undefined)
        throw new Error('no TextInput node was committed');
      const listener = listenerFor(node.handle, 'change');
      if (listener === undefined)
        throw new Error('the behavior installed no change listener');

      listener(changeEvent(node.handle, 'a'));
      await flush();

      expect(inputText.value).toBe('a');
    });
  });
});
