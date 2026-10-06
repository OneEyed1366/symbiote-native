// RN's FlatList takes `null` or a non-list as an empty list, the scroll view still mounts
import {
  defineComponent,
  h,
  type FunctionalComponent,
} from '@vue/runtime-core';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { FlatList, mount, unmount } from '@symbiote-native/vue';
import { installRecordingFabric } from '@symbiote-native/test-utils';

const FlatListHost = FlatList as unknown as FunctionalComponent<
  Record<string, unknown>
>;

const ROOT_TAG = 517;

const fabric = installRecordingFabric();
const tick = (): Promise<void> =>
  new Promise(resolve => setTimeout(resolve, 0));

beforeEach(() => fabric.reset());
afterEach(() => unmount(ROOT_TAG));

function mountWithData(data: unknown, numColumns: number): Promise<void> {
  mount(
    ROOT_TAG,
    defineComponent({
      setup: () => () =>
        h(
          FlatListHost,
          { data, numColumns },
          { item: ({ item }: { item: string }) => [h('text', {}, item)] },
        ),
    }),
  );
  return tick();
}

describe('Vue FlatList with data that is not a list', () => {
  it.each([
    ['null', null],
    ['a number', 123_456],
  ])('mounts an empty scroll view for %s', async (_name, data) => {
    await mountWithData(data, 1);

    expect(
      fabric.find(node => node.viewName === 'RCTScrollView'),
    ).toBeDefined();
  });

  it('renders an array-like object by index', async () => {
    await mountWithData({ length: 2, 0: 'a', 1: 'b' }, 1);

    const texts = fabric
      .findAll(node => node.viewName === 'RCTRawText')
      .map(node => node.props.text);
    expect(texts).toEqual(['a', 'b']);
  });

  it('mounts an empty scroll view for null in a multi column list', async () => {
    await mountWithData(null, 2);

    expect(
      fabric.find(node => node.viewName === 'RCTScrollView'),
    ).toBeDefined();
  });
});
