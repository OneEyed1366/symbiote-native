// Vue пишет состояние на микротаске, а откат `Switch` читает ноду на следующей
import { defineComponent, h, nextTick, ref } from '@vue/runtime-core';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { listenerFor } from '@symbiote-native/engine';
import type { ISymbioteEvent } from '@symbiote-native/engine';
import { installRecordingFabric } from '@symbiote-native/test-utils';
import { mount, unmount } from '../../index';

const ROOT_TAG = 7_301;
const fabric = installRecordingFabric();

beforeEach(() => {
  fabric.reset();
});

afterEach(() => {
  unmount(ROOT_TAG);
});

function changeEvent(
  target: ISymbioteEvent['target'],
  value: boolean,
): ISymbioteEvent {
  return {
    type: 'topChange',
    target,
    currentTarget: target,
    nativeEvent: { value, eventCount: 1 },
    stopPropagation: () => {},
  };
}

describe('Vue <switch> host tag', () => {
  describe('Positive', () => {
    // Приложение приняло переключение в своём состоянии, нативный switch не откатывается
    it('keeps a toggle the app state accepted', async () => {
      const isOn = ref(false);
      mount(
        ROOT_TAG,
        defineComponent({
          setup: () => () =>
            h('switch', {
              value: isOn.value,
              onValueChange: (event: { value: boolean }) => {
                isOn.value = event.value;
              },
            }),
        }),
      );
      await nextTick();
      const node = fabric.find(one => one.viewName === 'Switch');
      if (node === undefined) throw new Error('no Switch node was committed');
      const listener = listenerFor(node.handle, 'change');
      if (listener === undefined)
        throw new Error('the behavior installed no change listener');

      listener(changeEvent(node.handle, true));
      await nextTick();
      await Promise.resolve();

      expect(isOn.value).toBe(true);
      expect(
        fabric.commands.filter(entry => entry.commandName === 'setValue'),
      ).toHaveLength(0);
    });

    // Компилятор шаблона на нативном теге превращает `@valueChange` в ключ `on:valueChange`
    it('calls a handler the template compiler keyed as on:valueChange', async () => {
      const isOn = ref(false);
      mount(
        ROOT_TAG,
        defineComponent({
          setup: () => () =>
            h('switch', {
              value: isOn.value,
              'on:valueChange': (event: { value: boolean }) => {
                isOn.value = event.value;
              },
            }),
        }),
      );
      await nextTick();
      const node = fabric.find(one => one.viewName === 'Switch');
      if (node === undefined) throw new Error('no Switch node was committed');
      const listener = listenerFor(node.handle, 'change');
      if (listener === undefined)
        throw new Error('the behavior installed no change listener');

      listener(changeEvent(node.handle, true));

      expect(isOn.value).toBe(true);
    });
  });
});
