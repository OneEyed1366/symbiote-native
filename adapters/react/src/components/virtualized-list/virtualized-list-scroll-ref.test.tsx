/** @jsxRuntime automatic */
// RN `getScrollRef()`: a scrolling list answers a scroll-view-like node, a nested list that renders
// a plain view answers a host node, and both answer null until the tag commits

import { createElement, type ReactElement } from 'react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  VirtualizedList,
  mount,
  unmount,
  type IVirtualizedListHandle,
} from '@symbiote-native/react';
import { installRecordingFabric } from '@symbiote-native/test-utils';

const ROOT_TAG = 62;
const rows = ['a', 'b'];

const fabric = installRecordingFabric();
beforeEach(() => fabric.reset());
afterEach(() => unmount(ROOT_TAG));

const listProps = (data: string[]) => ({
  data,
  getItem: (_data: unknown, index: number) => data[index],
  getItemCount: () => data.length,
  keyExtractor: (item: string) => item,
  renderItem: ({ item }: { item: string }) => createElement('text', {}, item),
});

describe('VirtualizedList getScrollRef', () => {
  it('answers a node that scrolls', () => {
    const held: { list: IVirtualizedListHandle | null } = { list: null };
    mount(
      ROOT_TAG,
      createElement(VirtualizedList<string>, {
        ...listProps(rows),
        ref: (value: IVirtualizedListHandle | null) => {
          held.list = value;
        },
      }),
    );

    expect(typeof held.list?.getScrollRef()?.scrollTo).toBe('function');
  });

  it('answers a host node for a nested list rendered as a view', () => {
    const held: { list: IVirtualizedListHandle | null } = { list: null };
    const Inner = (): ReactElement =>
      createElement(VirtualizedList<string>, {
        ...listProps(rows),
        ref: (value: IVirtualizedListHandle | null) => {
          held.list = value;
        },
      });
    mount(
      ROOT_TAG,
      createElement(VirtualizedList<string>, {
        ...listProps(['outer']),
        renderItem: () => createElement(Inner),
      }),
    );

    const ref = held.list?.getScrollRef();
    expect(typeof ref?.measure).toBe('function');
    expect(typeof ref?.measureLayout).toBe('function');
    expect(typeof ref?.measureInWindow).toBe('function');
  });
});
