// Pressable's function-child form, driven for MORE THAN ONE press cycle.
//
// Why a separate file: pressable.test.tsx exercises a single start+end cycle, and with a static
// child. Both of those hide the failure this file is about — on a device, `examples/solid`'s
// function-child row fired onPress on only every OTHER tap, and the label stuck on its pressed
// text. A one-cycle test cannot see an every-other-cycle bug, and a static child never re-runs, so
// the subtree is never rebuilt mid-gesture.
//
// The cause, confirmed from the DEBUG=1 log and now fixed: the child was called with a SNAPSHOT
// (`children({ pressed: pressed() })`) from inside View's `insert` render effect, so a press
// re-ran the child and Solid's `insert` REPLACED the whole subtree. The rebuild landed between
// `pressIn` and the native responder grant; the grant never arrived, the gesture died, `pressed`
// stayed true, and the next tap started from the wrong state — hence "every other tap". The child
// now takes an accessor and is called once, untracked.
//
// Only ONE test here can see that cause headless, and it is the createNode counter: the fake
// Fabric hands an event straight to the node's listener, so there are no responder negotiations to
// lose and nothing else in this file would have failed on the old code. The rest assert the
// contract around it — the second cycle still fires, `pressed` returns to false, an alternating
// sibling and an alternating measured frame do not break the machine.

import { createSignal } from 'solid-js';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { installFabric, type IFakeNode } from '@symbiote-native/test-utils';
import { mount, unmount } from '../render';
import { ActivityIndicator } from './activity-indicator';
import { Pressable } from './pressable';
import { Text } from './text';

const ROOT_TAG = 815;
const TARGET = 'render-prop-target';
const TOUCH_START = 'topTouchStart';
const TOUCH_END = 'topTouchEnd';
// The native view name the iOS-resolved ActivityIndicator paints its spinner as.
const SPINNER_VIEW = 'ActivityIndicatorView';

const fabric = installFabric();
const flush = (): Promise<void> =>
  new Promise(resolve => setTimeout(resolve, 0));

// The frame slot.measure reports. On a device this is real, and it CHANGES between taps here,
// because the conditional sibling swaps a spinner for a text of a different width — which is the
// one device condition a coordinate-less fireEvent cannot reach.
let measuredFrame:
  { width: number; height: number; pageX: number; pageY: number } | undefined;
const slot = globalThis.nativeFabricUIManager;
if (slot === undefined) throw new Error('fabric slot was not installed');
slot.measure = (_node, callback) => {
  const frame = measuredFrame;
  if (frame === undefined) return;
  callback(0, 0, frame.width, frame.height, frame.pageX, frame.pageY);
};

function fireAt(handle: unknown, type: string, x: number, y: number): void {
  const touch = { pageX: x, pageY: y, identifier: 1, timestamp: 0 };
  const touches = type === TOUCH_END ? [] : [touch];
  fabric.fireEvent(handle, type, {
    pageX: x,
    pageY: y,
    touches,
    changedTouches: [touch],
  });
}

beforeEach(() => fabric.reset());
afterEach(() => unmount(ROOT_TAG));

function targetsCreated(): IFakeNode[] {
  return fabric.created.filter(node => node.props.testID === TARGET);
}

// The live committed raw-text content — what the screen actually shows. `fabric.created` would
// hand back the mount-time snapshot and read as passing forever.
function committedLabel(): string | undefined {
  let found: string | undefined;
  const walk = (nodes: IFakeNode[]): void => {
    for (const node of nodes) {
      if (found === undefined && node.viewName === 'RCTRawText') {
        const text = node.props.text;
        if (typeof text === 'string') found = text;
      }
      walk(node.children);
    }
  };
  walk(fabric.committed);
  return found;
}

function committedViewNames(): string[] {
  const names: string[] = [];
  const walk = (nodes: IFakeNode[]): void => {
    for (const node of nodes) {
      names.push(node.viewName);
      walk(node.children);
    }
  };
  walk(fabric.committed);
  return names;
}

function responderHandle(): unknown {
  const nodes = targetsCreated();
  const node = nodes[nodes.length - 1];
  if (node === undefined)
    throw new Error(`no node created with testID=${TARGET}`);
  return node.instanceHandle;
}

