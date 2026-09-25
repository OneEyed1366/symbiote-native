// Switch as an engine-node behavior. Everything here is asserted on the committed Fabric payload
// or the recorder's `commands` list — every failure this behavior can have is invisible on
// `node.props` (same discipline as `text-input.test.ts`).
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  createLiveTree,
  installRecordingFabric,
} from '../../../test-utils/src/index';
import {
  clearHostBehaviors,
  createElement,
  createSurface,
  routeProp,
  type IListener,
  type ISymbioteEvent,
  type ISymbioteNode,
} from '@symbiote-native/engine';
import { registerSwitchBehavior, SWITCH_TAG } from './switch';
import { descriptorFor } from '../component-names/index.ios';

const fabric = installRecordingFabric();
const live = createLiveTree(fabric);
let nextRootTag = 8000;

// PRODUCTION SHAPE: an adapter resolves the tag through `descriptorFor` and calls createElement
// with the FABRIC view name. Building the subject as createElement(SWITCH_TAG) would pass the
// tag AS the Fabric name and leave every case below green over a fake registration.
const SWITCH_VIEW_NAME = 'Switch';
const TEST_ID = 'subject';

function makeSwitch(): ISymbioteNode {
  return createElement(SWITCH_VIEW_NAME, false, SWITCH_TAG);
}

function mount(node: ISymbioteNode) {
  const surface = createSurface((nextRootTag += 1));
  surface.appendChild(node);
  surface.commit();
  return surface;
}

function listenerOf(node: ISymbioteNode, name: string): IListener {
  const listener = node.listeners?.get(name);
  if (listener === undefined) {
    throw new Error(
      `no "${name}" listener installed — the behavior did not attach`,
    );
  }
  return listener;
}

function changeEvent(node: ISymbioteNode, value: boolean): ISymbioteEvent {
  return {
    type: 'topChange',
    target: node,
    currentTarget: node,
    nativeEvent: { value, eventCount: 1 },
    stopPropagation: () => {},
  };
}

// The live tree by testID, never `fabric.find()` (creation log, authored bag). Reads `.payload`:
// `onTintColor`/`tintColor`/`thumbTintColor` are folds, never props the app wrote.
function committedPropsOf(testID: string): Record<string, unknown> | undefined {
  return live.findLive(live.appRoot(), node => node.payload.testID === testID)
    ?.payload;
}

function commandsNamed(
  name: string,
): ReadonlyArray<{ commandName: string; args: readonly unknown[] }> {
  return fabric.commands.filter(entry => entry.commandName === name);
}

// A prop write requested from an event handler is published on the microtask boundary
// (`requestCommitFor` -> `queueMicrotask(flushNativeProps)`), same as TextInput's — the payload
// (and any command `afterCommit` sends) is stale until this resolves.
const flush = (): Promise<void> => Promise.resolve();

afterEach(() => {
  clearHostBehaviors();
  fabric.reset();
});

