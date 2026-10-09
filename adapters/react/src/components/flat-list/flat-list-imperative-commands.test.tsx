/** @jsxRuntime automatic */
// Группа `imperative methods` из `FlatList-itest` в RN: какие нативные команды уходят ScrollView
import { createElement, createRef, type ReactElement } from 'react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  FlatList,
  mount,
  unmount,
  type IFlatListHandle,
} from '@symbiote-native/react';
import { installRecordingFabric } from '@symbiote-native/test-utils';

const ROOT_TAG = 6_201;
const ITEM_SIZE = 50;
const DATA = Array.from({ length: 20 }, (_unused, index) => ({
  key: String(index),
  title: `Item ${index}`,
}));

const fabric = installRecordingFabric();
const listRef = createRef<IFlatListHandle>();

beforeEach(() => fabric.reset());
afterEach(() => unmount(ROOT_TAG));

function mountList(horizontal = false): ReactElement {
  return createElement(FlatList<{ key: string; title: string }>, {
    data: DATA,
    horizontal,
    getItemLayout: (_data, index) => ({
      length: ITEM_SIZE,
      offset: ITEM_SIZE * index,
      index,
    }),
    renderItem: ({ item }) => createElement('text', {}, item.title),
    ref: listRef,
  });
}

function handle(): IFlatListHandle {
  if (listRef.current === null) throw new Error('the list ref is not attached');
  return listRef.current;
}

function commandsNamed(name: string) {
  return fabric.commands.filter(command => command.commandName === name);
}

describe('FlatList imperative methods', () => {
  it('scrolls a vertical list along y', () => {
    mount(ROOT_TAG, mountList());

    handle().scrollToOffset({ offset: 100, animated: false });

    expect(commandsNamed('scrollTo').map(command => command.args)).toEqual([
      [0, 100, false],
    ]);
  });

  it('scrolls a horizontal list along x', () => {
    mount(ROOT_TAG, mountList(true));

    handle().scrollToOffset({ offset: 200, animated: false });

    expect(commandsNamed('scrollTo').map(command => command.args)).toEqual([
      [200, 0, false],
    ]);
  });

  it('scrolls to the end of the content', () => {
    mount(ROOT_TAG, mountList());

    handle().scrollToEnd({ animated: false });

    expect(commandsNamed('scrollTo').map(command => command.args)).toEqual([
      [0, 1_000, false],
    ]);
  });

  it('scrolls to an index', () => {
    mount(ROOT_TAG, mountList());

    handle().scrollToIndex({ index: 5, animated: false });

    expect(commandsNamed('scrollTo').map(command => command.args)).toEqual([
      [0, 250, false],
    ]);
  });

  it('scrolls to an item', () => {
    mount(ROOT_TAG, mountList());

    handle().scrollToItem({ item: DATA[3], animated: false });

    expect(commandsNamed('scrollTo').map(command => command.args)).toEqual([
      [0, 150, false],
    ]);
  });

  it('sends nothing for an item that is not in the data', () => {
    mount(ROOT_TAG, mountList());

    handle().scrollToItem({
      item: { key: 'not-in-data', title: 'Missing' },
      animated: false,
    });

    expect(commandsNamed('scrollTo')).toEqual([]);
  });

  it('flashes the scroll indicators through the native command', () => {
    mount(ROOT_TAG, mountList());

    handle().flashScrollIndicators();

    expect(commandsNamed('flashScrollIndicators')).toHaveLength(1);
  });

  it('hands back a responder, a native ref and a scrollable node', () => {
    mount(ROOT_TAG, mountList());

    expect(handle().getScrollResponder()).not.toBeNull();
    expect(handle().getNativeScrollRef()).not.toBeNull();
    expect(handle().getScrollableNode()).not.toBeNull();
  });

  it('accepts recordInteraction and setNativeProps without throwing', () => {
    mount(ROOT_TAG, mountList());

    expect(() => handle().recordInteraction()).not.toThrow();
    expect(() =>
      handle().setNativeProps({ scrollEnabled: false }),
    ).not.toThrow();
  });
});
