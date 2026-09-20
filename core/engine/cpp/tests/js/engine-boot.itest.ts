// The engine's OWN JavaScript, running against the engine's own C++ — no stand-in anywhere in the
// path. This is the case the whole harness exists to make possible: `createSurface` and
// `createElement` are the code adapters call, `applyOps` is the code the device runs, and what is
// asserted is what the platform received.

import {
  createElement,
  createSurface,
  setEventListener,
  setProp,
} from '@symbiote-native/engine';

import {
  dispatchEvent,
  expect,
  mounted,
  report,
  shapeOf,
  test,
} from './harness';

test('a styled element reaches the platform through the engine', () => {
  const surface = createSurface(1);
  const child = createElement('RCTView');
  setProp(child, 'nativeID', 'child');
  surface.appendChild(child);
  surface.commit();

  expect(shapeOf(mounted())).toBe('RootView(View())');
});

test('a view with nothing on it is flattened away', () => {
  const surface = createSurface(1);
  surface.appendChild(createElement('RCTView'));
  surface.commit();

  expect(shapeOf(mounted())).toBe('RootView()');
});

// why: a payload key is not a prop. The engine can send anything it likes; what matters is what
// Fabric PARSED onto the view, and a key that reached no props field simply is not here. That
// distinction is invisible to a stand-in, which can only report the payload back.
test('only props Fabric actually parsed stand on the view', () => {
  const surface = createSurface(1);
  const child = createElement('RCTView');
  setProp(child, 'nativeID', 'child');
  setProp(child, 'testID', 'row');
  surface.appendChild(child);
  surface.commit();

  const view = mounted().children[0];
  expect(view.props).toEqual({ nativeID: 'child', testID: 'row' });
});

// why: an event is the other half of the contract, and the half a stand-in cannot honour — the fake
// Fabric calls the renderer's registered handler directly, so its 500-odd event tests prove that
// the fake dispatches. Here the event leaves a real `EventEmitter`, crosses the real queue, is
// induced by a real beat, and arrives through `UIManagerBinding` carrying the instance handle
// Fabric kept. Every one of those steps is a place a device can be wrong and a double cannot.
//
// What this pins is the ARRIVAL and the identity of the target. Which app listener the engine then
// calls for a given gesture is its own subject, and it needs a whole gesture rather than one event
// — see `.docs/mirror-elimination.md`, "what the event tests still need".
test('a native event arrives carrying the node it was aimed at', () => {
  const surface = createSurface(1);
  const child = createElement('RCTView');
  setProp(child, 'nativeID', 'child');
  setEventListener(child, 'onTouchStart', () => {});
  surface.appendChild(child);
  surface.commit();

  const arrivals: { handle: unknown; type: string }[] = [];
  const slot: unknown = (globalThis as Record<string, unknown>)
    .nativeFabricUIManager;
  if (
    slot !== null &&
    typeof slot === 'object' &&
    'registerEventHandler' in slot &&
    typeof slot.registerEventHandler === 'function'
  ) {
    slot.registerEventHandler((handle: unknown, type: string) => {
      arrivals.push({ handle, type });
    });
  }

  dispatchEvent(mounted().children[0].tag, 'touchStart', {
    touches: [{ identifier: 1, pageX: 12, pageY: 4, target: 0 }],
    changedTouches: [{ identifier: 1, pageX: 12, pageY: 4, target: 0 }],
    identifier: 1,
    pageX: 12,
    pageY: 4,
  });

  expect(arrivals.length).toBe(1);
  expect(arrivals[0].type).toBe('topTouchStart');
  expect(arrivals[0].handle === child).toBe(true);
});

// why: the surface node is the container every headless test indexes down from — `appRoot()` — and
// it does not exist natively. `flex: 1` and `pointerEvents: box-none` make a view neither real nor
// a stacking context (`box-none` is not in that list; `box-only` and `none` are), so Fabric
// flattens it and the app's own first view mounts as a direct child of the ROOT. Any assertion
// shaped `appRoot().children[0]` is one level out against a device.
test('the surface container is flattened, so the app view mounts on the root', () => {
  const surface = createSurface(1);
  const child = createElement('RCTView');
  setProp(child, 'testID', 'app');
  surface.appendChild(child);
  surface.commit();

  const root = mounted();
  expect(shapeOf(root)).toBe('RootView(View())');
  expect(root.children[0].props.testID).toBe('app');
});

report();
