// Switch as an engine-node behavior. Everything here is asserted on the COMMITTED Fabric payload
// or on the recorder's `commands` list — the two things a device would actually see — same
// discipline as `text-input.test.ts`, and for the same reason: every failure this behavior can
// have (a snap-back that never fires, a fold that leaves an authored alias in the payload) is
// invisible on `node.props`.
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

// The LIVE tree, by testID — never `fabric.find()`, which searches the creation log and hands back
// the AUTHORED bag, not the committed payload (`test-harness-false-greens.md`). Reads `.payload`
// (`fabricProps`'s output): `onTintColor`/`tintColor`/`thumbTintColor` are folds, never props the
// app wrote.
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
    routeProp(node, 'onValueChange', (event: ISymbioteEvent) => {
      const next = Reflect.get(event, 'value');
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

  // THE TWO FOLD CASES MOVED: `core/engine/cpp/tests/js/switch-payload.itest.ts`. The authored-name
  // resolution — `trackColor`/`thumbColor`/`ios_backgroundColor` onto the per-platform native names,
  // and `value === true` — is `foldSwitchProps` in `SymbioteFabricProps.cpp` now, so this harness's
  // payload (built by the TypeScript `fabricProps`) cannot see it and never will.
  //
  // They gained two assertions on the way that this file could not make: `foldsFound === 0`, which
  // is the reason the rule moved at all, and a behaviorless control proving the renames are the
  // rule rather than something the engine does for every node.
  //
  // Everything below stays, and it is the half that never moved: the snap-back handshake, which
  // reads app state a microtask after native reports a toggle.

  it('resolves switch to the native Switch view, on iOS', () => {
    expect(descriptorFor('switch')).toEqual({
      component: 'Switch',
      isText: false,
    });
  });

  // why: `Switch.js:201-207`'s `handleChange` calls `onChange?.(event)` BEFORE
  // `onValueChange?.(event.nativeEvent.value)`, always — an app with side effects observable across
  // both handlers (a shared counter, a log) sees them run in that order on real RN. Ours called
  // `onValueChange` first.
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

  // why: `Switch.js:238-239,288-289` sets `onStartShouldSetResponder={returnsTrue}` and
  // `onResponderTerminationRequest={returnsFalse}` UNCONDITIONALLY, on BOTH platforms — a switch
  // always claims the gesture and never yields it, so a parent ScrollView's own responder
  // negotiation cannot steal a drag-to-toggle mid-gesture. Without this our engine wires no claim
  // at all, so a Switch nested in a ScrollView could lose the touch to the scroll the moment the
  // finger moves.
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
