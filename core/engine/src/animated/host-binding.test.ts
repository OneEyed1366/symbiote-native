// An AnimatedNode written straight into a prop of a BARE TAG — no `Animated.View`, no wrapper, no
// component anywhere. This is the proof that `createAnimatedComponent` has no job left: the engine
// publishes the current value, subscribes, writes each frame through its own targeted commit, and
// releases the subscription when the node leaves the tree.
//
// Every "nothing happened" assertion here is paired with a positive control on the SAME path — an
// animation that stops writing and an animation that never started produce the identical
// observation, and only the control tells them apart.

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { installFabric, type IFakeNode } from '@symbiote-native/test-utils';
import {
  AnimatedValue,
  AnimatedValueXY,
  appendChild,
  createElement,
  createSurface,
  event,
  getNativeTag,
  removeChild,
  routeProp,
  type ISymbioteNode,
} from '../index';

const fabric = installFabric();
let nextRootTag = 9700;

interface INativeCall {
  method: string;
  args: readonly unknown[];
}

let nativeCalls: INativeCall[];

function record(method: string): (...args: unknown[]) => void {
  return (...args: unknown[]) => {
    nativeCalls.push({ method, args });
  };
}

// The whole TurboModule surface, recorded. Installed for every test — the JS-driven cases never
// reach it, which is what makes "zero native calls" a meaningful assertion there.
beforeEach(() => {
  nativeCalls = [];
  Object.assign(globalThis, {
    nativeModuleProxy: {
      NativeAnimatedTurboModule: {
        createAnimatedNode: record('createAnimatedNode'),
        connectAnimatedNodes: record('connectAnimatedNodes'),
        disconnectAnimatedNodes: record('disconnectAnimatedNodes'),
        connectAnimatedNodeToView: record('connectAnimatedNodeToView'),
        disconnectAnimatedNodeFromView: record(
          'disconnectAnimatedNodeFromView',
        ),
        restoreDefaultValues: record('restoreDefaultValues'),
        dropAnimatedNode: record('dropAnimatedNode'),
        startAnimatingNode: record('startAnimatingNode'),
        stopAnimation: record('stopAnimation'),
        setAnimatedNodeValue: record('setAnimatedNodeValue'),
        setAnimatedNodeOffset: record('setAnimatedNodeOffset'),
        flattenAnimatedNodeOffset: record('flattenAnimatedNodeOffset'),
        extractAnimatedNodeOffset: record('extractAnimatedNodeOffset'),
        startListeningToAnimatedNodeValue: record('startListening'),
        stopListeningToAnimatedNodeValue: record('stopListening'),
        getValue: record('getValue'),
        addAnimatedEventToView: record('addAnimatedEventToView'),
        removeAnimatedEventFromView: record('removeAnimatedEventFromView'),
      },
    },
  });
});

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

