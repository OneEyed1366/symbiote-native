// `useEvent` and `useEventListener` of Vue over an emitter with typed events

import { defineComponent, h, ref, type VNode } from '@vue/runtime-core';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { mount, unmount } from '@symbiote-native/vue';
import { installRecordingFabric } from '@symbiote-native/test-utils';
import type { IEventEmitterOf } from '@symbiote-native/engine';
import { useEvent, useEventListener } from './use-event';

type IPlayerEvents = { statusChange: (event: { status: string }) => void };

function fakeEmitter() {
  const listeners: ((...args: never[]) => unknown)[] = [];
  const remove = vi.fn();
  const emitter: IEventEmitterOf<IPlayerEvents> = {
    addListener: (_name, listener) => {
      listeners.push(listener);
      return { remove };
    },
  };
  const emit = (event: { status: string }): void => {
    for (const listener of listeners)
      Reflect.apply(listener, undefined, [event]);
  };
  return { emitter, emit, remove, listeners };
}

const ROOT_TAG = 90_511;
installRecordingFabric();
const tick = (): Promise<void> =>
  new Promise(resolve => setTimeout(resolve, 0));

afterEach(() => unmount(ROOT_TAG));

function mountSetup(setup: () => void): void {
  const Probe = defineComponent(() => {
    setup();
    return (): VNode => h('view');
  });
  mount(ROOT_TAG, { render: (): VNode => h(Probe) });
}

describe('useEvent', () => {
  it('starts with the initial value and follows each event', async () => {
    const { emitter, emit } = fakeEmitter();
    let event:
      ReturnType<typeof useEvent<IPlayerEvents, 'statusChange'>> | undefined;
    mountSetup(() => {
      event = useEvent(emitter, 'statusChange', { status: 'idle' });
    });
    await tick();
    expect(event?.value).toEqual({ status: 'idle' });

    emit({ status: 'ready' });

    expect(event?.value).toEqual({ status: 'ready' });
  });

  it('is null until the first event when there is no initial value', async () => {
    const { emitter } = fakeEmitter();
    let event:
      ReturnType<typeof useEvent<IPlayerEvents, 'statusChange'>> | undefined;
    mountSetup(() => {
      event = useEvent(emitter, 'statusChange');
    });
    await tick();

    expect(event?.value).toBeNull();
  });
});

describe('useEventListener', () => {
  it('calls the listener with each event', async () => {
    const { emitter, emit } = fakeEmitter();
    const listener = vi.fn();
    mountSetup(() => useEventListener(emitter, 'statusChange', listener));
    await tick();

    emit({ status: 'ready' });

    expect(listener).toHaveBeenCalledWith({ status: 'ready' });
  });

  it('calls the latest listener without subscribing again', async () => {
    const { emitter, emit, listeners } = fakeEmitter();
    const first = vi.fn();
    const second = vi.fn();
    const current = ref(first);
    mountSetup(() => useEventListener(emitter, 'statusChange', current));
    await tick();

    current.value = second;
    emit({ status: 'x' });

    expect(first).not.toHaveBeenCalled();
    expect(second).toHaveBeenCalledTimes(1);
    expect(listeners).toHaveLength(1);
  });

  it('subscribes again when the emitter changes and removes the old one', async () => {
    const one = fakeEmitter();
    const two = fakeEmitter();
    const emitter = ref(one.emitter);
    mountSetup(() =>
      useEventListener(emitter, 'statusChange', () => undefined),
    );
    await tick();

    emitter.value = two.emitter;
    await tick();

    expect(one.remove).toHaveBeenCalledTimes(1);
    expect(two.listeners).toHaveLength(1);
  });

  it('removes the subscription when the owner unmounts', async () => {
    const { emitter, remove } = fakeEmitter();
    mountSetup(() =>
      useEventListener(emitter, 'statusChange', () => undefined),
    );
    await tick();

    unmount(ROOT_TAG);

    expect(remove).toHaveBeenCalledTimes(1);
  });
});
