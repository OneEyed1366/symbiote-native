// Vue coverage for the shared Pressable machine bridged through Vue's own renderer. Core tests
// (core/components/src/state/pressable.test.ts, behaviors/pressable.test.ts) own the timing/
// transition contract and the engine-node wiring directly; this file proves the VUE WIRING: a
// compiled `h('pressable', …)` element reaches the tag, its responder listeners land on the real
// host node, and app callbacks/a11y folding survive Vue's own render cycle — the same bridge-smoke
// shape React's and Solid's Pressable suites already carry (`.docs/test-cases/rn-parity.test-cases.md`).
//
// No Negative group: nothing here throws. `disabled` suppresses a press silently (a Positive
// contract — completes without error, the callback just never fires), it never rejects.
import { defineComponent, h } from '@vue/runtime-core';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mount, unmount } from '@symbiote-native/vue';
// A RECORDING host: the node is found over the AUTHORED nodes and the touch is aimed at the
// `instanceHandle` the ops named — no commit rule decides either.
import { installRecordingFabric } from '@symbiote-native/test-utils';

const ROOT_TAG = 518;
const PRESS_DELAY_MS = 30;
const TOUCH_START = 'topTouchStart';
const TOUCH_END = 'topTouchEnd';
const TERMINATION_REQUEST = 'responderTerminationRequest';
const fabric = installRecordingFabric();
const tick = (): Promise<void> =>
  new Promise(resolve => setTimeout(resolve, 0));

beforeEach(() => {
  fabric.reset();
});
afterEach(() => unmount(ROOT_TAG));

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function responderHandle(): unknown {
  const node = fabric.find(candidate => {
    if (candidate.viewName !== 'RCTView') return false;
    const handle = candidate.instanceHandle;
    return (
      typeof handle === 'object' &&
      handle !== null &&
      Reflect.get(handle, 'listeners') instanceof Map &&
      Reflect.get(handle, 'listeners').has('press')
    );
  });
  if (node === undefined)
    throw new Error('no Vue Pressable responder was created');
  return node.instanceHandle;
}

function terminationGate(
  handle: unknown,
): ((event: unknown) => unknown) | undefined {
  if (!isRecord(handle)) return undefined;
  const listeners = handle.listeners;
  if (!(listeners instanceof Map)) return undefined;
  const gate: unknown = listeners.get(TERMINATION_REQUEST);
  return typeof gate === 'function' ? gate : undefined;
}

describe('Vue Pressable on the engine', () => {
  // why: a tap is the entire product contract of Pressable — start+end without enough drift to
  // fall out of the retention region must fire exactly one onPress, never zero or more than one.
  it('synthesizes onPress on start + end', async () => {
    let presses = 0;
    mount(
      ROOT_TAG,
      defineComponent({
        setup: () => () =>
          h('pressable', {
            onPress: () => {
              presses++;
            },
          }),
      }),
    );
    await tick();

    const handle = responderHandle();
    fabric.fireEvent(handle, TOUCH_START);
    fabric.fireEvent(handle, TOUCH_END);
    expect(presses).toBe(1);
  });

  // why: RN's Pressable never fires ANY press callback while disabled — ported from RN's
  // Pressable-test.js snapshot scenarios. The accessibilityState fold (`disabled` -> assistive
  // tech) is `foldPressableProps` in `SymbioteFabricProps.cpp` now; this harness builds its
  // payload through the TypeScript `fabricProps`, which carries no copy of it — asserted against
  // the committed payload in `core/engine/cpp/tests/js/touchable-focusable-payload.itest.ts`.
  it('suppresses onPress when disabled', async () => {
    let presses = 0;
    mount(
      ROOT_TAG,
      defineComponent({
        setup: () => () =>
          h('pressable', {
            testID: 'subject',
            disabled: true,
            onPress: () => {
              presses++;
            },
          }),
      }),
    );
    await tick();

    const node = fabric.find(candidate => candidate.props.testID === 'subject');
    fabric.fireEvent(node?.instanceHandle, TOUCH_START);
    fabric.fireEvent(node?.instanceHandle, TOUCH_END);
    expect(presses).toBe(0);
  });

  // why: leaving `cancelable` unset must leave RN's own native default in charge — the behavior
  // installs one dispatcher per owned event at attach regardless (the machine needs the slot
  // before any gesture can start), so the oracle is the ANSWER the gate resolves to, not whether a
  // listener is present (`.claude/rules/adapter-parity-audit.md`, "phrase a parity oracle as a
  // CAPABILITY").
  it('forces no termination answer when cancelable is unset (RN implicit yes)', async () => {
    mount(
      ROOT_TAG,
      defineComponent({
        setup: () => () => h('pressable', {}),
      }),
    );
    await tick();

    const gate = terminationGate(responderHandle());
    expect(gate?.({ nativeEvent: {} })).toBeUndefined();
  });

  it('cancels a pending unstable_pressDelay timer on unmount', async () => {
    let pressIns = 0;
    mount(
      ROOT_TAG,
      defineComponent({
        setup: () => () =>
          h('pressable', {
            unstable_pressDelay: PRESS_DELAY_MS,
            onPressIn: () => {
              pressIns++;
            },
          }),
      }),
    );
    await tick();

    const handle = responderHandle();
    fabric.fireEvent(handle, 'topTouchStart');
    unmount(ROOT_TAG);
    await new Promise(resolve => setTimeout(resolve, PRESS_DELAY_MS + 10));
    expect(pressIns).toBe(0);
    // Clear the process-global responder only after proving onUnmounted cancelled the timer.
    fabric.fireEvent(handle, 'topTouchCancel');
  });
});