describe('Pressable with a function child, across repeated press cycles', () => {
  // why: THE cause of the device bug, and its only headless trace. The DEBUG=1 log showed
  // `solid createElement RCTText ×2` inside every failing pressIn — the child was being re-run
  // inside View's `insert` render effect, and `insert` REPLACES rather than diffs, so the whole
  // child subtree was destroyed and rebuilt while the finger was still down. That rebuild is what
  // cost the responder grant. Flipping the state the child reads must therefore update the leaf
  // and create NOTHING; the createNode counter is exactly the line between a re-prop and a
  // re-render, and it is the assertion the old snapshot signature fails.
  it('creates no node when a press flips the state the child reads', async () => {
    mount(ROOT_TAG, () => (
      <Pressable testID={TARGET}>
        {state => <Text>{state().pressed ? 'down' : 'up'}</Text>}
      </Pressable>
    ));
    await flush();
    const createdAtMount = fabric.counts.createNode;

    const handle = responderHandle();
    fabric.fireEvent(handle, TOUCH_START);
    await flush();
    expect(committedLabel(), 'the leaf must still update').toBe('down');
    expect(fabric.counts.createNode, 'press-in rebuilt the child subtree').toBe(
      createdAtMount,
    );

    fabric.fireEvent(handle, TOUCH_END);
    await flush();
    expect(committedLabel(), 'the leaf must go back').toBe('up');
    expect(fabric.counts.createNode, 'release rebuilt the child subtree').toBe(
      createdAtMount,
    );
  });

  // why: the device symptom was "every other tap". One cycle proves nothing about it — the second
  // cycle is the whole test.
  it('fires onPress on the second cycle too', async () => {
    let presses = 0;
    mount(ROOT_TAG, () => (
      <Pressable
        testID={TARGET}
        onPress={() => {
          presses++;
        }}
      >
        {state => <Text>{state().pressed ? 'down' : 'up'}</Text>}
      </Pressable>
    ));
    await flush();

    const handle = responderHandle();

    fabric.fireEvent(handle, TOUCH_START);
    fabric.fireEvent(handle, TOUCH_END);
    await flush();
    expect(presses, 'first tap').toBe(1);

    fabric.fireEvent(handle, TOUCH_START);
    fabric.fireEvent(handle, TOUCH_END);
    await flush();
    expect(presses, 'second tap').toBe(2);
  });

  // why: if a rebuild ever reaches the responder's OWN host node, native keeps talking to a tag
  // that no longer exists and the gesture is lost outright. Narrower than the counter above (the
  // real bug rebuilt the children, not the responder), and kept because it names the worst case.
  it('never re-creates the responder host node during a press', async () => {
    mount(ROOT_TAG, () => (
      <Pressable testID={TARGET}>
        {state => <Text>{state().pressed ? 'down' : 'up'}</Text>}
      </Pressable>
    ));
    await flush();
    const createdAtMount = targetsCreated().length;

    const handle = responderHandle();
    fabric.fireEvent(handle, TOUCH_START);
    await flush();
    expect(targetsCreated().length, 'after press-in').toBe(createdAtMount);

    fabric.fireEvent(handle, TOUCH_END);
    await flush();
    expect(targetsCreated().length, 'after release').toBe(createdAtMount);
  });

  // why: the canary's real child is not one element — it is a fragment whose SECOND member swaps
  // element TYPE on every press (spinner ↔ text). Two claims at once: the machine keeps firing
  // through that alternation, and the alternation still HAPPENS — the child function now runs once
  // and untracked, so a sibling signal it reads is only reactive because the compiler wraps a
  // dynamic fragment member in its own memo. Asserting the committed view names is what keeps that
  // from silently freezing.
  it('keeps firing when a conditional sibling swaps element type each press', async () => {
    let presses = 0;
    const [busy, setBusy] = createSignal(false);
    mount(ROOT_TAG, () => (
      <Pressable
        testID={TARGET}
        onPress={() => {
          presses++;
          setBusy(current => !current);
        }}
      >
        {state => (
          <>
            <Text>{state().pressed ? 'down' : 'up'}</Text>
            {busy() ? <ActivityIndicator /> : <Text>off</Text>}
          </>
        )}
      </Pressable>
    ));
    await flush();

    for (let tap = 1; tap <= 4; tap++) {
      const handle = responderHandle();
      fabric.fireEvent(handle, TOUCH_START);
      fabric.fireEvent(handle, TOUCH_END);
      await flush();
      expect(presses, `tap ${tap}`).toBe(tap);
      expect(busy(), `busy after tap ${tap}`).toBe(tap % 2 === 1);
      expect(
        committedViewNames().includes(SPINNER_VIEW),
        `the sibling swapped after tap ${tap}`,
      ).toBe(busy());
    }
  });

  // why: THE observable that was visibly wrong on device — the label stayed on its pressed text
  // after the finger lifted. onPress firing is not the same contract as `pressed` going back to
  // false, and none of the tests above assert the second one.
  it('returns pressed to false in the committed text after release', async () => {
    mount(ROOT_TAG, () => (
      <Pressable testID={TARGET}>
        {state => <Text>{state().pressed ? 'down' : 'up'}</Text>}
      </Pressable>
    ));
    await flush();
    expect(committedLabel(), 'before any touch').toBe('up');

    const handle = responderHandle();
    fabric.fireEvent(handle, TOUCH_START);
    await flush();
    expect(committedLabel(), 'while held').toBe('down');

    fabric.fireEvent(handle, TOUCH_END);
    await flush();
    expect(committedLabel(), 'after release').toBe('up');
  });

  // why: the last device-only difference the tests above cannot reach. Real touches carry
  // coordinates, so the press machine measures a retention region on grant and checks the release
  // point against it. The canary's row changes WIDTH between taps (spinner vs "off" text), so a
  // region measured against the previous layout is exactly the every-other-tap shape.
  it('fires on every tap while the measured frame alternates between taps', async () => {
    let presses = 0;
    const [busy, setBusy] = createSignal(false);
    mount(ROOT_TAG, () => (
      <Pressable
        testID={TARGET}
        onPress={() => {
          presses++;
          setBusy(current => !current);
        }}
      >
        {state => (
          <>
            <Text>{state().pressed ? 'down' : 'up'}</Text>
            {busy() ? <ActivityIndicator /> : <Text>off</Text>}
          </>
        )}
      </Pressable>
    ));
    await flush();

    const TOUCH_X = 50;
    const TOUCH_Y = 10;
    for (let tap = 1; tap <= 4; tap++) {
      // A narrow row when the text is showing, a wider one when the spinner is.
      measuredFrame = {
        width: busy() ? 300 : 120,
        height: 20,
        pageX: 0,
        pageY: 0,
      };
      const handle = responderHandle();
      fireAt(handle, TOUCH_START, TOUCH_X, TOUCH_Y);
      fireAt(handle, TOUCH_END, TOUCH_X, TOUCH_Y);
      await flush();
      expect(
        presses,
        `tap ${tap} with frame width ${measuredFrame.width}`,
      ).toBe(tap);
    }
  });
});
