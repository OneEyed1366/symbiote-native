// React-driven test proving the canonical scroll-driven animation:
//   onScroll={Animated.event([{nativeEvent:{contentOffset:{y: scrollY}}}])} on a bare
//   `<scroll-view>`, with a child Animated.View whose translateY binds scrollY.
// Reads the committed PAYLOAD off the live tree (createLiveTree over the recording host) — no
// committed Fabric tag is involved, unlike the native-driver twin, so this needed no itest route.
// No simulator.
//
// There is no `Animated.ScrollView` any more and nothing replaced it: the tag takes the handler
// directly, and the engine binds it — `setEventListener` calls `bindAnimatedEvent` for any `on*`
// prop on any host node (`core/engine/src/node.ts`). That was the one animated job a scroll
// wrapper still appeared to hold, and it had already moved.

import { type ReactElement } from 'react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mount, unmount, Animated } from '@symbiote-native/react';
import { AnimatedValueXY } from '@symbiote-native/engine';
import {
  createLiveTree,
  installRecordingFabric,
  type ILiveNode,
} from '@symbiote-native/test-utils';

const fabric = installRecordingFabric();
const live = createLiveTree(fabric);
const ROOT_TAG = 73;

// The committed PAYLOAD, not the authored bag — `transform` is a processed key `fabricProps`
// resolves, not a raw prop the tag carries as-is.
function findByViewName(viewName: string): ILiveNode | undefined {
  return live.findLive(live.appRoot(), n => n.viewName === viewName);
}

function findTransformView(): ILiveNode | undefined {
  return live.findLive(live.appRoot(), n => n.payload.transform !== undefined);
}

// translateY read off a committed view's transform.
function committedTranslateY(node: ILiveNode): number {
  const transform = node.payload.transform;
  if (!Array.isArray(transform)) {
    throw new Error(
      `expected a transform array, got ${JSON.stringify(node.payload)}`,
    );
  }
  for (const entry of transform) {
    if (typeof entry === 'object' && entry !== null) {
      const y = Reflect.get(entry, 'translateY');
      if (typeof y === 'number') return y;
    }
  }
  throw new Error(
    `no translateY in committed transform ${JSON.stringify(transform)}`,
  );
}

beforeEach(() => fabric.reset());
afterEach(() => unmount(ROOT_TAG));

describe('Animated scroll-driven animation', () => {
  it('mounts a <scroll-view> and drives the bound translateY from a scroll event', async () => {
    const scrollY = new Animated.Value(0);
    // The canonical handler, held by reference so the test can fire it the way the native scroll
    // event would. onScroll is registered through React's event system, not committed as a prop.
    const onScroll = Animated.event([
      { nativeEvent: { contentOffset: { y: scrollY } } },
    ]);

    function App(): ReactElement {
      return (
        <scroll-view onScroll={onScroll} scrollEventThrottle={16}>
          <Animated.View style={{ transform: [{ translateY: scrollY }] }} />
        </scroll-view>
      );
    }

    mount(ROOT_TAG, <App />);

    // The tag committed its native scroll node — an `Animated.event` handler must not stop the
    // element being an ordinary scroll view.
    expect(findByViewName('RCTScrollView')).toBeDefined();

    // The bound view (the leaf RCTView carrying the transform) paints at the initial value.
    const boundViewBefore = findTransformView();
    expect(boundViewBefore).toBeDefined();
    expect(committedTranslateY(boundViewBefore!)).toBe(0);

    // firing onScroll drives scrollY -> re-paints translateY
    onScroll({ nativeEvent: { contentOffset: { y: 88, x: 0 } } });
    // setNativeProps queues; the frame reaches Fabric at the microtask boundary
    // (core/engine/src/imperative.ts), same as the setValue path in animated-component.test.tsx.
    await Promise.resolve();

    const boundViewAfter = findTransformView();
    expect(boundViewAfter).toBeDefined();
    expect(committedTranslateY(boundViewAfter!)).toBe(88);
  });

  it('AnimatedValueXY.getTranslateTransform yields the live x/y values', () => {
    const xy = new AnimatedValueXY({ x: 3, y: 7 });
    const transform = xy.getTranslateTransform();
    expect(transform).toHaveLength(2);
    expect(transform[0].translateX).toBe(xy.x);
    expect(transform[1].translateY).toBe(xy.y);
    expect(transform[0].translateX.__getValue()).toBe(3);
    expect(transform[1].translateY.__getValue()).toBe(7);
    xy.setValue({ x: 30, y: 70 });
    expect(transform[1].translateY.__getValue()).toBe(70);
  });
});
