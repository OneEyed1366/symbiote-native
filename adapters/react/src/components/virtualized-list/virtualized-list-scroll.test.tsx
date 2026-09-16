/** @jsxRuntime automatic */
// Co-located React-driven pipeline test, ported from the headless
// `virtualized-list-scroll.smoke.tsx`. Proves that an ANIMATED imperative scroll rides the
// ScrollView's native scrollTo command (not an instant contentOffset push): we mount a
// FlatList with a ref, then assert that scrollToOffset({animated:true}) dispatches
// scrollTo [x, y, true] while scrollToOffset({animated:false}) dispatches scrollTo with
// animated=false. No simulator: a failure here is in the JS routing of the animated flag.

import { createElement, createRef, type ReactElement } from 'react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  FlatList,
  mount,
  unmount,
  type IFlatListHandle,
} from '@symbiote-native/react';
import { installRecordingFabric } from '@symbiote-native/test-utils';

const ROOT_TAG = 42;
const ITEM_HEIGHT = 40;
const DATA = Array.from({ length: 100 }, (_unused, index) => ({ id: index }));

const listRef = createRef<IFlatListHandle>();

// dispatchCommand is one of the engine's own imperative calls, recorded natively by the
// recording host — no graft needed, unlike the old shared mirror slot.
const fabric = installRecordingFabric();
const commands = fabric.commands;

beforeEach(() => fabric.reset());
afterEach(() => unmount(ROOT_TAG));

function App(): ReactElement {
  return createElement(FlatList<{ id: number }>, {
    data: DATA,
    keyExtractor: item => `k-${item.id}`,
    getItemLayout: (_data, index) => ({
      length: ITEM_HEIGHT,
      offset: ITEM_HEIGHT * index,
      index,
    }),
    renderItem: ({ item }) => createElement('text', {}, `row-${item.id}`),
    ref: listRef,
  });
}

function scrollCommands() {
  return commands.filter(c => c.commandName === 'scrollTo');
}

describe('VirtualizedList imperative scroll routes through the native scrollTo command', () => {
  it('an animated scroll dispatches the native scrollTo [x, y, true]', () => {
    mount(ROOT_TAG, <App />);
    expect(fabric.commits, 'FlatList committed').toBeGreaterThan(0);
    expect(listRef.current, 'FlatList ref attached').not.toBeNull();

    listRef.current!.scrollToOffset({ offset: 200, animated: true });
    const scrolls = scrollCommands();
    expect(
      scrolls.length,
      'animated scrollToOffset dispatches one scrollTo',
    ).toBe(1);

    const [x, y, animated] = scrolls[0].args;
    // A vertical list scrolls along y; x stays 0.
    expect(x).toBe(0);
    expect(y).toBe(200);
    expect(animated).toBe(true);
  });

  it('an instant scroll also uses the native command, with animated=false', () => {
    // contentOffset-as-a-prop scrolls on Android but not on iOS post-mount, so both animated
    // and instant route through scrollTo, the instant one just carries animated=false. To
    // reach the cumulative "two scrolls" state the smoke asserted, re-do the animated scroll
    // first, then the instant one.
    mount(ROOT_TAG, <App />);
    expect(fabric.commits, 'FlatList committed').toBeGreaterThan(0);
    expect(listRef.current, 'FlatList ref attached').not.toBeNull();

    listRef.current!.scrollToOffset({ offset: 200, animated: true });
    listRef.current!.scrollToOffset({ offset: 80, animated: false });
    const scrolls = scrollCommands();
    expect(
      scrolls.length,
      'instant scrollToOffset also dispatches a scrollTo',
    ).toBe(2);

    const [x, y, animated] = scrolls[1].args;
    expect(x).toBe(0);
    expect(y).toBe(80);
    expect(animated).toBe(false);
  });
});
