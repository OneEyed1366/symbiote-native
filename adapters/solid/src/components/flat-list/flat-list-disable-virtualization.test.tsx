// `disableVirtualization` mounts every cell from the top down to the end of the window, with no
// spacer standing in for the rows left out
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  createListHarness,
  createLiveTree,
  installRecordingFabric,
} from '@symbiote-native/test-utils';
import { mount, unmount } from '../../render';
import '../../register';
import { FlatList } from './index';

const ROOT_TAG = 826;
const ITEM_HEIGHT = 100;
const ROW_COUNT = 20;
const NEAR_END_OFFSET = 1_800;
const BATCH_PERIOD_MS = 80;
const VIEWPORT = { width: 320, height: 100 };
const CONTENT = { width: 320, height: ITEM_HEIGHT * ROW_COUNT };

type IRow = { id: number };

const DATA: IRow[] = Array.from({ length: ROW_COUNT }, (_unused, id) => ({
  id,
}));

const fabric = installRecordingFabric();
const live = createLiveTree(fabric);
const harness = createListHarness(fabric, live);
const wait = (ms: number): Promise<void> =>
  new Promise(resolve => setTimeout(resolve, ms));

beforeEach(() => fabric.reset());
afterEach(() => unmount(ROOT_TAG));

async function shapeAfterScroll(
  disableVirtualization: boolean,
): Promise<string> {
  mount(ROOT_TAG, () => (
    <FlatList<IRow>
      data={DATA}
      getItemLayout={(_data, index) => ({
        length: ITEM_HEIGHT,
        offset: ITEM_HEIGHT * index,
        index,
      })}
      initialNumToRender={2}
      windowSize={1}
      disableVirtualization={disableVirtualization}
      renderItem={info => <text>{`row-${info().item.id}`}</text>}
    />
  ));
  await wait(0);
  harness.simulateLayout({ viewport: VIEWPORT, content: CONTENT });
  harness.simulateScroll(NEAR_END_OFFSET);
  await wait(BATCH_PERIOD_MS);
  return harness.shape();
}

describe('Solid FlatList disableVirtualization', () => {
  it('mounts the rows from the top with no spacer', async () => {
    const shape = await shapeAfterScroll(true);

    expect(shape.startsWith('row-0 row-1 row-2')).toBe(true);
    expect(shape).not.toContain('[');
  });

  it('leaves a spacer between the rows when virtualized', async () => {
    expect(await shapeAfterScroll(false)).toContain('[');
  });
});
