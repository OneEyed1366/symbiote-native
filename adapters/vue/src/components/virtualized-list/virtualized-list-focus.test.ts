// RN keeps a viewport of cells around the last focused one mounted, so a focused input survives
// the window moving away
import {
  defineComponent,
  h,
  type FunctionalComponent,
} from '@vue/runtime-core';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { FlatList, mount, unmount } from '@symbiote-native/vue';
import {
  createLiveTree,
  installRecordingFabric,
  type ILiveNode,
} from '@symbiote-native/test-utils';

// A generic component has a construct signature `h()` cannot resolve, so the runtime test drives
// it through a loose functional handle
const FlatListHost = FlatList as unknown as FunctionalComponent<
  Record<string, unknown>
>;

const ROOT_TAG = 321;
const SCROLL_VIEW = 'RCTScrollView';
const ITEM_HEIGHT = 100;
const VIEWPORT_HEIGHT = 100;
const ROW_COUNT = 20;

type IRow = {
  id: number;
  label: string;
};

const DATA: IRow[] = Array.from({ length: ROW_COUNT }, (_unused, index) => ({
  id: index,
  label: `row-${index}`,
}));

const fabric = installRecordingFabric();
const live = createLiveTree(fabric);
const tick = (): Promise<void> =>
  new Promise(resolve => setTimeout(resolve, 0));

beforeEach(() => fabric.reset());
afterEach(() => unmount(ROOT_TAG));

const List = defineComponent({
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
      },
      { item: ({ item }: { item: IRow }) => [h('text', {}, item.label)] },
    ),
});

function scrollView(): ILiveNode {
  const found = live.findLive(
    live.appRoot(),
    node => node.viewName === SCROLL_VIEW,
  );
  if (found === undefined) throw new Error('no scroll view was committed');
  return found;
}

function scrollTo(offset: number): void {
  fabric.fireEvent(scrollView().instanceHandle, 'topScroll', {
    contentOffset: { x: 0, y: offset },
    contentSize: { width: 320, height: ITEM_HEIGHT * ROW_COUNT },
    layoutMeasurement: { width: 320, height: VIEWPORT_HEIGHT },
  });
}

// The text node holding a row, its event bubbles up to the cell around it
function textNodeOf(row: string): ILiveNode {
  const found = live.findLive(live.appRoot(), node =>
    node.children.some(child => child.payload.text === row),
  );
  if (found === undefined) throw new Error(`no node holds ${row}`);
  return found;
}

async function openedAt(offset: number): Promise<void> {
  mount(ROOT_TAG, List);
  await tick();
  fabric.fireEvent(scrollView().instanceHandle, 'topLayout', {
    layout: { x: 0, y: 0, width: 320, height: VIEWPORT_HEIGHT },
  });
  await tick();
  scrollTo(offset);
  await tick();
}

describe('Vue VirtualizedList keeps the focused cell mounted', () => {
  it('holds a viewport around it after the window moves away', async () => {
    await openedAt(800);
    expect(live.texts(live.appRoot())).toContain('row-8');

    fabric.fireEvent(textNodeOf('row-8').instanceHandle, 'topFocus', {});
    await tick();
    scrollTo(1_500);
    await tick();

    const rows = live.texts(live.appRoot());
    expect(rows, 'the focused cell stays').toContain('row-8');
    expect(rows, 'a viewport either side stays').toContain('row-7');
    expect(rows, 'the rest of the old window goes').not.toContain('row-5');
  });

  it('retains nothing when no cell was ever focused', async () => {
    await openedAt(800);

    scrollTo(1_500);
    await tick();

    expect(live.texts(live.appRoot())).not.toContain('row-8');
  });
});
