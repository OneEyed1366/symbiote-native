import { createLiveTree } from '@symbiote-native/test-utils';
import { mount, unmount } from '@symbiote-native/vue';
import { h, nextTick } from '@vue/runtime-core';
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
const ROOT_TAG = 16_801;
const update = vi.mocked(updateLayoutAnimations);

beforeEach(() => {
  update.mockClear();
  host.fabric.reset();
});
afterEach(() => unmount(ROOT_TAG));

const fade = () => ({ animations: {}, initialValues: {}, callback: undefined });
const DATA = [{ id: 'a' }, { id: 'b' }];

async function scrollerOf(props: object) {
  mount(ROOT_TAG, {
    render: () =>
      h(
        AnimatedFlatList,
        {
          data: DATA,
          keyExtractor: (item: { id: string }) => item.id,
          ...props,
        },
        { item: () => h(View, { entering: fade }) },
      ),
  });
  await nextTick();
  const [found] = host.fabric.findAll(
    node => node.viewName === 'RCTScrollView',
  );
  if (found === undefined) throw new Error('the list did not mount');
  return live.nodeOf(found.handle);
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

  it('asks its scroll view for an event every frame, as the author expects', async () => {
    const scroller = await scrollerOf({});

    expect(scroller.payload.scrollEventThrottle).toBe(1);
  });

  it('leaves the scroll event throttle the author chose alone', async () => {
    const scroller = await scrollerOf({ scrollEventThrottle: 16 });

    expect(scroller.payload.scrollEventThrottle).toBe(16);
  });

  it('lets the rows animate in when the author does not say otherwise', async () => {
    await scrollerOf({});

    expect(enteringCancelled()).toBe(false);
  });

  it('skips the entering animation of the rows it mounts with when asked to', async () => {
    await scrollerOf({ skipEnteringExitingAnimations: true });

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

  it('gives every row the layout animation of the list', async () => {
    await scrollerOf({ itemLayoutAnimation: slide });

    expect(
      update.mock.calls.filter(
        ([, type]) => type === LayoutAnimationType.LAYOUT,
      ),
    ).toHaveLength(DATA.length);
    expect(layoutConfigured()).toBe(true);
  });

  it('gives the rows no layout animation unless the author names one', async () => {
    await scrollerOf({});

    expect(layoutConfigured()).toBe(false);
  });

  it('styles every row with the style object the author passes', async () => {
    const scroller = await scrollerOf({
      cellRendererComponentStyle: { opacity: 0.5 },
    });
    const rows = live.findAllLive(
      scroller.handle,
      node => node.payload.opacity === 0.5,
    );

    expect(rows).toHaveLength(DATA.length);
  });

  it('asks the style function for the item and the index of each row', async () => {
    const asked: Array<{ id: string; index: number }> = [];
    await scrollerOf({
      cellRendererComponentStyle: ({
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
