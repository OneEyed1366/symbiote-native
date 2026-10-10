// `TextInput.js:736-743`: строка внутри `<text-input>` это его содержимое, а не ошибка
import { defineComponent, h } from '@vue/runtime-core';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { installRecordingFabric } from '@symbiote-native/test-utils';
import { mount, unmount } from '../../index';

const ROOT_TAG = 7_303;
const fabric = installRecordingFabric();

const flush = (): Promise<void> =>
  new Promise(resolve => setTimeout(resolve, 0));

beforeEach(() => {
  fabric.reset();
});

afterEach(() => {
  unmount(ROOT_TAG);
});

describe('Vue <text-input> text children', () => {
  it('takes a string child as its content', async () => {
    mount(
      ROOT_TAG,
      defineComponent({
        setup: () => () => h('text-input', null, 'hello World!'),
      }),
    );
    await flush();

    const input = fabric.find(one => one.viewName.includes('TextInput'));
    expect(input?.children.map(child => child.viewName)).toEqual([
      'RCTRawText',
    ]);
  });
});
