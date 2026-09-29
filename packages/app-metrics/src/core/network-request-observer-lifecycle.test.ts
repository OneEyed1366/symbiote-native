import { describe, expect, it, vi } from 'vitest';
import { createNetworkRequestObserverLifecycle } from './network-request-observer-lifecycle';
import type { INetworkRequestFilter } from './types';

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

vi.mock('./app-metrics', () => ({
  NetworkRequestObserver: FakeNetworkRequestObserver,
}));

function createSyncEffectRunner(): {
  run: (effect: () => void) => void;
  rerun: () => void;
} {
  let runner: (() => void) | undefined;
  return {
    run: effect => {
      runner = effect;
      runner();
    },
    rerun: () => runner?.(),
  };
}

describe('createNetworkRequestObserverLifecycle (Positive: creates once, applies a later filter change, forwards events, cleans up)', () => {
  it('constructs the observer with the initial filter', () => {
    const observer = createNetworkRequestObserverLifecycle(
      () => ({ filter: { hosts: ['a'] } }),
      fn => fn(),
      vi.fn(),
    );

    expect(
      (observer as unknown as InstanceType<typeof FakeNetworkRequestObserver>)
        .filter,
    ).toEqual({ hosts: ['a'] });
  });

  it('does not call setFilter on the first effect run', () => {
    const observer = createNetworkRequestObserverLifecycle(
      () => ({ filter: { hosts: ['a'] } }),
      fn => fn(),
      vi.fn(),
    );

    expect(
      (observer as unknown as InstanceType<typeof FakeNetworkRequestObserver>)
        .setFilter,
    ).not.toHaveBeenCalled();
  });

  it('applies a later filter change via setFilter when the effect re-runs', () => {
    let currentFilter: INetworkRequestFilter | null | undefined = {
      hosts: ['a'],
    };
    const runner = createSyncEffectRunner();

    const observer = createNetworkRequestObserverLifecycle(
      () => ({ filter: currentFilter }),
      runner.run,
      vi.fn(),
    );

    currentFilter = { hosts: ['b'] };
    runner.rerun();

    expect(
      (observer as unknown as InstanceType<typeof FakeNetworkRequestObserver>)
        .setFilter,
    ).toHaveBeenCalledWith({
      hosts: ['b'],
    });
  });

  it('forwards requestStarted events to the current onStarted callback', () => {
    const onStarted = vi.fn();
    const observer = createNetworkRequestObserverLifecycle(
      () => ({ onStarted }),
      fn => fn(),
      vi.fn(),
    );

    (
      observer as unknown as InstanceType<typeof FakeNetworkRequestObserver>
    ).emit('requestStarted', { id: '1' } as never);

    expect(onStarted).toHaveBeenCalledWith({ id: '1' });
  });

  it('registers cleanup that unsubscribes and releases the observer', () => {
    const cleanups: Array<() => void> = [];
    const observer = createNetworkRequestObserverLifecycle(
      () => ({}),
      fn => fn(),
      cleanup => cleanups.push(cleanup),
    );

    for (const cleanup of cleanups) cleanup();

    expect(
      (observer as unknown as InstanceType<typeof FakeNetworkRequestObserver>)
        .release,
    ).toHaveBeenCalledTimes(1);
  });
});
