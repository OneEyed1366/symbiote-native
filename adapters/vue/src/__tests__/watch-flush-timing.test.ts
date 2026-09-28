// Ground-truth check: watchPostEffect must see the committed tree already updated;
// watchSyncEffect must fire before Vue's own batched render, not lumped in with it.

import {
  defineComponent,
  h,
  ref,
  watchPostEffect,
  watchSyncEffect,
  type VNode,
} from '@vue/runtime-core';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mount, unmount } from '@symbiote-native/vue';
import {
  createLiveTree,
  installRecordingFabric,
} from '@symbiote-native/test-utils';

const ROOT_TAG = 726;
const fabric = installRecordingFabric();
const live = createLiveTree(fabric);
const tick = (): Promise<void> =>
  new Promise(resolve => setTimeout(resolve, 0));

beforeEach(() => fabric.reset());
afterEach(() => unmount(ROOT_TAG));

describe('watchPostEffect', () => {
  it('sees the committed text already reflecting the new value', async () => {
    const count = ref(0);
    const seenAtCallback: string[] = [];
    const App = defineComponent({
      setup() {
        watchPostEffect(() => {
          void count.value;
          seenAtCallback.push(...live.texts(live.appRoot()));
        });
        return () => h('text', null, String(count.value));
      },
    });
    mount(ROOT_TAG, App);
    await tick();
    count.value = 1;
    await tick();
    expect(seenAtCallback.at(-1)).toBe('1');
  });
});

describe('watchSyncEffect', () => {
  it('fires immediately on the change, before the batched render flushes', () => {
    const count = ref(0);
    const order: string[] = [];
    const App = defineComponent({
      setup() {
        watchSyncEffect(() => {
          order.push(`watch:${count.value}`);
        });
        return (): VNode => h('text', null, String(count.value));
      },
    });
    mount(ROOT_TAG, App);
    order.length = 0;
    count.value = 1;
    // Synchronous, no await: watchSyncEffect must already have fired here.
    expect(order).toEqual(['watch:1']);
  });
});
