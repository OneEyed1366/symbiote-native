// Порт `AnimatedBackend-itest`: общий backend анимаций, перерисовка поверх идущей анимации
// @symbiote-fabric-flags {"useSharedAnimatedBackend":true}
// @symbiote-fabric-flags {"updateRuntimeShadowNodeReferencesOnCommitThread":"*"}

import {
  Fragment,
  createElement,
  memo,
  useEffect,
  useMemo,
  useState,
} from 'react';

import { Animated } from '@symbiote-native/react';

import { renderedOutput, useNativeAnimated } from './animated-fixture';
import { createRoot, render, runTask, view } from './culling-fixture';
import {
  beforeEach,
  describe,
  expect,
  getDirectManipulationProps,
  it,
  produceFramesForDuration,
  report,
} from './harness';
import { viewByTestId } from './animated-fixture';

useNativeAnimated();

type IRunning = { start(): void; stop(): void };

function timing(value: Animated.Value, toValue: number, duration: number) {
  return Animated.timing(value, { toValue, duration, useNativeDriver: true });
}

describe('animated backend', () => {
  beforeEach(() => createRoot(100, 100));

  it('animates layout props and rerenders', () => {
    let height: Animated.Value | undefined;
    let setWidth: ((width: number) => void) | undefined;
    let animation: IRunning | undefined;

    function App() {
      const [animatedHeight] = useState(() => new Animated.Value(0));
      const [width, setCurrentWidth] = useState(100);
      height = animatedHeight;
      setWidth = setCurrentWidth;
      return createElement(Animated.View, {
        style: [{ width, height: animatedHeight }],
      });
    }
    render(createElement(App));

    runTask(() => {
      if (height === undefined) throw new Error('no animated height');
      animation = timing(height, 100, 1_000);
      animation.start();
    });
    produceFramesForDuration(500);
    expect(renderedOutput(['height', 'width'])).toBe(
      '<rn-view height="50" width="100" />',
    );

    runTask(() => setWidth?.(200));
    expect(renderedOutput(['height', 'width'])).toBe(
      '<rn-view height="50" width="200" />',
    );

    produceFramesForDuration(500);
    // Upstream stops it by hand, the animation should end on its own after the duration
    runTask(() => animation?.stop());
    expect(renderedOutput(['height', 'width'])).toBe(
      '<rn-view height="100" width="200" />',
    );

    runTask(() => setWidth?.(300));
    expect(renderedOutput(['height', 'width'])).toBe(
      '<rn-view height="100" width="300" />',
    );
  });

  it('animates non-layout props and rerenders', () => {
    let opacity: Animated.Value | undefined;
    let setWidth: ((width: number) => void) | undefined;
    let animation: IRunning | undefined;

    function App() {
      const [animatedOpacity] = useState(() => new Animated.Value(0));
      const [width, setCurrentWidth] = useState(100);
      opacity = animatedOpacity;
      setWidth = setCurrentWidth;
      return createElement(Animated.View, {
        testID: 'box',
        style: [{ width, opacity: animatedOpacity }],
      });
    }
    render(createElement(App));
    const tag = viewByTestId('box').tag;

    runTask(() => {
      if (opacity === undefined) throw new Error('no animated opacity');
      animation = timing(opacity, 0.5, 1_000);
      animation.start();
    });
    produceFramesForDuration(500);

    // A synchronous update is not in the committed tree, upstream notes the same
    expect(renderedOutput(['width'])).toBe('<rn-view width="100" />');
    const halfway = getDirectManipulationProps(tag).opacity;
    expect(typeof halfway === 'number' && Math.abs(halfway - 0.25) < 0.5).toBe(
      true,
    );

    runTask(() => setWidth?.(150));
    expect(renderedOutput(['opacity', 'width'])).toBe(
      '<rn-view opacity="0.25" width="150" />',
    );

    runTask(() => setWidth?.(200));
    expect(renderedOutput(['opacity', 'width'])).toBe(
      '<rn-view opacity="0.25" width="200" />',
    );

    produceFramesForDuration(500);
    runTask(() => animation?.stop());

    // Upstream T246961305: the output should carry opacity 1 here
    expect(renderedOutput(['width'])).toBe('<rn-view width="200" />');
    expect(getDirectManipulationProps(tag).opacity).toBe(0.5);

    runTask(() => setWidth?.(300));
    expect(renderedOutput(['opacity', 'width'])).toBe(
      '<rn-view opacity="0.5" width="300" />',
    );
  });

  it('animates layout props and rerenders in many components', () => {
    const count = 100;
    let height: Animated.Value | undefined;
    let setWidth: ((width: number) => void) | undefined;
    let animation: IRunning | undefined;

    function Child() {
      const [animatedHeight] = useState(() => new Animated.Value(0));
      useEffect(() => {
        timing(animatedHeight, 100, 1_000).start();
      });
      return createElement(Animated.View, {
        style: [{ width: 100, height: animatedHeight }],
      });
    }

    function App() {
      const [animatedHeight] = useState(() => new Animated.Value(0));
      const [width, setCurrentWidth] = useState(100);
      height = animatedHeight;
      setWidth = setCurrentWidth;
      return createElement(
        Animated.View,
        { style: [{ width, height: animatedHeight }] },
        ...Array.from({ length: count }, (_, index) =>
          createElement(Child, { key: index }),
        ),
      );
    }
    render(createElement(App));

    runTask(() => {
      if (height === undefined) throw new Error('no animated height');
      animation = timing(height, 100, 1_000);
      animation.start();
    });
    produceFramesForDuration(500);
    const child = '<rn-view height="50" width="100" />'.repeat(count);
    expect(renderedOutput(['height', 'width'])).toBe(
      `<rn-view height="50" width="100">${child}</rn-view>`,
    );

    runTask(() => setWidth?.(200));
    runTask(() => animation?.stop());
    expect(renderedOutput(['height', 'width'])).toBe(
      `<rn-view height="50" width="200">${child}</rn-view>`,
    );
  });

  it('animates width, height and opacity at once', () => {
    const width = new Animated.Value(100);
    const height = new Animated.Value(100);
    const opacity = new Animated.Value(1);
    render(
      createElement(Animated.View, {
        style: [{ width, height, opacity }],
      }),
    );

    let animation: IRunning | undefined;
    runTask(() => {
      animation = Animated.parallel([
        timing(width, 200, 100),
        timing(height, 200, 100),
        timing(opacity, 0.5, 100),
      ]);
      animation.start();
    });
    produceFramesForDuration(100);
    runTask(() => animation?.stop());

    expect(renderedOutput(['width', 'height', 'opacity'])).toBe(
      '<rn-view height="200" opacity="0.5" width="200" />',
    );
  });

  it('animates width with memo and rerender', () => {
    let widthAnimation: IRunning | undefined;
    let setState: ((update: (state: number) => number) => void) | undefined;

    function useAnimation(): Animated.Value {
      const [animatedValue] = useState(() => new Animated.Value(100));
      useEffect(() => {
        const animation = timing(animatedValue, 200, 1_000);
        widthAnimation = animation;
        animation.start();
        return () => animation.stop();
      }, [animatedValue]);
      return animatedValue;
    }

    const AnimatedComponent = memo(function AnimatedComponent() {
      const animatedValue = useAnimation();
      const animatedStyle = useMemo(
        () => ({ width: animatedValue }),
        [animatedValue],
      );
      return createElement(Animated.View, {
        style: [{ backgroundColor: 'green', height: 100 }, animatedStyle],
      });
    });

    function App() {
      const [state, setCurrentState] = useState(0);
      setState = setCurrentState;
      return createElement(
        Fragment,
        null,
        view({ key: state }),
        createElement(AnimatedComponent),
      );
    }
    render(createElement(App));

    expect(renderedOutput(['width', 'height'])).toBe(
      '<rn-view height="100" width="100" />',
    );

    produceFramesForDuration(1_000);
    runTask(() => widthAnimation?.stop());
    expect(renderedOutput(['width'])).toBe('<rn-view width="200" />');

    // A rerender after the animation ended must not overwrite its state
    runTask(() => setState?.(current => 1 - current));
    expect(renderedOutput(['width'])).toBe('<rn-view width="200" />');
  });
});

report();
