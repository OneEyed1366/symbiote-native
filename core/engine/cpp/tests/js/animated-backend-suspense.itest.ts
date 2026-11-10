// Порт `AnimatedBackendSuspense-itest`: анимация переживает Suspense и заморозку компонента
// @symbiote-fabric-flags {"useSharedAnimatedBackend":true}
// @symbiote-fabric-flags {"updateRuntimeShadowNodeReferencesOnCommitThread":"*"}

import {
  Suspense,
  createElement,
  use,
  useState,
  type ReactElement,
  type ReactNode,
} from 'react';

import { Animated } from '@symbiote-native/react';
import { Easing } from '@symbiote-native/engine';

import { renderedOutput, useNativeAnimated } from './animated-fixture';
import {
  createRoot,
  render,
  renderInTransition,
  runTask,
  view,
} from './culling-fixture';
import {
  beforeEach,
  describe,
  expect,
  it,
  produceFramesForDuration,
  report,
} from './harness';

useNativeAnimated();

type IRunning = { start(): void; stop(): void };

const KEYS = ['width', 'nativeID'];

function output(): string {
  return renderedOutput(KEYS);
}

function fallback(nativeID = 'suspense-fallback'): ReactElement {
  return view({ nativeID });
}

function linearWidth(width: Animated.Value, toValue: number, duration: number) {
  return Animated.timing(width, {
    toValue,
    duration,
    easing: Easing.linear,
    useNativeDriver: true,
  });
}

// Data behind a promise the test resolves by hand, the suspending read `use` takes
function createDataCache() {
  let resolvePromise: (() => void) | null = null;
  const cache = new Map<string, string>();

  async function fetchData(key: string): Promise<string> {
    await new Promise<void>(resolve => {
      resolvePromise = resolve;
    });
    const data = `data-${key}`;
    cache.set(key, data);
    return data;
  }

  function useData(key: string): string {
    return cache.get(key) ?? use(fetchData(key));
  }

  function SuspendingChild(props: { dataKey: string }): ReactElement {
    return view({ nativeID: useData(props.dataKey) });
  }

  // Resolves the pending fetch, then lets the promise chain and React's retry run
  async function resolveNext(): Promise<void> {
    expect(resolvePromise === null).toBe(false);
    runTask(() => {
      resolvePromise?.();
      resolvePromise = null;
    });
    await new Promise<void>(resolve => setTimeout(resolve, 0));
    runTask(() => {});
  }

  return { SuspendingChild, useData, resolveNext };
}

// react-freeze: a boundary that throws a promise which never settles hides what is below it
const freezePromise: Promise<void> = new Promise(() => {});

function Freeze(props: { freeze: boolean; children: ReactNode }): ReactNode {
  if (props.freeze) throw freezePromise;
  return props.children;
}

type IWidthSink = (width: Animated.Value) => void;

function AnimatedChild(props: { onAnimatedWidth: IWidthSink }): ReactElement {
  const [animatedWidth] = useState(() => new Animated.Value(0));
  props.onAnimatedWidth(animatedWidth);
  return createElement(Animated.View, {
    style: { width: animatedWidth, height: 100 },
    nativeID: 'animated-child',
  });
}

function frozenApp(frozen: boolean, onAnimatedWidth: IWidthSink): ReactElement {
  return createElement(
    Suspense,
    { fallback: fallback('frozen-fallback') },
    createElement(
      Freeze,
      { freeze: frozen },
      createElement(AnimatedChild, { onAnimatedWidth }),
    ),
  );
}