// The COMMITTED payload of a node, found by its Fabric tag rather than by position — a clone keeps
// the tag and replaces the object, so holding a reference would read a stale copy.
function payloadOf(node: ISymbioteNode): Record<string, unknown> {
  const tag = getNativeTag(node);
  let found: Record<string, unknown> | undefined;
  const walk = (nodes: readonly IFakeNode[]): void => {
    for (const candidate of nodes) {
      if (candidate.tag === tag) found = candidate.props;
      walk(candidate.children);
    }
  };
  walk(fabric.committed);
  if (found === undefined) throw new Error('node is not in the committed tree');
  return found;
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
    // JS-driven throughout: nothing was asked of the native module.
    expect(nativeCalls).toHaveLength(0);
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
    const lastPayload = payloadOf(view);

    removeChild(root, view);
    surface.commit();

    expect(opacity.__getChildren()).toHaveLength(0);
    // And the frame that would have been written now writes nothing.
    opacity.setValue(0.9);
    await tick();
    expect(lastPayload.opacity).toBe(0.5);
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

describe('the native driver on a bare tag', () => {
  it('connects the props node to the view tag when the value goes native, and disconnects on removal', () => {
    const opacity = new AnimatedValue(0);
    const { surface } = mount();
    const root = createElement('RCTView');
    const view = createElement('RCTView');
    appendChild(root, view);
    routeProp(view, 'style', { opacity });
    surface.appendChild(root);
    surface.commit();

    const viewTag = getNativeTag(view);
    expect(viewTag).toBeDefined();
    // Control: nothing is native until an animation asks for it.
    expect(
      nativeCalls.filter(call => call.method === 'connectAnimatedNodeToView'),
    ).toHaveLength(0);

    // `useNativeDriver: true` reaches the value as this handshake; the leaf goes native by CASCADE
    // from the value it is a child of, which is the whole reason nothing here forces it.
    opacity.__startNativeAnimation(
      { type: 'frames', frames: [0, 1] },
      1,
      () => {},
    );

    const connect = nativeCalls.find(
      call => call.method === 'connectAnimatedNodeToView',
    );
    expect(connect).toBeDefined();
    // The right view: the props node bound to THIS node's committed Fabric tag.
    expect(connect?.args[1]).toBe(viewTag);
    const propsTag = connect?.args[0];

    removeChild(root, view);
    surface.commit();

    // Torn down against exactly what it connected — a disconnect on the wrong tag leaves native
    // driving a view nobody owns.
    expect(nativeCalls).toContainEqual({
      method: 'disconnectAnimatedNodeFromView',
      args: [propsTag, viewTag],
    });
    expect(nativeCalls).toContainEqual({
      method: 'restoreDefaultValues',
      args: [propsTag],
    });
  });
});

describe('a native-driven Animated.event on a bare tag', () => {
  const scrollMapping = (
    scrollY: AnimatedValue,
  ): ReadonlyArray<{
    nativeEvent: { contentOffset: { y: AnimatedValue } };
  }> => [{ nativeEvent: { contentOffset: { y: scrollY } } }];

  const callsTo = (method: string): INativeCall[] =>
    nativeCalls.filter(call => call.method === method);

  it('registers the mapping against the committed view tag, under the PROP name', () => {
    const scrollY = new AnimatedValue(0);
    const { surface } = mount();
    const scroller = createElement('RCTScrollView');
    routeProp(
      scroller,
      'onScroll',
      event(scrollMapping(scrollY), { useNativeDriver: true }),
    );
    // The prop is written before the node is committed, so there is no Fabric tag to bind to yet.
    // This is the control for the assertion below: it proves the attach came from the commit and
    // not from the prop write.
    expect(callsTo('addAnimatedEventToView')).toHaveLength(0);

    surface.appendChild(scroller);
    surface.commit();

    const viewTag = getNativeTag(scroller);
    expect(viewTag).toBeDefined();
    expect(callsTo('addAnimatedEventToView')).toEqual([
      {
        method: 'addAnimatedEventToView',
        args: [
          viewTag,
          // `onScroll`, not `scroll`: native strips the `on` prefix and keys its drivers on what
          // is left, so the listener-name spelling would register under a key no event matches.
          'onScroll',
          {
            nativeEventPath: ['contentOffset', 'y'],
            animatedValueTag: scrollY.__getNativeTag(),
          },
        ],
      },
    ]);
  });

  it('detaches against the SAME view tag when the node leaves the tree', () => {
    const scrollY = new AnimatedValue(0);
    const { surface } = mount();
    const root = createElement('RCTView');
    const scroller = createElement('RCTScrollView');
    appendChild(root, scroller);
    routeProp(
      scroller,
      'onScroll',
      event(scrollMapping(scrollY), { useNativeDriver: true }),
    );
    surface.appendChild(root);
    surface.commit();

    const viewTag = getNativeTag(scroller);
    // Control: it was attached at all, and to this tag.
    expect(callsTo('addAnimatedEventToView')[0]?.args[0]).toBe(viewTag);
    expect(callsTo('removeAnimatedEventFromView')).toHaveLength(0);

    removeChild(root, scroller);
    surface.commit();

    // A detach on any other tag leaves native driving a view nobody owns.
    expect(callsTo('removeAnimatedEventFromView')).toEqual([
      {
        method: 'removeAnimatedEventFromView',
        args: [viewTag, 'onScroll', scrollY.__getNativeTag()],
      },
    ]);
  });

  it('re-arms a subtree the sweep tore down and the framework put back', () => {
    const scrollY = new AnimatedValue(0);
    const { surface } = mount();
    const root = createElement('RCTView');
    const parkable = createElement('RCTView');
    const scroller = createElement('RCTScrollView');
    appendChild(parkable, scroller);
    routeProp(
      scroller,
      'onScroll',
      event(scrollMapping(scrollY), { useNativeDriver: true }),
    );
    appendChild(root, parkable);
    surface.appendChild(root);
    surface.commit();
    expect(callsTo('addAnimatedEventToView')).toHaveLength(1);

    // Parked and returned with no prop write of its own — Svelte's `{#if}`.
    removeChild(root, parkable);
    surface.commit();
    expect(callsTo('removeAnimatedEventFromView')).toHaveLength(1);

    appendChild(root, parkable);
    surface.commit();
    expect(callsTo('addAnimatedEventToView')).toHaveLength(2);
    expect(callsTo('addAnimatedEventToView')[1]?.args[0]).toBe(
      getNativeTag(scroller),
    );
  });

  it('does not churn the native module when the same handler is written again', () => {
    const scrollY = new AnimatedValue(0);
    const { surface } = mount();
    const scroller = createElement('RCTScrollView');
    const handler = event(scrollMapping(scrollY), { useNativeDriver: true });
    routeProp(scroller, 'onScroll', handler);
    surface.appendChild(scroller);
    surface.commit();
    expect(callsTo('addAnimatedEventToView')).toHaveLength(1);

    routeProp(scroller, 'onScroll', handler);
    surface.commit();

    expect(callsTo('addAnimatedEventToView')).toHaveLength(1);
    expect(callsTo('removeAnimatedEventFromView')).toHaveLength(0);

    // The control: a DIFFERENT handler does go round trip, so the guard above is identity and not
    // a write that never reaches the module.
    routeProp(
      scroller,
      'onScroll',
      event(scrollMapping(scrollY), { useNativeDriver: true }),
    );
    surface.commit();
    expect(callsTo('addAnimatedEventToView')).toHaveLength(2);
    expect(callsTo('removeAnimatedEventFromView')).toHaveLength(1);
  });

  it('detaches when the app clears the handler, without removing the node', () => {
    const scrollY = new AnimatedValue(0);
    const { surface } = mount();
    const scroller = createElement('RCTScrollView');
    routeProp(
      scroller,
      'onScroll',
      event(scrollMapping(scrollY), { useNativeDriver: true }),
    );
    surface.appendChild(scroller);
    surface.commit();
    const viewTag = getNativeTag(scroller);
    expect(callsTo('addAnimatedEventToView')).toHaveLength(1);

    routeProp(scroller, 'onScroll', undefined);
    surface.commit();

    expect(callsTo('removeAnimatedEventFromView')).toEqual([
      {
        method: 'removeAnimatedEventFromView',
        args: [viewTag, 'onScroll', scrollY.__getNativeTag()],
      },
    ]);
  });

  it('leaves a JS-driven Animated.event alone', async () => {
    const scrollY = new AnimatedValue(0);
    const { surface } = mount();
    const scroller = createElement('RCTScrollView');
    routeProp(scroller, 'style', { top: scrollY });
    // No `useNativeDriver`, so the values are driven per event on the JS thread.
    routeProp(scroller, 'onScroll', event(scrollMapping(scrollY)));
    surface.appendChild(scroller);
    surface.commit();

    expect(callsTo('addAnimatedEventToView')).toHaveLength(0);
    // The control that makes the line above mean something: the handler is wired and it drives.
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
