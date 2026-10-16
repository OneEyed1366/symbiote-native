/** @jsxRuntime automatic */
// RN wraps ListHeader / ListFooter / ListEmpty with the list's counter-flip when inverted, and
// header and footer take ListHeaderComponentStyle / ListFooterComponentStyle on that wrapper

import { createElement, type ReactElement } from 'react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { VirtualizedList, mount, unmount } from '@symbiote-native/react';
import {
  createLiveTree,
  installRecordingFabric,
  type IAuthoredNode,
  type ILiveNode,
} from '@symbiote-native/test-utils';

type IRow = { id: number };

const ROOT_TAG = 48;
const ROW_COUNT = 3;
const VIEWPORT = 300;
const OPACITY = 0.5;
const DATA: IRow[] = Array.from({ length: ROW_COUNT }, (_unused, id) => ({
  id,
}));

const fabric = installRecordingFabric();
const live = createLiveTree(fabric);
beforeEach(() => fabric.reset());
afterEach(() => unmount(ROOT_TAG));

function findScrollView(): IAuthoredNode {
  const node = fabric.find(n => n.viewName === 'RCTScrollView');
  if (node === undefined) throw new Error('no scroll view');
  return node;
}

function layoutViewport(): void {
  fabric.fireEvent(findScrollView().instanceHandle, 'topLayout', {
    layout: { x: 0, y: 0, width: 320, height: VIEWPORT },
  });
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

function listWith(extra: Record<string, unknown>): ReactElement {
  return createElement(VirtualizedList<IRow>, {
    data: DATA,
    getItem: (data, index) => (data as IRow[])[index],
    getItemCount: data => (data as IRow[]).length,
    keyExtractor: item => `k-${item.id}`,
    renderItem: ({ item }) => createElement('text', {}, `row-${item.id}`),
    ...extra,
  });
}

const slot = (label: string) => () => createElement('text', {}, label);

describe('VirtualizedList header, footer and empty slots', () => {
  it('counter-flips header and footer of an inverted list', () => {
    mount(
      ROOT_TAG,
      listWith({
        inverted: true,
        ListHeaderComponent: slot('head'),
        ListFooterComponent: slot('foot'),
      }),
    );
    layoutViewport();

    expect(flipsOf(wrapperOf('head'))).toBe(true);
    expect(flipsOf(wrapperOf('foot'))).toBe(true);
  });

  it('counter-flips the empty slot of an inverted list', () => {
    mount(
      ROOT_TAG,
      listWith({
        data: [],
        inverted: true,
        ListEmptyComponent: slot('nothing'),
      }),
    );
    layoutViewport();

    expect(flipsOf(wrapperOf('nothing'))).toBe(true);
  });

  it('leaves the slots upright when the list is not inverted', () => {
    mount(ROOT_TAG, listWith({ ListHeaderComponent: slot('head') }));
    layoutViewport();

    expect(flipsOf(wrapperOf('head'))).toBe(false);
  });

  it('applies ListHeaderComponentStyle and ListFooterComponentStyle', () => {
    mount(
      ROOT_TAG,
      listWith({
        ListHeaderComponent: slot('head'),
        ListHeaderComponentStyle: { opacity: OPACITY },
        ListFooterComponent: slot('foot'),
        ListFooterComponentStyle: { opacity: OPACITY },
      }),
    );
    layoutViewport();

    expect(wrapperOf('head').payload.opacity).toBe(OPACITY);
    expect(wrapperOf('foot').payload.opacity).toBe(OPACITY);
  });
});
