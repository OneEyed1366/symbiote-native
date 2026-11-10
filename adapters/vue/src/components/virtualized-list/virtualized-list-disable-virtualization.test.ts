// `disableVirtualization` mounts every cell from the top down to the end of the window, with no
// spacer standing in for the rows left out
import {
  defineComponent,
  h,
  type FunctionalComponent,
} from '@vue/runtime-core';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { FlatList, mount, unmount } from '@symbiote-native/vue';
import {
  createListHarness,
  createLiveTree,
  installRecordingFabric,
} from '@symbiote-native/test-utils';

// A generic component has a construct signature `h()` cannot resolve
const FlatListHost = FlatList as unknown as FunctionalComponent<
  Record<string, unknown>
>;

const ROOT_TAG = 322;
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

function listWith(
  disableVirtualization: boolean,
): ReturnType<typeof defineComponent> {
  return defineComponent({
    setup: () => () =>
      h(
        FlatListHost,
        {
          data: DATA,
          keyExtractor: (item: IRow) => `k-${item.id}`,
          getItemLayout: (_data: unknown, index: number) => ({
            length: ITEM_HEIGHT,
            offset: ITEM_HEIGHT * index,
            index,
          }),
          initialNumToRender: 2,
          windowSize: 1,
          disableVirtualization,
        },
        {
          item: ({ item }: { item: IRow }) => [h('text', {}, `row-${item.id}`)],
        },
      ),
  });
}

async function shapeAfterScroll(
  disableVirtualization: boolean,
): Promise<string> {
  mount(ROOT_TAG, h(listWith(disableVirtualization)));
  await wait(0);
  harness.simulateLayout({ viewport: VIEWPORT, content: CONTENT });
  harness.simulateScroll(NEAR_END_OFFSET);
  await wait(BATCH_PERIOD_MS);
  return harness.shape();
}

describe('Vue FlatList disableVirtualization', () => {
  it('mounts the rows from the top with no spacer', async () => {
    const shape = await shapeAfterScroll(true);

    expect(shape.startsWith('row-0 row-1 row-2')).toBe(true);
    expect(shape).not.toContain('[');
  });

  it('leaves a spacer between the rows when virtualized', async () => {
    expect(await shapeAfterScroll(false)).toContain('[');
  });
});
