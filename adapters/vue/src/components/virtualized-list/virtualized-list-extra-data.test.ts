// RN `extraData`: a cell that reads state outside the props shows the new value after it changes
import {
  defineComponent,
  h,
  ref,
  type FunctionalComponent,
} from '@vue/runtime-core';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { FlatList, mount, unmount } from '@symbiote-native/vue';
import {
  createLiveTree,
  installRecordingFabric,
} from '@symbiote-native/test-utils';

const FlatListHost = FlatList as unknown as FunctionalComponent<
  Record<string, unknown>
>;

const ROOT_TAG = 323;
const DATA = [{ id: 1 }];

const fabric = installRecordingFabric();
const live = createLiveTree(fabric);
const tick = (): Promise<void> =>
  new Promise(resolve => setTimeout(resolve, 0));

beforeEach(() => fabric.reset());
afterEach(() => unmount(ROOT_TAG));

describe('Vue list extraData', () => {
  it('re-renders the cells when it changes', async () => {
    // Plain state the cell reads, so only `extraData` can announce the change
    const outside = { mark: 'before' };
    const version = ref(0);
    const Host = defineComponent({
      setup: () => () =>
        h(
          FlatListHost,
          { data: DATA, extraData: version.value },
          { item: () => [h('text', {}, outside.mark)] },
        ),
    });
    mount(ROOT_TAG, Host);
    await tick();
    expect(live.texts(live.appRoot())).toContain('before');

    outside.mark = 'after';
    version.value += 1;
    await tick();

    expect(live.texts(live.appRoot())).toContain('after');
  });
});
