// An AnimatedValue written straight into a prop of a BARE TAG — no `Animated.View`, no wrapper, no
// component anywhere. This is the proof that `createAnimatedComponent` has no job left: the engine
// publishes the current value, subscribes, writes each frame through its own targeted commit, and
// releases the subscription when the node leaves the tree.
//
// Every "nothing happened" assertion here is paired with a positive control on the SAME path — an
// animation that stops writing and an animation that never started produce the identical
// observation, and only the control tells them apart.
//
// SPLIT: this file kept the JS-DRIVEN describe plus the one native-event case that never compares
// a real tag either, both on `installRecordingFabric()`. The tag-dependent native-driver/-event
// cases (comparing `connect?.args[1] === viewTag` etc.) genuinely need REAL Fabric tags — under the
// recording host every committed node reads the same `NO_TAG` sentinel, so a tag comparison there
// would pass as a tautology regardless of which view actually got bound — and moved to
// `core/engine/cpp/tests/js/engine-animated-native-driver.itest.ts` (Round 13), the engine-level
// (bare-tag) twin of the adapter-level animated-native-driver/-event itests Rounds 5-6 already
// built.

import { afterEach, describe, expect, it } from 'vitest';
import { installRecordingFabric, payloadOf } from '@symbiote-native/test-utils';
import {
  AnimatedValue,
  AnimatedValueXY,
  appendChild,
  createElement,
  createSurface,
  event,
  removeChild,
  routeProp,
} from '../index';

const fabric = installRecordingFabric();
let nextRootTag = 9700;

afterEach(() => {
  fabric.reset();
});

// A frame lands as `setNativeProps`, which QUEUES its commit on a microtask (commit.ts's batch).
// A bare `await Promise.resolve()` would race it; a macrotask cannot.
const tick = (): Promise<void> =>
  new Promise(resolve => setTimeout(resolve, 0));

function mount(): { surface: ReturnType<typeof createSurface> } {
  const surface = createSurface((nextRootTag += 1));
  return { surface };
}

