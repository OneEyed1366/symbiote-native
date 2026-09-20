// The native driver AND a native-driven Animated.event, both on a BARE TAG — no adapter, no
// component, straight engine calls (`createElement`/`routeProp`/`surface.commit()`) — against the
// REAL committed Fabric tag. Replaces the `installFabric()` half of
// core/engine/src/animated/host-binding-native-driver.test.ts, split off in Round 13 because it
// compares native-driver tag args (`connect?.args[1] === viewTag`, `removeAnimatedEventFromView`'s
// args) against a REAL tag — under the recording host every committed node reads the same `NO_TAG`
// sentinel, so those comparisons would collapse to two sentinels and prove nothing
// (mirror-elimination.md's own wording for this exact class of gap).
//
// The fake `NativeAnimatedTurboModule` below is the SAME one every other *-animated-native-*.itest
// file in this directory uses — nothing about the module itself needs a real engine, only the view
// TAG it is asked to connect against does.

import {
  AnimatedValue,
  appendChild,
  createElement,
  createSurface,
  event,
  getNativeTag,
  removeChild,
  routeProp,
} from '@symbiote-native/engine';

import { beforeEach, describe, expect, it, report } from './harness';

interface INativeCall {
  method: string;
  args: unknown[];
}
const nativeCalls: INativeCall[] = [];

function record(method: string): (...args: unknown[]) => void {
  return (...args: unknown[]) => {
    nativeCalls.push({ method, args });
  };
}

const fakeNativeAnimated = {
  createAnimatedNode: record('createAnimatedNode'),
  connectAnimatedNodes: record('connectAnimatedNodes'),
  disconnectAnimatedNodes: record('disconnectAnimatedNodes'),
  connectAnimatedNodeToView: record('connectAnimatedNodeToView'),
  disconnectAnimatedNodeFromView: record('disconnectAnimatedNodeFromView'),
  restoreDefaultValues: record('restoreDefaultValues'),
  dropAnimatedNode: record('dropAnimatedNode'),
  startAnimatingNode: record('startAnimatingNode'),
  stopAnimation: record('stopAnimation'),
  setAnimatedNodeValue: record('setAnimatedNodeValue'),
  setAnimatedNodeOffset: record('setAnimatedNodeOffset'),
  flattenAnimatedNodeOffset: record('flattenAnimatedNodeOffset'),
  extractAnimatedNodeOffset: record('extractAnimatedNodeOffset'),
  startListeningToAnimatedNodeValue: record(
    'startListeningToAnimatedNodeValue',
  ),
  stopListeningToAnimatedNodeValue: record('stopListeningToAnimatedNodeValue'),
  getValue: record('getValue'),
  addAnimatedEventToView: record('addAnimatedEventToView'),
  removeAnimatedEventFromView: record('removeAnimatedEventFromView'),
};
Object.assign(globalThis, {
  nativeModuleProxy: { NativeAnimatedTurboModule: fakeNativeAnimated },
});

let nextRootTag = 8700;

beforeEach(() => {
  nativeCalls.length = 0;
});

function mount(): { surface: ReturnType<typeof createSurface> } {
  return { surface: createSurface((nextRootTag += 1)) };
}

function callsOf(method: string): INativeCall[] {
  return nativeCalls.filter(call => call.method === method);
}

describe('the native driver on a bare tag, on the real engine', () => {
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
    expect(viewTag !== undefined).toBe(true);
    // Control: nothing is native until an animation asks for it.
    expect(
      nativeCalls.filter(call => call.method === 'connectAnimatedNodeToView')
        .length,
    ).toBe(0);

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
    expect(connect !== undefined).toBe(true);
    // The right view: the props node bound to THIS node's REAL committed Fabric tag.
    expect(connect?.args[1]).toBe(viewTag);
    const propsTag = connect?.args[0];

    removeChild(root, view);
    surface.commit();

    // Torn down against exactly what it connected — a disconnect on the wrong tag leaves native
    // driving a view nobody owns.
    expect(
      nativeCalls.some(
        call =>
          call.method === 'disconnectAnimatedNodeFromView' &&
          call.args[0] === propsTag &&
          call.args[1] === viewTag,
      ),
    ).toBe(true);
    expect(
      nativeCalls.some(
        call =>
          call.method === 'restoreDefaultValues' && call.args[0] === propsTag,
      ),
    ).toBe(true);
  });
});

describe('a native-driven Animated.event on a bare tag, on the real engine', () => {
  const scrollMapping = (
    scrollY: AnimatedValue,
  ): ReadonlyArray<{
    nativeEvent: { contentOffset: { y: AnimatedValue } };
  }> => [{ nativeEvent: { contentOffset: { y: scrollY } } }];

  it('registers the mapping against the REAL committed view tag, under the PROP name', () => {
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
    expect(callsOf('addAnimatedEventToView').length).toBe(0);

    surface.appendChild(scroller);
    surface.commit();

    const viewTag = getNativeTag(scroller);
    expect(viewTag !== undefined).toBe(true);
    const attach = callsOf('addAnimatedEventToView');
    expect(attach.length).toBe(1);
    expect(attach[0]?.args[0]).toBe(viewTag);
    // `onScroll`, not `scroll`: native strips the `on` prefix and keys its drivers on what is
    // left, so the listener-name spelling would register under a key no event matches.
    expect(attach[0]?.args[1]).toBe('onScroll');
  });

  it('detaches against the SAME REAL view tag when the node leaves the tree', () => {
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
    expect(callsOf('addAnimatedEventToView')[0]?.args[0]).toBe(viewTag);
    expect(callsOf('removeAnimatedEventFromView').length).toBe(0);

    removeChild(root, scroller);
    surface.commit();

    // A detach on any other tag leaves native driving a view nobody owns.
    const detach = callsOf('removeAnimatedEventFromView');
    expect(detach.length).toBe(1);
    expect(detach[0]?.args[0]).toBe(viewTag);
    expect(detach[0]?.args[1]).toBe('onScroll');
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
    expect(callsOf('addAnimatedEventToView').length).toBe(1);

    // Parked and returned with no prop write of its own — Svelte's `{#if}`.
    removeChild(root, parkable);
    surface.commit();
    expect(callsOf('removeAnimatedEventFromView').length).toBe(1);

    appendChild(root, parkable);
    surface.commit();
    expect(callsOf('addAnimatedEventToView').length).toBe(2);
    expect(callsOf('addAnimatedEventToView')[1]?.args[0]).toBe(
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
    expect(callsOf('addAnimatedEventToView').length).toBe(1);

    routeProp(scroller, 'onScroll', handler);
    surface.commit();

    expect(callsOf('addAnimatedEventToView').length).toBe(1);
    expect(callsOf('removeAnimatedEventFromView').length).toBe(0);

    // The control: a DIFFERENT handler does go round trip, so the guard above is identity and not
    // a write that never reaches the module.
    routeProp(
      scroller,
      'onScroll',
      event(scrollMapping(scrollY), { useNativeDriver: true }),
    );
    surface.commit();
    expect(callsOf('addAnimatedEventToView').length).toBe(2);
    expect(callsOf('removeAnimatedEventFromView').length).toBe(1);
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
    expect(callsOf('addAnimatedEventToView').length).toBe(1);

    routeProp(scroller, 'onScroll', undefined);
    surface.commit();

    const detach = callsOf('removeAnimatedEventFromView');
    expect(detach.length).toBe(1);
    expect(detach[0]?.args[0]).toBe(viewTag);
    expect(detach[0]?.args[1]).toBe('onScroll');
  });
});

report();
