// `ListItemComponent` is RN's component form of `renderItem`: it gets `item`, `index`, `separators`
import { createElement, type ReactElement } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  FlatList,
  VirtualizedList,
  mount,
  unmount,
  type ISeparators,
} from '@symbiote-native/react';
import {
  createLiveTree,
  installRecordingFabric,
} from '@symbiote-native/test-utils';

const ROOT_TAG = 23;

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

type IRow = { key: string };
const DATA: IRow[] = [{ key: 'i1' }, { key: 'i2' }, { key: 'i3' }];

type IItemInfo = { item: IRow; index: number; separators: ISeparators };

function ListItem({ item, index }: IItemInfo): ReactElement {
  return createElement('text', {}, `${index}:${item.key}`);
}

async function textsOf(element: ReactElement): Promise<string[]> {
  mount(ROOT_TAG, element);
  await tick();
  return live.texts(live.appRoot());
}

describe('ListItemComponent', () => {
  it('draws every item of a FlatList and hands it item and index', async () => {
    const texts = await textsOf(
      createElement(FlatList<IRow>, {
        data: DATA,
        ListItemComponent: ListItem,
      }),
    );

    expect(texts).toEqual(['0:i1', '1:i2', '2:i3']);
  });

  it('draws every item of a multi column FlatList with its own index', async () => {
    const texts = await textsOf(
      createElement(FlatList<IRow>, {
        data: DATA,
        numColumns: 2,
        ListItemComponent: ListItem,
      }),
    );

    expect(texts).toEqual(['0:i1', '1:i2', '2:i3']);
  });

  it('hands the component a separators handle', async () => {
    const seen: ISeparators[] = [];
    function Probe({ separators }: IItemInfo): ReactElement {
      seen.push(separators);
      return createElement('text', {}, 'probe');
    }

    await textsOf(
      createElement(FlatList<IRow>, { data: DATA, ListItemComponent: Probe }),
    );

    expect(seen.length).toBeGreaterThan(0);
    expect(typeof seen[0].highlight).toBe('function');
  });

  it('draws the cells of a VirtualizedList', async () => {
    const texts = await textsOf(
      createElement(VirtualizedList<IRow>, {
        data: DATA,
        getItem: (_data: unknown, index: number) => DATA[index],
        getItemCount: () => DATA.length,
        ListItemComponent: ListItem,
      }),
    );

    expect(texts).toEqual(['0:i1', '1:i2', '2:i3']);
  });

  it('lets the component win over renderItem and warns', async () => {
    const texts = await textsOf(
      createElement(FlatList<IRow>, {
        data: DATA,
        ListItemComponent: ListItem,
        renderItem: () => createElement('text', {}, 'from renderItem'),
      }),
    );

    expect(texts).toEqual(['0:i1', '1:i2', '2:i3']);
    expect(warn).toHaveBeenCalledWith(
      'VirtualizedList: Both ListItemComponent and renderItem props are present. ListItemComponent will take precedence over renderItem.',
    );
  });
});
