// Порт групп с `onScroll` из `Animated-itest` на C++ `NativeAnimatedModule` из RN
// @symbiote-fabric-flags {"useSharedAnimatedBackend":"*"}

import { createElement, useState } from 'react';

import { Animated } from '@symbiote-native/react';

import {
  directTransformValue,
  expectCloseTo,
  useNativeAnimated,
  viewByTestId,
} from './animated-fixture';
import {
  createRoot,
  render,
  runTask,
  scrollToY,
  view,
} from './culling-fixture';
import {
  beforeEach,
  describe,
  expect,
  getBoundingClientRect,
  it,
  report,
  runWorkLoop,
} from './harness';

useNativeAnimated();

const BOX = 'box';

function scrollDrivenTree(scroll: Animated.Value, mountBox = true) {
  return view(
    { style: { flex: 1 } },
    mountBox
      ? createElement(Animated.View, {
          testID: BOX,
          style: {
            position: 'absolute',
            width: 10,
            height: 10,
            transform: [{ translateY: scroll }],
          },
        })
      : null,
    createElement(
      'scroll-view',
      {
        onScroll: Animated.event(
          [{ nativeEvent: { contentOffset: { y: scroll } } }],
          { useNativeDriver: true },
        ),
      },
      view({ style: { height: 1_000, width: 100 } }),
    ),
  );
}

describe('animation driven by onScroll', () => {
  beforeEach(() => createRoot(100, 100));

  it('moves the box with the scroll offset', () => {
    const scroll = new Animated.Value(0);
    render(scrollDrivenTree(scroll));
    const box = viewByTestId(BOX).tag;

    scrollToY(100);

    expectCloseTo(directTransformValue(box, 'translateY'), 100);
    // The shadow tree is not synchronised yet
    expect(getBoundingClientRect(box).y).toBe(0);
    runWorkLoop();
    expect(getBoundingClientRect(box).y).toBe(100);
  });

  it('survives the animated view being unmounted', () => {
    function App(props: { mountBox: boolean }) {
      const [scroll] = useState(() => new Animated.Value(0));
      return scrollDrivenTree(scroll, props.mountBox);
    }
    render(createElement(App, { mountBox: true }));
    render(createElement(App, { mountBox: false }));

    scrollToY(50);
    runWorkLoop();
  });
});

describe('Value.flattenOffset', () => {
  beforeEach(() => createRoot(100, 100));

  it('accumulates offset with onScroll value', () => {
    const scroll = new Animated.Value(0);
    render(scrollDrivenTree(scroll));
    const box = viewByTestId(BOX).tag;
    const seen: unknown[] = [];
    runTask(() => {
      scroll.addListener((value: unknown) => seen.push(value));
    });

    scrollToY(10);
    expect(seen).toEqual([{ value: 10 }]);

    runTask(() => {
      scroll.setOffset(15);
      scroll.flattenOffset();
    });
    expect(seen.length).toBe(1);

    runTask(() => {
      scroll.setOffset(15);
    });
    expect(seen.length).toBe(1);

    expectCloseTo(directTransformValue(box, 'translateY'), 40);
  });
});

describe('Value.extractOffset', () => {
  beforeEach(() => createRoot(100, 100));

  it('sets the offset value to the base value and resets the base value to zero', () => {
    const scroll = new Animated.Value(0);
    render(scrollDrivenTree(scroll));
    const box = viewByTestId(BOX).tag;
    const seen: unknown[] = [];
    runTask(() => {
      scroll.addListener((value: unknown) => seen.push(value));
    });

    scrollToY(10);
    expect(seen).toEqual([{ value: 10 }]);

    runTask(() => {
      scroll.setOffset(15);
      // Offset becomes 15 + 10 = 25, not observable from JS
      scroll.extractOffset();
    });
    expect(seen.length).toBe(1);
    // The value is 0 again, the offset 25
    expectCloseTo(directTransformValue(box, 'translateY'), 25);

    runTask(() => {
      // Overrides the previous offset, and the base value restarted at 0
      scroll.setOffset(35);
    });
    expect(seen.length).toBe(1);
    expectCloseTo(directTransformValue(box, 'translateY'), 35);
  });
});

report();