describe('animated backend with Suspense', () => {
  beforeEach(() => createRoot(100, 100));

  it('keeps the animation state after Suspense', async () => {
    let width: Animated.Value | undefined;
    let animation: IRunning | undefined;
    const { SuspendingChild, resolveNext } = createDataCache();

    function App(props: { dataKey: string }): ReactElement {
      const [animatedWidth] = useState(() => new Animated.Value(0));
      width = animatedWidth;
      return createElement(
        Animated.View,
        { style: [{ width: animatedWidth, height: 100 }] },
        createElement(
          Suspense,
          { fallback: fallback() },
          createElement(SuspendingChild, { dataKey: props.dataKey }),
        ),
      );
    }

    render(createElement(App, { dataKey: 'first' }));
    expect(output()).toBe(
      '<rn-view width="0"><rn-view nativeID="suspense-fallback" /></rn-view>',
    );

    await resolveNext();
    expect(output()).toBe(
      '<rn-view width="0"><rn-view nativeID="data-first" /></rn-view>',
    );

    runTask(() => {
      if (width === undefined) throw new Error('no animated width');
      animation = linearWidth(width, 100, 1_000);
      animation.start();
    });
    produceFramesForDuration(500);
    expect(output()).toBe(
      '<rn-view width="50"><rn-view nativeID="data-first" /></rn-view>',
    );

    // A transition that suspends keeps the stale UI on screen
    renderInTransition(createElement(App, { dataKey: 'second' }));
    expect(output()).toBe(
      '<rn-view width="50"><rn-view nativeID="data-first" /></rn-view>',
    );

    produceFramesForDuration(250);
    expect(output()).toBe(
      '<rn-view width="75"><rn-view nativeID="data-first" /></rn-view>',
    );

    await resolveNext();
    expect(output()).toBe(
      '<rn-view width="75"><rn-view nativeID="data-second" /></rn-view>',
    );

    produceFramesForDuration(250);
    runTask(() => animation?.stop());
    expect(output()).toBe(
      '<rn-view width="100"><rn-view nativeID="data-second" /></rn-view>',
    );
  });

  it('continues on an animated component during a suspenseful transition', async () => {
    let width: Animated.Value | undefined;
    let animation: IRunning | undefined;
    const { useData, resolveNext } = createDataCache();

    function AnimatedSuspendingChild(props: { dataKey: string }): ReactElement {
      const [animatedWidth] = useState(() => new Animated.Value(0));
      width = animatedWidth;
      return createElement(Animated.View, {
        style: { width: animatedWidth, height: 100 },
        nativeID: useData(props.dataKey),
      });
    }

    function App(props: { dataKey: string }): ReactElement {
      return createElement(
        Suspense,
        { fallback: fallback() },
        createElement(AnimatedSuspendingChild, { dataKey: props.dataKey }),
      );
    }

    render(createElement(App, { dataKey: 'first' }));
    expect(output()).toBe('<rn-view nativeID="suspense-fallback" />');

    await resolveNext();
    expect(output()).toBe('<rn-view nativeID="data-first" width="0" />');

    runTask(() => {
      if (width === undefined) throw new Error('no animated width');
      animation = linearWidth(width, 100, 1_000);
      animation.start();
    });
    produceFramesForDuration(500);
    expect(output()).toBe('<rn-view nativeID="data-first" width="50" />');

    renderInTransition(createElement(App, { dataKey: 'second' }));
    expect(output()).toBe('<rn-view nativeID="data-first" width="50" />');

    produceFramesForDuration(250);
    expect(output()).toBe('<rn-view nativeID="data-first" width="75" />');

    await resolveNext();
    expect(output()).toBe('<rn-view nativeID="data-second" width="75" />');

    produceFramesForDuration(250);
    runTask(() => animation?.stop());
    expect(output()).toBe('<rn-view nativeID="data-second" width="100" />');
  });

  it('continues after the component is frozen and unfrozen', () => {
    let width: Animated.Value | undefined;
    let animation: IRunning | undefined;
    const keep: IWidthSink = value => {
      width = value;
    };

    render(frozenApp(false, keep));
    expect(output()).toBe('<rn-view nativeID="animated-child" width="0" />');

    runTask(() => {
      if (width === undefined) throw new Error('no animated width');
      animation = linearWidth(width, 100, 1_000);
      animation.start();
    });
    produceFramesForDuration(250);
    expect(output()).toBe('<rn-view nativeID="animated-child" width="25" />');

    render(frozenApp(true, keep));
    expect(output()).toBe('<rn-view nativeID="frozen-fallback" />');

    // The animation runs on while frozen
    produceFramesForDuration(250);
    expect(output()).toBe('<rn-view nativeID="frozen-fallback" />');

    render(frozenApp(false, keep));
    expect(output()).toBe('<rn-view nativeID="animated-child" width="50" />');

    produceFramesForDuration(500);
    runTask(() => animation?.stop());
    expect(output()).toBe('<rn-view nativeID="animated-child" width="100" />');
  });

  it('continues after several freeze and unfreeze cycles', () => {
    let width: Animated.Value | undefined;
    let animation: IRunning | undefined;
    const keep: IWidthSink = value => {
      width = value;
    };
    const child = (current: number): string =>
      `<rn-view nativeID="animated-child" width="${current}" />`;

    render(frozenApp(false, keep));
    expect(output()).toBe(child(0));

    runTask(() => {
      if (width === undefined) throw new Error('no animated width');
      animation = linearWidth(width, 100, 2_000);
      animation.start();
    });
    produceFramesForDuration(200);
    expect(output()).toBe(child(10));

    render(frozenApp(true, keep));
    expect(output()).toBe('<rn-view nativeID="frozen-fallback" />');
    produceFramesForDuration(200);

    render(frozenApp(false, keep));
    expect(output()).toBe(child(20));
    produceFramesForDuration(200);
    expect(output()).toBe(child(30));

    render(frozenApp(true, keep));
    expect(output()).toBe('<rn-view nativeID="frozen-fallback" />');
    produceFramesForDuration(400);

    render(frozenApp(false, keep));
    expect(output()).toBe(child(50));

    // A quick freeze and unfreeze
    render(frozenApp(true, keep));
    produceFramesForDuration(100);
    render(frozenApp(false, keep));
    expect(output()).toBe(child(55));

    produceFramesForDuration(900);
    runTask(() => animation?.stop());
    expect(output()).toBe(child(100));
  });

  it('keeps the final state when unfrozen after the animation completes', () => {
    let width: Animated.Value | undefined;
    let animation: IRunning | undefined;
    const keep: IWidthSink = value => {
      width = value;
    };

    render(frozenApp(false, keep));
    expect(output()).toBe('<rn-view nativeID="animated-child" width="0" />');

    runTask(() => {
      if (width === undefined) throw new Error('no animated width');
      animation = linearWidth(width, 100, 1_000);
      animation.start();
    });
    produceFramesForDuration(200);
    expect(output()).toBe('<rn-view nativeID="animated-child" width="20" />');

    render(frozenApp(true, keep));
    expect(output()).toBe('<rn-view nativeID="frozen-fallback" />');

    // The animation completes while frozen
    produceFramesForDuration(1_000);
    runTask(() => animation?.stop());
    expect(output()).toBe('<rn-view nativeID="frozen-fallback" />');

    render(frozenApp(false, keep));
    expect(output()).toBe('<rn-view nativeID="animated-child" width="100" />');
  });
});

report();
