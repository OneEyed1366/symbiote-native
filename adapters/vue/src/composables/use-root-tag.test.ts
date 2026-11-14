// The tag of the surface a component is rendered into, the Vue twin of RN's `RootTagContext`
import { defineComponent, h, type VNode } from '@vue/runtime-core';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mount, unmount, useRootTag } from '@symbiote-native/vue';
import { installRecordingFabric } from '@symbiote-native/test-utils';

const FIRST_TAG = 90_430;
const SECOND_TAG = 90_431;
const fabric = installRecordingFabric();
const tick = (): Promise<void> =>
  new Promise(resolve => setTimeout(resolve, 0));

function readTagInto(sink: number[]) {
  return defineComponent(() => {
    sink.push(useRootTag());
    return (): VNode => h('text', 'probe');
  });
}

beforeEach(() => fabric.reset());
afterEach(() => {
  unmount(FIRST_TAG);
  unmount(SECOND_TAG);
});

describe('useRootTag', () => {
  it('carries the tag a component is mounted under', async () => {
    const seen: number[] = [];
    mount(FIRST_TAG, { render: (): VNode => h(readTagInto(seen)) });
    await tick();

    expect(seen).toEqual([FIRST_TAG]);
  });

  it('keeps two surfaces apart', async () => {
    const first: number[] = [];
    const second: number[] = [];
    mount(FIRST_TAG, { render: (): VNode => h(readTagInto(first)) });
    mount(SECOND_TAG, { render: (): VNode => h(readTagInto(second)) });
    await tick();

    expect([first, second]).toEqual([[FIRST_TAG], [SECOND_TAG]]);
  });

  it('refuses a call outside a mounted surface', () => {
    expect(() => useRootTag()).toThrow('useRootTag');
  });
});
