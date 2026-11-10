// Порт `Animated-itest` с нативным драйвером на C++ `NativeAnimatedModule` из RN
// @symbiote-fabric-flags {"useSharedAnimatedBackend":"*"}

import { createElement, useState } from 'react';

import { Animated } from '@symbiote-native/react';

import {
  directTransformValue,
  expectCloseTo,
  useNativeAnimated,
  viewByTestId,
} from './animated-fixture';
import { createRoot, render, runTask } from './culling-fixture';
import {
  beforeEach,
  describe,
  expect,
  getBoundingClientRect,
  getDirectManipulationProps,
  getFabricUpdateProps,
  it,
  produceFramesForDuration,
  report,
  runWorkLoop,
  usesSharedAnimatedBackend,
} from './harness';

useNativeAnimated();

const BOX = 'box';

function translatedBox(translateX: Animated.Value) {
  return createElement(Animated.View, {
    testID: BOX,
    style: [{ width: 100, height: 100 }, { transform: [{ translateX }] }],
  });
}

function boxTag(): number {
  return viewByTestId(BOX).tag;
}

function committedProp(key: string): string | undefined {
  return viewByTestId(BOX).props[key];
}

describe('native driver on the C++ animated module', () => {
  beforeEach(() => createRoot(100, 100));

  it('moves a box by 100 points', () => {
    const translateX = new Animated.Value(0);
    render(translatedBox(translateX));
    const tag = boxTag();

    expect(getBoundingClientRect(tag).x).toBe(0);

    runTask(() => {
      Animated.timing(translateX, {
        toValue: 100,
        duration: 1_000,
        useNativeDriver: true,
      }).start();
    });
    produceFramesForDuration(500);

    // The shadow tree is not synchronised yet, direct manipulation has the 50% frame
    expect(getBoundingClientRect(tag).x).toBe(0);
    expectCloseTo(directTransformValue(tag, 'translateX'), 50);

    produceFramesForDuration(500);
    runWorkLoop();

    expect(getBoundingClientRect(tag).x).toBe(100);
  });

  it('animates opacity', () => {
    const opacity = new Animated.Value(1);
    render(
      createElement(Animated.View, {
        testID: BOX,
        style: [{ width: 100, height: 100, opacity }],
      }),
    );
    const tag = boxTag();

    expect(getBoundingClientRect(tag).x).toBe(0);

    let animation: { start(): void; stop(): void } | undefined;
    runTask(() => {
      animation = Animated.timing(opacity, {
        toValue: 0,
        duration: 30,
        useNativeDriver: true,
      });
      animation.start();
    });
    produceFramesForDuration(30);
    expect(getDirectManipulationProps(tag).opacity).toBe(0);

    // Upstream stops it by hand, the animation should end on its own after the duration
    runTask(() => animation?.stop());

    expect(committedProp('opacity')).toBe('0');
  });

  it('moves a box by 50 points with offset 10', () => {
    const translateX = new Animated.Value(0);
    render(translatedBox(translateX));
    const tag = boxTag();

    expect(getBoundingClientRect(tag).x).toBe(0);

    let finished: {
      finished: boolean;
      value?: number;
      offset?: number;
    } | null = null;
    runTask(() => {
      Animated.timing(translateX, {
        toValue: 50,
        duration: 1_000,
        useNativeDriver: true,
      }).start(result => {
        finished = result;
      });
    });
    runTask(() => translateX.setOffset(10));

    produceFramesForDuration(500);
    expect(getBoundingClientRect(tag).x).toBe(0);
    expectCloseTo(directTransformValue(tag, 'translateX'), 35);

    produceFramesForDuration(500);
    expectCloseTo(directTransformValue(tag, 'translateX'), 60);

    runWorkLoop();
    expect(committedProp('transform')).toBe('[{"translateX": 60}]');

    expect(finished).toEqual({ finished: true, value: 50, offset: 10 });
  });

  it('animates layout props', () => {
    const height = new Animated.Value(0);
    render(
      createElement(Animated.View, {
        testID: BOX,
        style: [{ width: 100, height }],
      }),
    );
    const tag = boxTag();

    let animation: { start(): void; stop(): void } | undefined;
    runTask(() => {
      animation = Animated.timing(height, {
        toValue: 100,
        duration: 10,
        useNativeDriver: true,
      });
      animation.start();
    });
    produceFramesForDuration(10);
    runTask(() => animation?.stop());

    // The shared backend pushes no layout updates through direct manipulation or `updateShadowTree`
    if (!usesSharedAnimatedBackend()) {
      expect(getDirectManipulationProps(tag).height).toBe(100);
      expect(getFabricUpdateProps(tag).height).toBe(100);
    }
    expect(committedProp('height')).toBe('100');
  });
});

