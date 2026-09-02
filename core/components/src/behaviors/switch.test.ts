// Switch as an engine-node behavior. Everything here is asserted on the COMMITTED Fabric payload
// or on the recorder's `commands` list — the two things a device would actually see — same
// discipline as `text-input.test.ts`, and for the same reason: every failure this behavior can
// have (a snap-back that never fires, a fold that leaves an authored alias in the payload) is
// invisible on `node.props`.
import { afterEach, describe, expect, it, vi } from 'vitest';
import { installFabric, type IFakeNode } from '../../../test-utils/src/index';
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

const fabric = installFabric();
let nextRootTag = 8000;

// PRODUCTION SHAPE. An adapter resolves the intrinsic tag through `descriptorFor` and calls
// `createElement` with the FABRIC view name — `Switch` on iOS, the headless default
// (`component-names/index.ios.ts`, this file's own base). Building the subject as
// `createElement(SWITCH_TAG)` would pass the tag AS the Fabric name and make the registry key
// match by accident, leaving every case below green over a registration that can never fire in an
// app (`.claude/rules/test-harness-false-greens.md` §11 — the exact trap `text-input.test.ts`
// already documents for the same reason).
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

// The LIVE tree, by testID — never `fabric.find()`, which searches `created` and hands back the
// pre-clone node with its mount-time props (`test-harness-false-greens.md`).
function committedPropsOf(testID: string): Record<string, unknown> | undefined {
  const walk = (
    nodes: readonly IFakeNode[],
  ): Record<string, unknown> | undefined => {
    for (const node of nodes) {
      if (node.props.testID === testID) return node.props;
      const hit = walk(node.children);
      if (hit !== undefined) return hit;
    }
    return undefined;
  };
  return walk(fabric.appRoot().children);
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
  // updates `value` — no commit ever happens on its own, which is why `onChange` must request one
  // itself (see the module header). Mirrors the React wrapper's own
  // "snaps native back via a setValue command when a no-op handler rejects the toggle".
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
    expect(onValueChange).toHaveBeenCalledWith(true, expect.anything());
    const setValue = commandsNamed('setValue');
    expect(setValue, 'a setValue command after a rejected toggle').toHaveLength(
      1,
    );
    expect(setValue[0]!.args[0]).toBe(false);
  });

  // The accept case, fully synchronous: the app's handler writes `value` back and commits before
  // `onValueChange` even returns. Whether the check runs synchronously or is deferred, it sees the
  // correct value here — this alone would NOT catch a regression back to a synchronous check; see
  // the next case for the one that does.
  it('issues no snap-back command when the app accepts the toggle synchronously', async () => {
    registerSwitchBehavior();
    const node = makeSwitch();
    routeProp(node, 'testID', TEST_ID);
    routeProp(node, 'value', false);
    const surface = mount(node);
    routeProp(node, 'onValueChange', (next: boolean) => {
      routeProp(node, 'value', next);
      surface.commit();
    });

    listenerOf(node, 'change')(changeEvent(node, true));
    await flush();

    expect(commandsNamed('setValue')).toHaveLength(0);
    expect(committedPropsOf(TEST_ID)).toMatchObject({ value: true });
  });

  // THE CASE THE DEFER EXISTS FOR. Every real adapter's `onValueChange` triggers the APP's own
  // reactive update, and that update reaching `node.props.value` is itself scheduled — a microtask
  // in the common case (Promise-based state, Vue/Svelte/Solid's own scheduling; Angular's own
  // switch component solves the identical problem with `queueMicrotask`, see the module header).
  // So the app's accept-commit microtask gets enqueued from INSIDE this synchronous listener call —
  // strictly BEFORE `onChange`'s own `queueMicrotask(evaluateSnapBack)` call, which happens only
  // after the listener returns. FIFO ordering is what makes the deferred check see the correct,
  // already-accepted value. Break-tested: reverting `onChange` to call `evaluateSnapBack`
  // synchronously (instead of deferring it) makes this test fail — a `setValue` command fires on
  // the stale pre-accept value before the app's own microtask ever runs.
  it('issues no snap-back command when the app accepts via its own async reactive update', async () => {
    registerSwitchBehavior();
    const node = makeSwitch();
    routeProp(node, 'testID', TEST_ID);
    routeProp(node, 'value', false);
    const surface = mount(node);
    routeProp(node, 'onValueChange', (next: boolean) => {
      // The app's own scheduling, enqueued WHILE onChange's synchronous portion is still running —
      // e.g. a Promise-based store, or any framework whose commit is itself microtask-timed.
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

  it('folds trackColor/thumbColor/ios_backgroundColor to the iOS native prop names and drops the authored keys', () => {
    registerSwitchBehavior();
    const node = makeSwitch();
    routeProp(node, 'testID', TEST_ID);
    routeProp(node, 'value', true);
    routeProp(node, 'trackColor', { false: '#111', true: '#222' });
    routeProp(node, 'thumbColor', '#333');
    routeProp(node, 'ios_backgroundColor', '#444');
    mount(node);

    const props = committedPropsOf(TEST_ID);
    expect(props).toMatchObject({
      value: true,
      onTintColor: '#222',
      tintColor: '#111',
      thumbTintColor: '#333',
    });
    expect(props).not.toHaveProperty('trackColor');
    expect(props).not.toHaveProperty('thumbColor');
    expect(props).not.toHaveProperty('ios_backgroundColor');
    expect(props).not.toHaveProperty('style');
    // `fabricProps` hoists a style slot's keys onto the payload rather than keeping a nested
    // `style` object (`core/engine/src/fabric-props.ts`'s `addStyle`), so the ios_backgroundColor
    // fold's own keys land flat, same as every other adapter's committed payload.
    expect(props).toMatchObject({ backgroundColor: '#444', borderRadius: 16 });
  });

  it('folds an authored non-boolean value to a strict false', () => {
    registerSwitchBehavior();
    const node = makeSwitch();
    routeProp(node, 'testID', TEST_ID);
    mount(node);

    expect(committedPropsOf(TEST_ID)).toMatchObject({ value: false });
  });

  // The `symbiote-switch-managed` tag resolves to the SAME native views as `symbiote-switch` — the
  // wrapper's spelling must not silently orphan itself from either platform table.
  it('resolves symbiote-switch-managed to the same Fabric view as symbiote-switch, on iOS', () => {
    expect(descriptorFor('symbiote-switch')).toEqual({
      component: 'Switch',
      isText: false,
    });
    expect(descriptorFor('symbiote-switch-managed')).toEqual({
      component: 'Switch',
      isText: false,
    });
  });
});
