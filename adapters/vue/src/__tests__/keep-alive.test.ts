// Ground-truth check: does KeepAlive actually preserve state across deactivate/
// reactivate over this engine's nodeOps, or does it destroy and recreate like a plain
// v-if would?

import {
  defineComponent,
  h,
  KeepAlive,
  ref,
  type VNode,
} from '@vue/runtime-core';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mount, unmount } from '@symbiote-native/vue';
import {
  createLiveTree,
  installRecordingFabric,
} from '@symbiote-native/test-utils';

const ROOT_TAG = 721;
const fabric = installRecordingFabric();
const live = createLiveTree(fabric);
const tick = (): Promise<void> =>
  new Promise(resolve => setTimeout(resolve, 0));

beforeEach(() => fabric.reset());
afterEach(() => unmount(ROOT_TAG));

describe('KeepAlive', () => {
  it("preserves a cached child's state across a toggle instead of recreating it", async () => {
    let mountCount = 0;
    const showChild = ref(true);
    const Child = defineComponent({
      setup() {
        mountCount += 1;
        const count = ref(0);
        return { count };
      },
      render(): VNode {
        return h('text', null, `count: ${this.count}`);
      },
    });
    const App = defineComponent({
      render(): VNode {
        return h(KeepAlive, null, {
          default: () => (showChild.value ? h(Child) : h('text', null, 'gone')),
        });
      },
    });

    mount(ROOT_TAG, App);
    await tick();
    expect(mountCount).toBe(1);

    showChild.value = false;
    await tick();
    expect(live.texts(live.appRoot())).toEqual(['gone']);

    showChild.value = true;
    await tick();
    expect(live.texts(live.appRoot())).toEqual(['count: 0']);
    expect(mountCount).toBe(1);
  });
});
