// RN's `scrollToLocation` cases, read through the native `scrollTo` the handle ends in
// A stuck section header covers the item under it, so its length joins the view offset
import { createElement, createRef, type RefObject } from 'react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  VirtualizedSectionList,
  mount,
  unmount,
  type IVirtualizedSectionListHandle,
} from '@symbiote-native/react';
import { installRecordingFabric } from '@symbiote-native/test-utils';

const ROOT_TAG = 34;
const ITEM_HEIGHT = 100;

type IRow = { key: string };

const SECTIONS = [
  { title: 's1', data: [{ key: 'i1.1' }, { key: 'i1.2' }, { key: 'i1.3' }] },
  { title: 's2', data: [{ key: 'i2.1' }, { key: 'i2.2' }, { key: 'i2.3' }] },
];

const fabric = installRecordingFabric();
const tick = (): Promise<void> =>
  new Promise(resolve => setTimeout(resolve, 0));

beforeEach(() => fabric.reset());
afterEach(() => unmount(ROOT_TAG));

async function mounted(
  isSticky: boolean,
): Promise<RefObject<IVirtualizedSectionListHandle | null>> {
  const ref = createRef<IVirtualizedSectionListHandle>();
  mount(
    ROOT_TAG,
    createElement(VirtualizedSectionList<IRow>, {
      ref,
      sections: SECTIONS,
      stickySectionHeadersEnabled: isSticky,
      renderItem: ({ item }: { item: IRow }) =>
        createElement('text', {}, item.key),
      getItemLayout: (_data, index) => ({
        length: ITEM_HEIGHT,
        offset: ITEM_HEIGHT * index,
        index,
      }),
    }),
  );
  await tick();
  return ref;
}

// The y of the one `scrollTo` the call sent
function scrolledTo(): number {
  const scrolls = fabric.commands.filter(
    command => command.commandName === 'scrollTo',
  );
  expect(scrolls).toHaveLength(1);
  return Number(scrolls[0].args[1]);
}

describe('scrollToLocation', () => {
  it('lands the first header at the top', async () => {
    const ref = await mounted(false);

    ref.current?.scrollToLocation({ sectionIndex: 0, itemIndex: 0 });

    expect(scrolledTo()).toBe(0);
  });

  it('counts a header and a footer in every section before the target', async () => {
    const ref = await mounted(false);

    ref.current?.scrollToLocation({ sectionIndex: 1, itemIndex: 1 });

    expect(scrolledTo()).toBe(6 * ITEM_HEIGHT);
  });

  it('applies the view offset it is given', async () => {
    const ref = await mounted(false);

    ref.current?.scrollToLocation({
      sectionIndex: 0,
      itemIndex: 1,
      viewOffset: 25,
    });

    expect(scrolledTo()).toBe(ITEM_HEIGHT - 25);
  });

  it('adds the stuck header length to the view offset for an item under it', async () => {
    const ref = await mounted(true);

    ref.current?.scrollToLocation({
      sectionIndex: 1,
      itemIndex: 1,
      viewOffset: 25,
    });

    expect(scrolledTo()).toBe(6 * ITEM_HEIGHT - 25 - ITEM_HEIGHT);
  });

  it('adds nothing when the target is the header itself', async () => {
    const ref = await mounted(true);

    ref.current?.scrollToLocation({ sectionIndex: 1, itemIndex: 0 });

    expect(scrolledTo()).toBe(5 * ITEM_HEIGHT);
  });
});
