// RN's FlatList takes whatever `data` holds without throwing: null and numbers render nothing,
// an array-like object renders its items, and holes still reach `renderItem`
import { createElement, type ComponentType, type ReactElement } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { FlatList, mount, unmount } from '@symbiote-native/react';
import {
  createLiveTree,
  installRecordingFabric,
} from '@symbiote-native/test-utils';

const ROOT_TAG = 22;

// `data` is typed as an array, RN's tests hand it shapes the types forbid
const LooseFlatList = FlatList as unknown as ComponentType<
  Record<string, unknown>
>;

const fabric = installRecordingFabric();
const live = createLiveTree(fabric);
const tick = (): Promise<void> =>
  new Promise(resolve => setTimeout(resolve, 0));

// Ошибка рендера без границы ошибок приходит в `console.error`, пустой результат её не выдаёт
const renderErrors = vi.spyOn(console, 'error').mockImplementation(() => {});

beforeEach(() => {
  fabric.reset();
  renderErrors.mockClear();
});
afterEach(() => unmount(ROOT_TAG));

type IRow = { key: string } | null | undefined;

function renderRow({ item }: { item: IRow }): ReactElement {
  return createElement('text', {}, item?.key ?? 'hole');
}

async function textsOf(props: Record<string, unknown>): Promise<string[]> {
  mount(
    ROOT_TAG,
    createElement(LooseFlatList, { renderItem: renderRow, ...props }),
  );
  await tick();
  return live.texts(live.appRoot());
}

describe('FlatList data shapes', () => {
  it('renders an array-like object by index', async () => {
    const arrayLike = {
      length: 3,
      0: { key: 'i1' },
      1: { key: 'i2' },
      2: { key: 'i3' },
    };

    expect(await textsOf({ data: arrayLike })).toEqual(['i1', 'i2', 'i3']);
  });

  it('renders nothing for null data', async () => {
    expect(await textsOf({ data: null })).toEqual([]);
    expect(renderErrors).not.toHaveBeenCalled();
  });

  it('renders nothing for data that is not a list', async () => {
    expect(await textsOf({ data: 123_456 })).toEqual([]);
    expect(renderErrors).not.toHaveBeenCalled();
  });

  it('renders nothing for null data in a multi column list', async () => {
    expect(await textsOf({ data: null, numColumns: 2 })).toEqual([]);
    expect(renderErrors).not.toHaveBeenCalled();
  });

  it('calls renderItem for null and undefined entries too', async () => {
    const data = [{ key: 'i1' }, null, undefined, { key: 'i2' }];

    expect(await textsOf({ data })).toEqual(['i1', 'hole', 'hole', 'i2']);
  });

  it('calls renderItem for every entry in a multi column list', async () => {
    const data = [{ key: 'i1' }, null, undefined, { key: 'i2' }];

    expect(await textsOf({ data, numColumns: 3 })).toEqual([
      'i1',
      'hole',
      'hole',
      'i2',
    ]);
  });
});
