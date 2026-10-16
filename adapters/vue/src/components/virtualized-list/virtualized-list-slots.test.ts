// RN wraps the header, footer and empty slots with the list's counter-flip when inverted, and
// header and footer take their own style on that wrapper

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

const FlatListHost = FlatList as unknown as FunctionalComponent<
  Record<string, unknown>
>;

const ROOT_TAG = 322;
const SCROLL_VIEW = 'RCTScrollView';
const VIEWPORT = 300;
const OPACITY = 0.5;
const ROW_COUNT = 3;

const DATA = Array.from({ length: ROW_COUNT }, (_unused, id) => ({ id }));

const fabric = installRecordingFabric();
const live = createLiveTree(fabric);
const tick = (): Promise<void> =>
  new Promise(resolve => setTimeout(resolve, 0));

beforeEach(() => fabric.reset());
afterEach(() => unmount(ROOT_TAG));

const slot = (label: string) => () => [h('text', {}, label)];

async function open(
  props: Record<string, unknown>,
  slots: Record<string, () => unknown>,
): Promise<void> {
  const List = defineComponent({
    setup: () => () =>
      h(
        FlatListHost,
        {
          data: DATA,
          keyExtractor: (item: { id: number }) => `k-${item.id}`,
          ...props,
        },
        { item: () => [h('text', {}, 'row')], ...slots },
      ),
  });
  mount(ROOT_TAG, List);
  await tick();
  const scroll = live.findLive(
    live.appRoot(),
    node => node.viewName === SCROLL_VIEW,
  );
  if (scroll === undefined) throw new Error('no scroll view was committed');
  fabric.fireEvent(scroll.instanceHandle, 'topLayout', {
    layout: { x: 0, y: 0, width: 320, height: VIEWPORT },
  });
  await tick();
}

function wrapperOf(label: string): ILiveNode {
  const found = live.findLive(live.appRoot(), node =>
    node.children.some(child =>
      child.children.some(c => c.payload.text === label),
    ),
  );
  if (found === undefined) throw new Error(`no wrapper holds ${label}`);
  return found;
}

function flipsOf(node: ILiveNode): boolean {
  return JSON.stringify(node.payload).includes('-1');
}

describe('Vue list header, footer and empty slots', () => {
  it('counter-flips header and footer of an inverted list', async () => {
    await open(
      { inverted: true },
      { header: slot('head'), footer: slot('foot') },
    );

    expect(flipsOf(wrapperOf('head'))).toBe(true);
    expect(flipsOf(wrapperOf('foot'))).toBe(true);
  });

  it('counter-flips the empty slot of an inverted list', async () => {
    await open({ data: [], inverted: true }, { empty: slot('nothing') });

    expect(flipsOf(wrapperOf('nothing'))).toBe(true);
  });

  it('leaves the slots upright when the list is not inverted', async () => {
    await open({}, { header: slot('head') });

    expect(flipsOf(wrapperOf('head'))).toBe(false);
  });

  it('applies listHeaderComponentStyle and listFooterComponentStyle', async () => {
    await open(
      {
        listHeaderComponentStyle: { opacity: OPACITY },
        listFooterComponentStyle: { opacity: OPACITY },
      },
      { header: slot('head'), footer: slot('foot') },
    );

    expect(wrapperOf('head').payload.opacity).toBe(OPACITY);
    expect(wrapperOf('foot').payload.opacity).toBe(OPACITY);
  });
});
