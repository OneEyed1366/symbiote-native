// Co-located React-driven test (ADR 0025) for `useNetworkRequestObserver`
// Mocks the whole `core` module (the observer class) and expo-modules-core's
// `useReleasingSharedObject` - this hook's own lifecycle wiring is what's under test

import { createElement, type ReactElement } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mount, unmount } from '@symbiote-native/react';
import { installRecordingFabric } from '@symbiote-native/test-utils';
import { useNetworkRequestObserver } from './use-network-request-observer';
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

// Real `useReleasingSharedObject` reads a `.release()` object off a factory called once - the
// dependency-change-swap half of its behavior is never exercised here, this hook always passes
// `[]`, so a minimal create-once/release-on-unmount fake covers what's actually used
vi.mock('expo-modules-core', async () => {
  const react = await import('react');
  return {
    useReleasingSharedObject<T extends { release(): void }>(
      factory: () => T,
    ): T {
      const ref = react.useRef<T | null>(null);
      if (ref.current === null) ref.current = factory();
      react.useEffect(() => () => ref.current?.release(), []);
      return ref.current;
    },
  };
});

const ROOT_TAG = 905;
let lastObserver: IFakeNetworkRequestObserver | undefined;
let started: unknown[] = [];
let completed: unknown[] = [];

function Probe({
  filter,
}: {
  filter?: INetworkRequestFilter | null;
}): ReactElement {
  lastObserver = useNetworkRequestObserver({
    filter,
    onStarted: event => started.push(event),
    onCompleted: event => completed.push(event),
  }) as unknown as IFakeNetworkRequestObserver;
  return createElement('view');
}

const fabric = installRecordingFabric();

beforeEach(() => {
  fabric.reset();
  started = [];
  completed = [];
  lastObserver = undefined;
});

afterEach(() => unmount(ROOT_TAG));

describe('useNetworkRequestObserver', () => {
  describe('Positive', () => {
    it('constructs the observer with the initial filter', () => {
      mount(
        ROOT_TAG,
        createElement(Probe, { filter: { hosts: ['api.expo.dev'] } }),
      );

      expect(lastObserver?.filter).toEqual({ hosts: ['api.expo.dev'] });
    });

    it('forwards requestStarted/requestCompleted events to the callbacks', () => {
      mount(ROOT_TAG, createElement(Probe, {}));

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
      mount(ROOT_TAG, createElement(Probe, { filter: { hosts: ['a'] } }));

      expect(lastObserver?.setFilter).not.toHaveBeenCalled();
    });

    it('releases the observer on unmount', () => {
      mount(ROOT_TAG, createElement(Probe, {}));
      const observer = lastObserver;

      unmount(ROOT_TAG);

      expect(observer?.release).toHaveBeenCalledTimes(1);
    });
  });
});
