// `useEvent` and `useEventListener` of Solid over an emitter with typed events

import { createSignal } from 'solid-js';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { mount, unmount } from '@symbiote-native/solid';
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

const ROOT_TAG = 90_521;
installRecordingFabric();
const tick = (): Promise<void> =>
  new Promise(resolve => setTimeout(resolve, 0));

afterEach(() => unmount(ROOT_TAG));

describe('useEvent', () => {
  it('starts with the initial value and follows each event', async () => {
    const { emitter, emit } = fakeEmitter();
    let event: (() => { status: string } | null) | undefined;
    mount(ROOT_TAG, () => {
      event = useEvent(
        () => emitter,
        () => 'statusChange',
        { status: 'idle' },
      );
      return <view />;
    });
    await tick();
    expect(event?.()).toEqual({ status: 'idle' });

    emit({ status: 'ready' });

    expect(event?.()).toEqual({ status: 'ready' });
  });

  it('is null until the first event when there is no initial value', async () => {
    const { emitter } = fakeEmitter();
    let event: (() => { status: string } | null) | undefined;
    mount(ROOT_TAG, () => {
      event = useEvent(
        () => emitter,
        () => 'statusChange',
      );
      return <view />;
    });
    await tick();

    expect(event?.()).toBeNull();
  });
});

describe('useEventListener', () => {
  it('calls the listener with each event', async () => {
    const { emitter, emit } = fakeEmitter();
    const listener = vi.fn();
    mount(ROOT_TAG, () => {
      useEventListener(
        () => emitter,
        () => 'statusChange',
        () => listener,
      );
      return <view />;
    });
    await tick();

    emit({ status: 'ready' });

    expect(listener).toHaveBeenCalledWith({ status: 'ready' });
  });

  it('calls the latest listener without subscribing again', async () => {
    const { emitter, emit, listeners } = fakeEmitter();
    const first = vi.fn();
    const second = vi.fn();
    const [current, setCurrent] = createSignal(first);
    mount(ROOT_TAG, () => {
      useEventListener(
        () => emitter,
        () => 'statusChange',
        current,
      );
      return <view />;
    });
    await tick();

    setCurrent(() => second);
    emit({ status: 'x' });

    expect(first).not.toHaveBeenCalled();
    expect(second).toHaveBeenCalledTimes(1);
    expect(listeners).toHaveLength(1);
  });

  it('subscribes again when the emitter changes and removes the old one', async () => {
    const one = fakeEmitter();
    const two = fakeEmitter();
    const [emitter, setEmitter] = createSignal(one.emitter);
    mount(ROOT_TAG, () => {
      useEventListener(
        emitter,
        () => 'statusChange',
        () => () => undefined,
      );
      return <view />;
    });
    await tick();

    setEmitter(() => two.emitter);
    await tick();

    expect(one.remove).toHaveBeenCalledTimes(1);
    expect(two.listeners).toHaveLength(1);
  });

  it('removes the subscription when the owner is disposed', async () => {
    const { emitter, remove } = fakeEmitter();
    mount(ROOT_TAG, () => {
      useEventListener(
        () => emitter,
        () => 'statusChange',
        () => () => undefined,
      );
      return <view />;
    });
    await tick();

    unmount(ROOT_TAG);

    expect(remove).toHaveBeenCalledTimes(1);
  });
});
