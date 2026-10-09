// RN wraps the header, footer and empty slots with the list's counter-flip when inverted, and
// header and footer take their own style on that wrapper

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  createLiveTree,
  installRecordingFabric,
  type ILiveNode,
} from '@symbiote-native/test-utils';
import { mount, unmount } from '../../render';
import '../../register';
import { VirtualizedList } from './index';

const ROOT_TAG = 824;
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

const getItem = (_data: unknown, index: number) => DATA[index];
const getItemCount = (data: unknown): number =>
  Array.isArray(data) ? data.length : 0;

async function layoutViewport(): Promise<void> {
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

describe('Solid VirtualizedList header, footer and empty slots', () => {
  it('counter-flips header and footer of an inverted list', async () => {
    mount(ROOT_TAG, () => (
      <VirtualizedList
        data={DATA}
        getItem={getItem}
        getItemCount={getItemCount}
        inverted
        ListHeaderComponent={<text>head</text>}
        ListFooterComponent={<text>foot</text>}
        renderItem={() => <text>row</text>}
      />
    ));
    await layoutViewport();

    expect(flipsOf(wrapperOf('head'))).toBe(true);
    expect(flipsOf(wrapperOf('foot'))).toBe(true);
  });

  it('counter-flips the empty slot of an inverted list', async () => {
    mount(ROOT_TAG, () => (
      <VirtualizedList
        data={[]}
        getItem={getItem}
        getItemCount={getItemCount}
        inverted
        ListEmptyComponent={<text>nothing</text>}
        renderItem={() => <text>row</text>}
      />
    ));
    await layoutViewport();

    expect(flipsOf(wrapperOf('nothing'))).toBe(true);
  });

  it('leaves the slots upright when the list is not inverted', async () => {
    mount(ROOT_TAG, () => (
      <VirtualizedList
        data={DATA}
        getItem={getItem}
        getItemCount={getItemCount}
        ListHeaderComponent={<text>head</text>}
        renderItem={() => <text>row</text>}
      />
    ));
    await layoutViewport();

    expect(flipsOf(wrapperOf('head'))).toBe(false);
  });

  it('applies ListHeaderComponentStyle and ListFooterComponentStyle', async () => {
    mount(ROOT_TAG, () => (
      <VirtualizedList
        data={DATA}
        getItem={getItem}
        getItemCount={getItemCount}
        ListHeaderComponent={<text>head</text>}
        ListHeaderComponentStyle={{ opacity: OPACITY }}
        ListFooterComponent={<text>foot</text>}
        ListFooterComponentStyle={{ opacity: OPACITY }}
        renderItem={() => <text>row</text>}
      />
    ));
    await layoutViewport();

    expect(wrapperOf('head').payload.opacity).toBe(OPACITY);
    expect(wrapperOf('foot').payload.opacity).toBe(OPACITY);
  });
});
