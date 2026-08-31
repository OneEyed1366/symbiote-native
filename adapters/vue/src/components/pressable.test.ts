// Vue lifecycle coverage for the shared Pressable machine. Core tests own timing and transition
// semantics; this proves Vue's setup-scope runtime is disposed by onUnmounted rather than letting a
// delayed callback write into a dead ref/emitter.
import { defineComponent, h } from '@vue/runtime-core';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mount, Pressable, unmount } from '@symbiote-native/vue';
import { installFabric } from '@symbiote-native/test-utils';

const ROOT_TAG = 518;
const PRESS_DELAY_MS = 30;
const fabric = installFabric();
const tick = (): Promise<void> =>
  new Promise(resolve => setTimeout(resolve, 0));

beforeEach(() => {
  fabric.reset();
});
afterEach(() => unmount(ROOT_TAG));

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

describe('Vue Pressable lifecycle', () => {
  it('cancels a pending unstable_pressDelay timer on unmount', async () => {
    let pressIns = 0;
    mount(
      ROOT_TAG,
      defineComponent({
        setup: () => () =>
          h(Pressable, {
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
