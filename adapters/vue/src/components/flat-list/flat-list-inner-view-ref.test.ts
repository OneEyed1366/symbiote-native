// RN hands a list's `innerViewRef` to its ScrollView through `...props`
import {
  defineComponent,
  h,
  type FunctionalComponent,
} from '@vue/runtime-core';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { FlatList, mount, unmount } from '@symbiote-native/vue';
import { installRecordingFabric } from '@symbiote-native/test-utils';

const FlatListHost = FlatList as unknown as FunctionalComponent<
  Record<string, unknown>
>;

const ROOT_TAG = 518;

const fabric = installRecordingFabric();
const tick = (): Promise<void> =>
  new Promise(resolve => setTimeout(resolve, 0));

beforeEach(() => fabric.reset());
afterEach(() => unmount(ROOT_TAG));

describe('Vue FlatList innerViewRef', () => {
  it('receives the content node and null after unmount', async () => {
    const innerViewRef = vi.fn();
    mount(
      ROOT_TAG,
      defineComponent({
        setup: () => () =>
          h(
            FlatListHost,
            { data: ['a', 'b'], innerViewRef },
            { item: ({ item }: { item: string }) => [h('text', {}, item)] },
          ),
      }),
    );
    await tick();

    expect(innerViewRef).toHaveBeenCalledTimes(1);
    expect(innerViewRef).not.toHaveBeenCalledWith(null);

    unmount(ROOT_TAG);

    expect(innerViewRef).toHaveBeenLastCalledWith(null);
  });
});
