import { act, createElement } from 'react';
import { mount, unmount } from '@symbiote-native/react';
import type { ISymbioteNode } from '@symbiote-native/engine';
import { createLiveTree } from '@symbiote-native/test-utils';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { LayoutAnimationType } from 'react-native-reanimated/src/commonTypes';
import { updateLayoutAnimations } from 'react-native-reanimated/src/UpdateLayoutAnimations';
import { installWrapperHost } from '../../test-support/wrapper-host';
import Animated, { View } from './animated';
import { AnimatedFlatList } from './animated-flat-list';
import '../register';

vi.mock('react-native-reanimated/src/UpdateLayoutAnimations', () => ({
  updateLayoutAnimations: vi.fn(),
}));

const host = installWrapperHost();
const live = createLiveTree(host.fabric);
const ROOT_TAG = 16_301;
const update = vi.mocked(updateLayoutAnimations);

beforeEach(() => update.mockClear());
afterEach(() => act(() => unmount(ROOT_TAG)));

const fade = () => ({ animations: {}, initialValues: {}, callback: undefined });
const DATA = [{ id: 'a' }, { id: 'b' }];

function renderRow() {
  return createElement(View, { entering: fade });
}

// The scroll view the list committed, found under a root of this test's own
function scrollerOf(props: object) {
  let root: ISymbioteNode | null = null;
  act(() =>
    mount(
      ROOT_TAG,
      createElement(
        'view',
        {
          ref: (instance: ISymbioteNode | null) => {
            root = instance ?? root;
          },
        },
        createElement(AnimatedFlatList, {
          data: DATA,
          renderItem: renderRow,
          keyExtractor: (item: { id: string }) => item.id,
          ...props,
        }),
      ),
    ),
  );
  if (root === null) throw new Error('the list did not mount');
  return live.findLive(root, node => node.viewName === 'RCTScrollView');
}

function enteringCancelled(): boolean {
  return update.mock.calls.some(([, type, config]) => {
    return type === LayoutAnimationType.ENTERING && config === undefined;
  });
}

describe('Animated.FlatList', () => {
  it('is the component the default export carries', () => {
    expect(Animated.FlatList).toBe(AnimatedFlatList);
  });

  it('asks its scroll view for an event every frame, as the author expects', () => {
    const scroller = scrollerOf({});

    expect(scroller?.payload.scrollEventThrottle).toBe(1);
  });

  it('leaves the scroll event throttle the author chose alone', () => {
    const scroller = scrollerOf({ scrollEventThrottle: 16 });

    expect(scroller?.payload.scrollEventThrottle).toBe(16);
  });

  it('lets the rows animate in when the author does not say otherwise', () => {
    scrollerOf({});

    expect(enteringCancelled()).toBe(false);
  });

  it('skips the entering animation of the rows it mounts with when asked to', () => {
    scrollerOf({ skipEnteringExitingAnimations: true });

    expect(enteringCancelled()).toBe(true);
  });
});

describe('Animated.FlatList rows', () => {
  const slide = { build: () => fade };

  function layoutConfigured(): boolean {
    return update.mock.calls.some(([, type, config]) => {
      return type === LayoutAnimationType.LAYOUT && config === fade;
    });
  }

  it('gives every row the layout animation of the list', () => {
    scrollerOf({ itemLayoutAnimation: slide });

    expect(
      update.mock.calls.filter(
        ([, type]) => type === LayoutAnimationType.LAYOUT,
      ),
    ).toHaveLength(DATA.length);
    expect(layoutConfigured()).toBe(true);
  });

  it('gives the rows no layout animation unless the author names one', () => {
    scrollerOf({});

    expect(layoutConfigured()).toBe(false);
  });

  it('styles every row with the style object the author passes', () => {
    const scroller = scrollerOf({
      CellRendererComponentStyle: { opacity: 0.5 },
    });
    const rows = live.findAllLive(
      scroller?.handle ?? live.appRoot(),
      node => node.payload.opacity === 0.5,
    );

    expect(rows).toHaveLength(DATA.length);
  });

  it('asks the style function for the item and the index of each row', () => {
    const asked: Array<{ id: string; index: number }> = [];
    scrollerOf({
      CellRendererComponentStyle: ({
        item,
        index,
      }: {
        item: { id: string };
        index: number;
      }) => {
        asked.push({ id: item.id, index });
        return { opacity: 1 };
      },
    });

    expect(asked).toEqual([
      { id: 'a', index: 0 },
      { id: 'b', index: 1 },
    ]);
  });
});
