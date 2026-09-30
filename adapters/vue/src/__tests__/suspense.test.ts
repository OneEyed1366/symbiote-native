// Ground-truth check: Vue's docs claim Suspense needs no host-config hooks, works over
// ordinary node ops. Verify against this engine's nodeOps rather than trust it unread.

import { defineComponent, h, Suspense, type VNode } from '@vue/runtime-core';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mount, unmount } from '@symbiote-native/vue';
import {
  createLiveTree,
  installRecordingFabric,
} from '@symbiote-native/test-utils';

const ROOT_TAG = 720;
const fabric = installRecordingFabric();
const live = createLiveTree(fabric);
const tick = (): Promise<void> =>
  new Promise(resolve => setTimeout(resolve, 0));

beforeEach(() => fabric.reset());
afterEach(() => unmount(ROOT_TAG));

function deferred(): { promise: Promise<void>; resolve: () => void } {
  let resolve: () => void = () => {};
  const promise = new Promise<void>(r => (resolve = r));
  return { promise, resolve };
}

describe('Suspense', () => {
  it('shows the fallback until the async child resolves, then the real content', async () => {
    const gate = deferred();
    const AsyncChild = defineComponent({
      async setup() {
        await gate.promise;
        return (): VNode => h('text', null, 'loaded');
      },
    });
    const App = defineComponent({
      render(): VNode {
        return h(Suspense, null, {
          default: () => h(AsyncChild),
          fallback: () => h('text', null, 'loading'),
        });
      },
    });

    mount(ROOT_TAG, App);
    await tick();
    expect(live.texts(live.appRoot())).toEqual(['loading']);

    gate.resolve();
    await tick();
    await tick();
    expect(live.texts(live.appRoot())).toEqual(['loaded']);
  });
});