describe('switch host behavior', () => {
  it('issues no snap-back command on initial mount, before any native report', async () => {
    registerSwitchBehavior();
    const node = makeSwitch();
    routeProp(node, 'testID', TEST_ID);
    routeProp(node, 'value', true);
    mount(node);
    await flush();

    expect(commandsNamed('setValue')).toHaveLength(0);
  });

  // The reject case: native flips optimistically before JS approves, and a no-op handler never
  // updates `value` — no commit happens on its own, which is why `onChange` must request one.
  it('sends the platform snap-back command when a no-op handler rejects the toggle', async () => {
    registerSwitchBehavior();
    const onValueChange = vi.fn(); // deliberately does not touch `value`
    const node = makeSwitch();
    routeProp(node, 'testID', TEST_ID);
    routeProp(node, 'value', false);
    routeProp(node, 'onValueChange', onValueChange);
    mount(node);

    listenerOf(node, 'change')(changeEvent(node, true));
    await flush();

    expect(onValueChange).toHaveBeenCalledTimes(1);
    // ONE argument, the event, with `value` carried on it — not `(value, event)`.
    expect(onValueChange).toHaveBeenCalledWith(
      expect.objectContaining({ value: true }),
    );
    const setValue = commandsNamed('setValue');
    expect(setValue, 'a setValue command after a rejected toggle').toHaveLength(
      1,
    );
    expect(setValue[0]!.args[0]).toBe(false);
  });

  // The accept case, fully synchronous: the app's handler writes `value` back before
  // `onValueChange` returns. This alone would NOT catch a regression to a synchronous check —
  // see the next case for the one that does.
  it('issues no snap-back command when the app accepts the toggle synchronously', async () => {
    registerSwitchBehavior();
    const node = makeSwitch();
    routeProp(node, 'testID', TEST_ID);
    routeProp(node, 'value', false);
    const surface = mount(node);
    routeProp(node, 'onValueChange', (event: ISymbioteEvent) => {
      const next = Reflect.get(event, 'value');
      routeProp(node, 'value', next);
      surface.commit();
    });

    listenerOf(node, 'change')(changeEvent(node, true));
    await flush();

    expect(commandsNamed('setValue')).toHaveLength(0);
    expect(committedPropsOf(TEST_ID)).toMatchObject({ value: true });
  });

  // The case the defer exists for: a real adapter's `onValueChange` reacts via its own microtask,
  // enqueued from inside this synchronous listener call, strictly before `onChange`'s own deferred
  // `evaluateSnapBack` — FIFO ordering is what lets the check see the accepted value.
  it('issues no snap-back command when the app accepts via its own async reactive update', async () => {
    registerSwitchBehavior();
    const node = makeSwitch();
    routeProp(node, 'testID', TEST_ID);
    routeProp(node, 'value', false);
    const surface = mount(node);
    routeProp(node, 'onValueChange', (event: ISymbioteEvent) => {
      const next = Reflect.get(event, 'value');
      // The app's own scheduling, enqueued while onChange's synchronous portion is still running.
      queueMicrotask(() => {
        routeProp(node, 'value', next);
        surface.commit();
      });
    });

    listenerOf(node, 'change')(changeEvent(node, true));
    await flush();
    await flush();

    expect(commandsNamed('setValue')).toHaveLength(0);
    expect(committedPropsOf(TEST_ID)).toMatchObject({ value: true });
  });

  // The fold cases (authored-name resolution, `value === true`) moved to
  // `core/engine/cpp/tests/js/switch-payload.itest.ts`: `foldSwitchProps` in C++ now owns them,
  // invisible to this harness's TypeScript-built payload.

  // Everything below is the half that never moved: the snap-back handshake, which reads app
  // state a microtask after native reports a toggle.

  it('resolves switch to the native Switch view, on iOS', () => {
    expect(descriptorFor('switch')).toEqual({
      component: 'Switch',
      isText: false,
    });
  });

  // why: `Switch.js:201-207`'s `handleChange` calls `onChange` before `onValueChange`, always —
  // an app with side effects observable across both sees that exact order on real RN.
  it('calls onChange before onValueChange, matching vendor order', () => {
    registerSwitchBehavior();
    const node = makeSwitch();
    routeProp(node, 'value', false);
    mount(node);
    const order: string[] = [];
    routeProp(node, 'onChange', () => order.push('onChange'));
    routeProp(node, 'onValueChange', () => order.push('onValueChange'));

    listenerOf(node, 'change')(changeEvent(node, true));

    expect(order).toEqual(['onChange', 'onValueChange']);
  });

  // why: `Switch.js:238-239,288-289` sets both responder props unconditionally — a switch always
  // claims the gesture and never yields it, so a parent ScrollView can't steal a drag mid-toggle.
  it('always claims the responder and never yields it, on both platforms', () => {
    registerSwitchBehavior();
    const node = makeSwitch();
    mount(node);

    expect(
      listenerOf(node, 'startShouldSetResponder')(changeEvent(node, true)),
    ).toBe(true);
    expect(
      listenerOf(node, 'responderTerminationRequest')(changeEvent(node, true)),
    ).toBe(false);
  });
});