describe('an animated value in a prop of a bare tag', () => {
  it('publishes the current value at create and rewrites it on every frame', async () => {
    const opacity = new AnimatedValue(0.25);
    const { surface } = mount();
    const view = createElement('RCTView');
    routeProp(view, 'style', { opacity, width: 40 });
    surface.appendChild(view);
    surface.commit();

    // The first paint is concrete: the app never sees an AnimatedNode reach Fabric.
    expect(payloadOf(view).opacity).toBe(0.25);
    expect(payloadOf(view).width).toBe(40);

    opacity.setValue(0.75);
    await tick();

    expect(payloadOf(view).opacity).toBe(0.75);
    // The static half of the same style survives the frame write — a merge, not a replace.
    expect(payloadOf(view).width).toBe(40);
  });

  it('reads an animated entry out of a style ARRAY', async () => {
    const opacity = new AnimatedValue(0);
    const { surface } = mount();
    const view = createElement('RCTView');
    routeProp(view, 'style', [{ width: 12 }, { opacity }]);
    surface.appendChild(view);
    surface.commit();

    expect(payloadOf(view).opacity).toBe(0);
    expect(payloadOf(view).width).toBe(12);

    opacity.setValue(1);
    await tick();
    expect(payloadOf(view).opacity).toBe(1);
  });

  it('reads an animated value written as a TOP-LEVEL prop', async () => {
    const value = new AnimatedValue(3);
    const { surface } = mount();
    const view = createElement('RCTView');
    routeProp(view, 'zIndex', value);
    surface.appendChild(view);
    surface.commit();

    expect(payloadOf(view).zIndex).toBe(3);
    value.setValue(9);
    await tick();
    expect(payloadOf(view).zIndex).toBe(9);
  });

  it('drives both channels of an AnimatedValueXY through a transform', async () => {
    const position = new AnimatedValueXY({ x: 0, y: 0 });
    const { surface } = mount();
    const view = createElement('RCTView');
    routeProp(view, 'style', { transform: position.getTranslateTransform() });
    surface.appendChild(view);
    surface.commit();

    expect(payloadOf(view).transform).toEqual([
      { translateX: 0 },
      { translateY: 0 },
    ]);

    position.setValue({ x: 5, y: 6 });
    await tick();
    expect(payloadOf(view).transform).toEqual([
      { translateX: 5 },
      { translateY: 6 },
    ]);
  });

  it('resolves an interpolation, not just a raw value', async () => {
    const progress = new AnimatedValue(0);
    const { surface } = mount();
    const view = createElement('RCTView');
    routeProp(view, 'style', {
      width: progress.interpolate({
        inputRange: [0, 1],
        outputRange: [10, 110],
      }),
    });
    surface.appendChild(view);
    surface.commit();

    expect(payloadOf(view).width).toBe(10);
    progress.setValue(0.5);
    await tick();
    expect(payloadOf(view).width).toBe(60);
  });

  it('marks an animated node uncollapsable, and leaves a plain node alone', () => {
    const opacity = new AnimatedValue(1);
    const { surface } = mount();
    const animated = createElement('RCTView');
    const plain = createElement('RCTView');
    routeProp(animated, 'style', { opacity });
    routeProp(plain, 'style', { opacity: 1 });
    surface.appendChild(animated);
    surface.appendChild(plain);
    surface.commit();

    // Fabric flattens a view whose props do not require one, and a flattened view has no tag for
    // the native driver to bind to.
    expect(payloadOf(animated).collapsable).toBe(false);
    // The control: without it, a `collapsable` written on every node would pass the line above.
    expect(payloadOf(plain).collapsable).toBeUndefined();
  });

  it('releases the subscription when the node leaves the tree', async () => {
    const opacity = new AnimatedValue(0);
    const { surface } = mount();
    const root = createElement('RCTView');
    const view = createElement('RCTView');
    appendChild(root, view);
    routeProp(view, 'style', { opacity });
    surface.appendChild(root);
    surface.commit();

    // The positive control for every assertion below: while mounted, the value drives the node.
    expect(opacity.__getChildren()).toHaveLength(1);
    opacity.setValue(0.5);
    await tick();
    expect(payloadOf(view).opacity).toBe(0.5);

    removeChild(root, view);
    surface.commit();

    expect(opacity.__getChildren()).toHaveLength(0);
    // And the frame that would have been written now writes nothing — read the AUTHORED prop
    // directly rather than a stale committed snapshot, since the node no longer has a parent to
    // walk from through the recording host's own tree accessors.
    opacity.setValue(0.9);
    await tick();
    expect(payloadOf(view).opacity).toBe(0.5);
  });

  it('re-arms a subtree the sweep tore down and the framework put back', async () => {
    const opacity = new AnimatedValue(0);
    const { surface } = mount();
    const root = createElement('RCTView');
    const parkable = createElement('RCTView');
    const view = createElement('RCTView');
    appendChild(parkable, view);
    routeProp(view, 'style', { opacity });
    appendChild(root, parkable);
    surface.appendChild(root);
    surface.commit();

    // Park the whole subtree, exactly as Svelte's `{#if}` does, then bring it back with no prop
    // write of its own.
    removeChild(root, parkable);
    surface.commit();
    expect(opacity.__getChildren()).toHaveLength(0);

    appendChild(root, parkable);
    surface.commit();
    expect(opacity.__getChildren()).toHaveLength(1);

    opacity.setValue(0.4);
    await tick();
    expect(payloadOf(view).opacity).toBe(0.4);
  });

  it('drops a prop that stops being animated', async () => {
    const opacity = new AnimatedValue(0);
    const { surface } = mount();
    const view = createElement('RCTView');
    routeProp(view, 'style', { opacity });
    surface.appendChild(view);
    surface.commit();

    // Control: the binding is live before the plain write.
    expect(opacity.__getChildren()).toHaveLength(1);

    routeProp(view, 'style', { opacity: 0.2 });
    surface.commit();
    expect(payloadOf(view).opacity).toBe(0.2);
    expect(opacity.__getChildren()).toHaveLength(0);

    opacity.setValue(1);
    await tick();
    expect(payloadOf(view).opacity).toBe(0.2);
  });
});

describe('a native-driven Animated.event on a bare tag — the JS-driven control', () => {
  // why: not tag-dependent — no `useNativeDriver`, so the value is driven per event on the JS
  // thread and the native module is never asked for anything. Kept beside the JS-driven describe
  // above rather than the itest twin: this is the negative control for THAT file's positive cases,
  // and it needs no real Fabric tag to be one.
  it('leaves a JS-driven Animated.event alone', async () => {
    const scrollY = new AnimatedValue(0);
    const { surface } = mount();
    const scroller = createElement('RCTScrollView');
    routeProp(scroller, 'style', { top: scrollY });
    // No `useNativeDriver`, so the values are driven per event on the JS thread.
    routeProp(
      scroller,
      'onScroll',
      event([{ nativeEvent: { contentOffset: { y: scrollY } } }]),
    );
    surface.appendChild(scroller);
    surface.commit();

    // The control that makes the claim mean something: the handler is wired and it drives.
    scroller.listeners?.get('scroll')?.({
      type: 'scroll',
      target: scroller,
      currentTarget: scroller,
      nativeEvent: { contentOffset: { y: 42 } },
      stopPropagation: () => undefined,
    });
    await tick();
    expect(payloadOf(scroller).top).toBe(42);
  });
});
