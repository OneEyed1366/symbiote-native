// Angular twin of `../react`'s `useNetworkRequestObserver` test

import '@angular/compiler';
import { Component, signal } from '@angular/core';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mount, unmount } from '@symbiote-native/angular';
import { installRecordingFabric } from '@symbiote-native/test-utils';
import type { INetworkRequestFilter } from '../core';

type IListener = (payload: never) => void;

const { FakeNetworkRequestObserver } = vi.hoisted(() => {
  class FakeNetworkRequestObserver {
    readonly filter: INetworkRequestFilter | null | undefined;
    setFilter = vi.fn();
    release = vi.fn();
    private readonly listenersByName = new Map<string, Set<IListener>>();

    constructor(filter?: INetworkRequestFilter | null) {
      this.filter = filter;
    }

    addListener(name: string, listener: IListener): { remove: () => void } {
      let listeners = this.listenersByName.get(name);
      if (!listeners) {
        listeners = new Set();
        this.listenersByName.set(name, listeners);
      }
      listeners.add(listener);
      return { remove: () => listeners.delete(listener) };
    }

    emit(name: string, payload: never): void {
      for (const listener of this.listenersByName.get(name) ?? [])
        listener(payload);
    }
  }
  return { FakeNetworkRequestObserver };
});
type IFakeNetworkRequestObserver = InstanceType<
  typeof FakeNetworkRequestObserver
>;

vi.mock('../core/app-metrics', () => ({
  NetworkRequestObserver: FakeNetworkRequestObserver,
}));

const { injectNetworkRequestObserver } =
  await import('./inject-network-request-observer');

const ROOT_TAG = 90_990;
const fabric = installRecordingFabric();
const tick = (): Promise<void> =>
  new Promise(resolve => setTimeout(resolve, 0));

let capturedHost: HostFixture | undefined;

@Component({
  selector: 'network-request-observer-host',
  standalone: true,
  template: '',
})
class HostFixture {
  readonly hosts = signal(['a']);
  started: unknown[] = [];
  completed: unknown[] = [];
  readonly observer = injectNetworkRequestObserver(() => ({
    filter: { hosts: this.hosts() },
    onStarted: event => this.started.push(event),
    onCompleted: event => this.completed.push(event),
  }));
  constructor() {
    // eslint-disable-next-line @typescript-eslint/no-this-alias
    capturedHost = this;
  }
}

beforeEach(() => {
  fabric.reset();
  capturedHost = undefined;
});

afterEach(() => unmount(ROOT_TAG));

describe('injectNetworkRequestObserver (Positive: creates once, forwards events, applies a later filter change, releases)', () => {
  it('constructs the observer with the initial filter', () => {
    mount(ROOT_TAG, HostFixture);

    expect(
      (capturedHost?.observer as unknown as IFakeNetworkRequestObserver).filter,
    ).toEqual({ hosts: ['a'] });
  });

  it('forwards requestStarted/requestCompleted events to the callbacks', () => {
    mount(ROOT_TAG, HostFixture);
    const observer =
      capturedHost?.observer as unknown as IFakeNetworkRequestObserver;

    const event = { id: '1' };
    observer.emit('requestStarted', event as never);
    expect(capturedHost?.started).toEqual([event]);

    const completedEvent = { id: '1', statusCode: 200 };
    observer.emit('requestCompleted', completedEvent as never);
    expect(capturedHost?.completed).toEqual([completedEvent]);
  });

  it('does not re-apply the filter on the first render', () => {
    mount(ROOT_TAG, HostFixture);
    const observer =
      capturedHost?.observer as unknown as IFakeNetworkRequestObserver;

    expect(observer.setFilter).not.toHaveBeenCalled();
  });

  it('applies a later filter change via setFilter, not by recreating the observer', async () => {
    mount(ROOT_TAG, HostFixture);
    const observer = capturedHost?.observer;

    capturedHost?.hosts.set(['b']);
    await tick();

    expect(capturedHost?.observer).toBe(observer);
    expect(
      (observer as unknown as IFakeNetworkRequestObserver).setFilter,
    ).toHaveBeenCalledWith({ hosts: ['b'] });
  });

  it('releases the observer on unmount', () => {
    mount(ROOT_TAG, HostFixture);
    const observer =
      capturedHost?.observer as unknown as IFakeNetworkRequestObserver;

    unmount(ROOT_TAG);

    expect(observer.release).toHaveBeenCalledTimes(1);
  });
});