let interpolatedValueX: Animated.Value | undefined;
let interpolatedValueY: { __getValue(): number } | undefined;

function InterpolatedBox(props: { outputRangeX: number }) {
  const [valueX] = useState(
    () => new Animated.Value(0.5, { useNativeDriver: true }),
  );
  const interpolatedY = valueX.interpolate({
    inputRange: [0, 1],
    outputRange: [props.outputRangeX - 1, 100],
  });
  interpolatedValueX = valueX;
  interpolatedValueY = interpolatedY;
  return createElement(Animated.View, {
    testID: BOX,
    style: [
      { width: 100, height: 100 },
      { transform: [{ translateX: valueX }, { translateY: interpolatedY }] },
    ],
  });
}

describe('AnimatedValue.interpolate', () => {
  beforeEach(() => createRoot(100, 100));

  it('drives two transforms from one value and follows a new output range', () => {
    render(createElement(InterpolatedBox, { outputRangeX: 1 }));
    const tag = boxTag();

    expect(interpolatedValueX?.__getValue()).toBe(0.5);
    expect(interpolatedValueY?.__getValue()).toBe(50);
    expect(JSON.stringify(getDirectManipulationProps(tag).transform)).toBe(
      '[{"translateX":0.5},{"translateY":50}]',
    );
    expect(getBoundingClientRect(tag).x).toBe(0.5);
    expect(getBoundingClientRect(tag).y).toBe(50);

    render(createElement(InterpolatedBox, { outputRangeX: 51 }));

    expect(interpolatedValueX?.__getValue()).toBe(0.5);
    expect(interpolatedValueY?.__getValue()).toBe(75);
    expect(JSON.stringify(getDirectManipulationProps(tag).transform)).toBe(
      '[{"translateX":0.5},{"translateY":75}]',
    );
    expect(getBoundingClientRect(tag).x).toBe(0.5);
    // The shared backend's commit hook overrides this render's value, upstream T248792461
    if (!usesSharedAnimatedBackend()) {
      expect(getBoundingClientRect(tag).y).toBe(75);
    }
  });
});

describe('Animated.sequence', () => {
  beforeEach(() => createRoot(100, 100));

  it('runs the second timing after the first one ends', () => {
    const translateY = new Animated.Value(0);
    let isSequenceFinished = false;
    render(
      createElement(Animated.View, {
        testID: BOX,
        style: [
          { position: 'absolute', width: 100, height: 100 },
          {
            transform: [
              {
                translateY: translateY.interpolate({
                  inputRange: [0, 1],
                  outputRange: [0, -16],
                }),
              },
            ],
          },
        ],
      }),
    );
    const tag = boxTag();

    expect(getBoundingClientRect(tag).y).toBe(0);

    runTask(() => {
      Animated.sequence([
        Animated.timing(translateY, {
          toValue: 1,
          duration: 500,
          useNativeDriver: true,
        }),
        Animated.timing(translateY, {
          toValue: 0,
          duration: 0,
          useNativeDriver: true,
        }),
      ]).start(({ finished }) => {
        if (finished) isSequenceFinished = true;
      });
    });
    produceFramesForDuration(500);
    expectCloseTo(directTransformValue(tag, 'translateY'), -16);

    // The React update that syncs the end state of the first timing
    runWorkLoop();
    expect(isSequenceFinished).toBe(false);
    expectCloseTo(directTransformValue(tag, 'translateY'), 0);

    expect(getBoundingClientRect(tag).y).toBe(-16);
    runWorkLoop();
    expect(getBoundingClientRect(tag).y).toBe(0);
    expect(isSequenceFinished).toBe(true);
  });
});

report();
