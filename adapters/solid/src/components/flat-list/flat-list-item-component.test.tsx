// `ListItemComponent` в RN: компонент рисует ячейку по item, index и separators
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  createLiveTree,
  installRecordingFabric,
} from '@symbiote-native/test-utils';
import type { ISeparators } from '@symbiote-native/components';
import type { JSX } from '../../jsx-runtime';
import { mount, unmount } from '../../render';
import '../../register';
import { FlatList } from './index';

const ROOT_TAG = 825;

type IRow = { key: string };
const DATA: IRow[] = [{ key: 'i1' }, { key: 'i2' }, { key: 'i3' }];

type IItemInfo = { item: IRow; index: number; separators: ISeparators };

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

function ListItem(props: IItemInfo): JSX.Element {
  return <text>{`${props.index}:${props.item.key}`}</text>;
}

async function textsOf(render: () => JSX.Element): Promise<string[]> {
  mount(ROOT_TAG, render);
  await tick();
  return live.texts(live.appRoot());
}

describe('Solid ListItemComponent', () => {
  it('draws every item and hands it item and index', async () => {
    const texts = await textsOf(() => (
      <FlatList data={DATA} ListItemComponent={ListItem} />
    ));

    expect(texts.join('|')).toBe('0:i1|1:i2|2:i3');
  });

  it('draws every item of a multi column list with its own index', async () => {
    const texts = await textsOf(() => (
      <FlatList data={DATA} numColumns={2} ListItemComponent={ListItem} />
    ));

    expect(texts.join('|')).toBe('0:i1|1:i2|2:i3');
  });

  it('hands the component a separators handle', async () => {
    const seen: ISeparators[] = [];
    function Probe(props: IItemInfo): JSX.Element {
      seen.push(props.separators);
      return <text>probe</text>;
    }

    await textsOf(() => <FlatList data={DATA} ListItemComponent={Probe} />);

    expect(seen.length).toBeGreaterThan(0);
    expect(typeof seen[0].highlight).toBe('function');
  });

  it('lets the component win over renderItem and warns', async () => {
    const texts = await textsOf(() => (
      <FlatList
        data={DATA}
        ListItemComponent={ListItem}
        renderItem={() => <text>from renderItem</text>}
      />
    ));

    expect(texts.join('|')).toBe('0:i1|1:i2|2:i3');
    expect(warn).toHaveBeenCalledWith(
      'VirtualizedList: Both ListItemComponent and renderItem props are present. ListItemComponent will take precedence over renderItem.',
    );
  });
});
