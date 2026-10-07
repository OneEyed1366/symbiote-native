// `injectEvent` and `injectEventListener` over an emitter with typed events

import '@angular/compiler';
import { Component, signal } from '@angular/core';
import type { Signal } from '@angular/core';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { mount, unmount } from '@symbiote-native/angular';
import { installRecordingFabric } from '@symbiote-native/test-utils';
import type { IEventEmitterOf } from '@symbiote-native/engine';
import { injectEvent, injectEventListener } from './inject-event';

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

const ROOT_TAG = 90_531;
installRecordingFabric();
const tick = (): Promise<void> =>
  new Promise(resolve => setTimeout(resolve, 0));

const held: { event: Signal<{ status: string } | null> | null } = {
  event: null,
};
const subject = {
  emitter: fakeEmitter(),
  listener: signal(vi.fn()),
};

@Component({ selector: 'event-host', standalone: true, template: '' })
class Host {
  constructor() {
    held.event = injectEvent(
      () => subject.emitter.emitter,
      () => 'statusChange',
      {
        status: 'idle',
      },
    );
    injectEventListener(
      () => subject.emitter.emitter,
      () => 'statusChange',
      subject.listener,
    );
  }
}

afterEach(() => {
  unmount(ROOT_TAG);
  held.event = null;
});

function reset(): void {
  subject.emitter = fakeEmitter();
  subject.listener.set(vi.fn());
}

describe('injectEvent', () => {
  it('starts with the initial value and follows each event', async () => {
    reset();
    mount(ROOT_TAG, Host);
    await tick();
    expect(held.event?.()).toEqual({ status: 'idle' });

    subject.emitter.emit({ status: 'ready' });

    expect(held.event?.()).toEqual({ status: 'ready' });
  });
});

describe('injectEventListener', () => {
  it('calls the latest listener without subscribing again', async () => {
    reset();
    const first = vi.fn();
    const second = vi.fn();
    subject.listener.set(first);
    mount(ROOT_TAG, Host);
    await tick();

    subject.listener.set(second);
    subject.emitter.emit({ status: 'x' });

    expect(first).not.toHaveBeenCalled();
    expect(second).toHaveBeenCalledWith({ status: 'x' });
    // One subscription for `injectEvent` and one for `injectEventListener`
    expect(subject.emitter.listeners).toHaveLength(2);
  });

  it('removes the subscriptions when the component is destroyed', async () => {
    reset();
    mount(ROOT_TAG, Host);
    await tick();

    unmount(ROOT_TAG);

    expect(subject.emitter.remove).toHaveBeenCalledTimes(2);
  });
});
