// `useEvent` and `useEventListener` over an emitter with typed events

import { useState } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mount, unmount } from '@symbiote-native/react';
import { installRecordingFabric } from '@symbiote-native/test-utils';
import type { IEventEmitterOf } from '@symbiote-native/engine';
import { useEvent, useEventListener } from './use-event';

type IPlayerEvents = {
  statusChange: (event: { status: string }) => void;
};

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

const ROOT_TAG = 90_501;
const fabric = installRecordingFabric();
const tick = (): Promise<void> =>
  new Promise(resolve => setTimeout(resolve, 0));

beforeEach(() => fabric.reset());
afterEach(() => unmount(ROOT_TAG));

describe('useEvent', () => {
  it('starts with the initial value and follows each event', async () => {
    const { emitter, emit } = fakeEmitter();
    let captured: { status: string } | null | undefined;
    function Probe(): null {
      captured = useEvent(emitter, 'statusChange', { status: 'idle' });
      return null;
    }
    mount(ROOT_TAG, <Probe />);
    await tick();
    expect(captured).toEqual({ status: 'idle' });

    emit({ status: 'ready' });
    await tick();

    expect(captured).toEqual({ status: 'ready' });
  });

  it('is null until the first event when there is no initial value', async () => {
    const { emitter } = fakeEmitter();
    let captured: { status: string } | null | undefined;
    function Probe(): null {
      captured = useEvent(emitter, 'statusChange');
      return null;
    }
    mount(ROOT_TAG, <Probe />);
    await tick();

    expect(captured).toBeNull();
  });
});

describe('useEventListener', () => {
  it('calls the listener with each event', async () => {
    const { emitter, emit } = fakeEmitter();
    const listener = vi.fn();
    function Probe(): null {
      useEventListener(emitter, 'statusChange', listener);
      return null;
    }
    mount(ROOT_TAG, <Probe />);
    await tick();

    emit({ status: 'ready' });

    expect(listener).toHaveBeenCalledWith({ status: 'ready' });
  });

  it('calls the latest listener without subscribing again', async () => {
    const { emitter, emit, listeners } = fakeEmitter();
    const first = vi.fn();
    const second = vi.fn();
    let setListener: (value: 'second') => void = () => undefined;
    function Probe(): null {
      const [which, update] = useState<'first' | 'second'>('first');
      setListener = update;
      useEventListener(
        emitter,
        'statusChange',
        which === 'first' ? first : second,
      );
      return null;
    }
    mount(ROOT_TAG, <Probe />);
    await tick();

    setListener('second');
    await tick();
    emit({ status: 'x' });

    expect(first).not.toHaveBeenCalled();
    expect(second).toHaveBeenCalledTimes(1);
    expect(listeners).toHaveLength(1);
  });

  it('removes the subscription when the component unmounts', async () => {
    const { emitter, remove } = fakeEmitter();
    function Probe(): null {
      useEventListener(emitter, 'statusChange', () => undefined);
      return null;
    }
    mount(ROOT_TAG, <Probe />);
    await tick();

    unmount(ROOT_TAG);

    expect(remove).toHaveBeenCalledTimes(1);
  });
});
