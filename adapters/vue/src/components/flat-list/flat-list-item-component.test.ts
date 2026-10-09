// `listItemComponent` это RN `ListItemComponent`: компонент рисует ячейку по item и index
import {
  defineComponent,
  h,
  type FunctionalComponent,
} from '@vue/runtime-core';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { FlatList, mount, unmount } from '@symbiote-native/vue';
import {
  createLiveTree,
  installRecordingFabric,
} from '@symbiote-native/test-utils';

const FlatListHost = FlatList as unknown as FunctionalComponent<
  Record<string, unknown>
>;

const ROOT_TAG = 324;

type IRow = { key: string };
const DATA: IRow[] = [{ key: 'i1' }, { key: 'i2' }, { key: 'i3' }];

const fabric = installRecordingFabric();
const live = createLiveTree(fabric);
const tick = (): Promise<void> =>
  new Promise(resolve => setTimeout(resolve, 0));
const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});

beforeEach(() => {
  fabric.reset();
  warn.mockClear();
});
afterEach(() => unmount(ROOT_TAG));

const ListItem = defineComponent({
  props: ['item', 'index', 'separators'],
  setup: props => () => h('text', {}, `${props.index}:${props.item.key}`),
});

async function textsOf(
  props: Record<string, unknown>,
  slots?: Record<string, unknown>,
): Promise<string[]> {
  mount(
    ROOT_TAG,
    defineComponent({
      setup: () => () => h(FlatListHost, { data: DATA, ...props }, slots),
    }),
  );
  await tick();
  return live.texts(live.appRoot());
}

describe('Vue listItemComponent', () => {
  it('draws every item and hands it item and index', async () => {
    expect(await textsOf({ listItemComponent: ListItem })).toEqual([
      '0:i1',
      '1:i2',
      '2:i3',
    ]);
  });

  it('draws every item of a multi column list with its own index', async () => {
    expect(
      await textsOf({ listItemComponent: ListItem, numColumns: 2 }),
    ).toEqual(['0:i1', '1:i2', '2:i3']);
  });

  it('hands the component a separators handle', async () => {
    const seen: unknown[] = [];
    const Probe = defineComponent({
      props: ['item', 'index', 'separators'],
      setup: props => () => {
        seen.push(props.separators);
        return h('text', {}, 'probe');
      },
    });

    await textsOf({ listItemComponent: Probe });

    expect(seen.length).toBeGreaterThan(0);
    expect(typeof Reflect.get(Object(seen[0]), 'highlight')).toBe('function');
  });

  it('lets the component win over the #item slot and warns', async () => {
    const texts = await textsOf(
      { listItemComponent: ListItem },
      { item: () => [h('text', {}, 'from slot')] },
    );

    expect(texts).toEqual(['0:i1', '1:i2', '2:i3']);
    expect(warn).toHaveBeenCalledWith(
      'VirtualizedList: Both ListItemComponent and renderItem props are present. ListItemComponent will take precedence over renderItem.',
    );
  });
});
