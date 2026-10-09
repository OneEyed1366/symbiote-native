// FlatList в RN принимает `null`, не-список и array-like без исключений
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  createLiveTree,
  installRecordingFabric,
} from '@symbiote-native/test-utils';
import type { JSX } from '../../jsx-runtime';
import { mount, unmount } from '../../render';
import '../../register';
import { FlatList } from './index';

const ROOT_TAG = 824;

const fabric = installRecordingFabric();
const live = createLiveTree(fabric);
const tick = (): Promise<void> =>
  new Promise(resolve => setTimeout(resolve, 0));

beforeEach(() => fabric.reset());
afterEach(() => unmount(ROOT_TAG));

// `data` в типах массив, RN отдаёт спискам и другие формы
function mountWithData(data: unknown, numColumns = 1): Promise<void> {
  const LooseFlatList = FlatList as unknown as (
    props: Record<string, unknown>,
  ) => JSX.Element;
  mount(ROOT_TAG, () => (
    <LooseFlatList
      data={data}
      numColumns={numColumns}
      renderItem={(info: () => { item: string }) => <text>{info().item}</text>}
    />
  ));
  return tick();
}

describe('Solid FlatList data shapes', () => {
  it.each([
    ['null', null],
    ['a number', 123_456],
  ])('mounts an empty scroll view for %s', async (_name, data) => {
    await mountWithData(data);

    expect(live.texts(live.appRoot())).toEqual([]);
    expect(
      fabric.find(node => node.viewName === 'RCTScrollView'),
    ).toBeDefined();
  });

  it('mounts an empty scroll view for null in a multi column list', async () => {
    await mountWithData(null, 2);

    expect(
      fabric.find(node => node.viewName === 'RCTScrollView'),
    ).toBeDefined();
  });

  it('renders an array-like object by index', async () => {
    await mountWithData({ length: 2, 0: 'a', 1: 'b' });

    expect(live.texts(live.appRoot())).toEqual(['a', 'b']);
  });
});
