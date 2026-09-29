// Solid twin of `../react`'s `useNetworkRequestObserver` test

import { createSignal } from 'solid-js';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mount, unmount } from '@symbiote-native/solid';
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

vi.mock('../core', () => ({
  NetworkRequestObserver: FakeNetworkRequestObserver,
}));
vi.mock('../core/app-metrics', () => ({
  NetworkRequestObserver: FakeNetworkRequestObserver,
}));

const { useNetworkRequestObserver } =
  await import('./use-network-request-observer');

const ROOT_TAG = 907;
const fabric = installRecordingFabric();
const tick = (): Promise<void> =>
  new Promise(resolve => setTimeout(resolve, 0));

let lastObserver: IFakeNetworkRequestObserver | undefined;
let started: unknown[] = [];
let completed: unknown[] = [];
let setFilter:
  ((filter: INetworkRequestFilter | null | undefined) => void) | undefined;

function Probe(props: { initialFilter?: INetworkRequestFilter | null }): null {
  const [filter, updateFilter] = createSignal(props.initialFilter);
  setFilter = updateFilter;
  const observer = useNetworkRequestObserver(() => ({
    filter: filter(),
    onStarted: event => started.push(event),
    onCompleted: event => completed.push(event),
  }));
  lastObserver = observer as unknown as IFakeNetworkRequestObserver;
  return null;
}

function mountHarness(initialFilter?: INetworkRequestFilter | null): void {
  mount(ROOT_TAG, () => <Probe initialFilter={initialFilter} />);
}

beforeEach(() => {
  fabric.reset();
  started = [];
  completed = [];
  lastObserver = undefined;
  setFilter = undefined;
});

afterEach(() => unmount(ROOT_TAG));

describe('useNetworkRequestObserver (Positive: creates once, forwards events, applies a later filter change, releases)', () => {
  it('constructs the observer with the initial filter', () => {
    mountHarness({ hosts: ['api.expo.dev'] });

    expect(lastObserver?.filter).toEqual({ hosts: ['api.expo.dev'] });
  });

  it('forwards requestStarted/requestCompleted events to the callbacks', () => {
    mountHarness();

    const event = {
      id: '1',
      url: 'https://expo.dev',
      method: 'GET',
      startedAt: 'now',
    };
    lastObserver?.emit('requestStarted', event as never);
    expect(started).toEqual([event]);

    const completedEvent = { id: '1', statusCode: 200 };
    lastObserver?.emit('requestCompleted', completedEvent as never);
    expect(completed).toEqual([completedEvent]);
  });

  it('does not re-apply the filter on the first render', () => {
    mountHarness({ hosts: ['a'] });

    expect(lastObserver?.setFilter).not.toHaveBeenCalled();
  });

  it('applies a later filter change via setFilter, not by recreating the observer', async () => {
    mountHarness({ hosts: ['a'] });
    const observer = lastObserver;

    setFilter?.({ hosts: ['b'] });
    await tick();

    expect(lastObserver).toBe(observer);
    expect(observer?.setFilter).toHaveBeenCalledWith({ hosts: ['b'] });
  });

  it('releases the observer on unmount', () => {
    mountHarness();
    const observer = lastObserver;

    unmount(ROOT_TAG);

    expect(observer?.release).toHaveBeenCalledTimes(1);
  });
});
