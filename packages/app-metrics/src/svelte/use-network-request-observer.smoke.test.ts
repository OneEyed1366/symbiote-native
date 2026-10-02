// Svelte twin of `../react`'s `useNetworkRequestObserver` test, driven through the real compiler

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mount, unmount } from '@symbiote-native/svelte/native-view-bridge';
import { installRecordingFabric } from '@symbiote-native/test-utils';
import {
  createSvelteHarness,
  loadComponent,
} from './svelte-compile.test-helper';

type IListener = (payload: never) => void;

const { FakeNetworkRequestObserver } = vi.hoisted(() => {
  class FakeNetworkRequestObserver {
    readonly filter: unknown;
    setFilter = vi.fn();
    release = vi.fn();
    private readonly listenersByName = new Map<string, Set<IListener>>();

    constructor(filter?: unknown) {
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

vi.mock('../core/app-metrics', () => ({
  NetworkRequestObserver: FakeNetworkRequestObserver,
}));

if (globalThis.window === undefined)
  Object.assign(globalThis, { window: globalThis });
if (globalThis.navigator === undefined) {
  Object.assign(globalThis, { navigator: { product: 'ReactNative' } });
}

const ROOT_TAG = 91_957;
const fabric = installRecordingFabric();
const tick = (): Promise<void> =>
  new Promise(resolve => setTimeout(resolve, 0));

let harness = createSvelteHarness('network-request-observer');

beforeEach(() => {
  fabric.reset();
  harness = createSvelteHarness('network-request-observer');
});

afterEach(() => {
  unmount(ROOT_TAG);
  harness.cleanup();
});

async function mountApp(name: string, appSource: string): Promise<void> {
  const app = harness.compileSource(__dirname, name, appSource);
  mount(ROOT_TAG, await loadComponent(app));
  await tick();
  await tick();
}

const PROBE_APP = `<script lang="ts">
   import { useNetworkRequestObserver } from './use-network-request-observer.svelte';
   let hosts = $state(['a']);
   const started: unknown[] = [];
   const completed: unknown[] = [];
   const observer = useNetworkRequestObserver(() => ({
     filter: { hosts },
     onStarted: event => started.push(event),
     onCompleted: event => completed.push(event),
   }));
   Object.assign(globalThis, {
     __capturedObserver: () => observer,
     __setHosts: (next: string[]) => { hosts = next; },
     __started: () => started,
     __completed: () => completed,
   });
 </script>`;

describe('useNetworkRequestObserver (Positive: creates once, forwards events, applies a later filter change, releases)', () => {
  it('constructs the observer with the initial filter', async () => {
    await mountApp('observer-probe-app', PROBE_APP);
    const captured = (
      globalThis as { __capturedObserver?: () => { filter: unknown } }
    ).__capturedObserver;

    expect(captured?.().filter).toEqual({ hosts: ['a'] });
  });

  it('forwards requestStarted/requestCompleted events to the callbacks', async () => {
    await mountApp('observer-events-app', PROBE_APP);
    const captured = (
      globalThis as {
        __capturedObserver?: () => InstanceType<
          typeof FakeNetworkRequestObserver
        >;
      }
    ).__capturedObserver;
    const started = (globalThis as { __started?: () => unknown[] }).__started;
    const completed = (globalThis as { __completed?: () => unknown[] })
      .__completed;

    const startedEvent = { id: '1' };
    captured?.().emit('requestStarted', startedEvent as never);
    expect(started?.()).toEqual([startedEvent]);

    const completedEvent = { id: '1', statusCode: 200 };
    captured?.().emit('requestCompleted', completedEvent as never);
    expect(completed?.()).toEqual([completedEvent]);
  });

  it('does not re-apply the filter on the first render', async () => {
    await mountApp('observer-initial-app', PROBE_APP);
    const captured = (
      globalThis as {
        __capturedObserver?: () => InstanceType<
          typeof FakeNetworkRequestObserver
        >;
      }
    ).__capturedObserver;

    expect(captured?.().setFilter).not.toHaveBeenCalled();
  });

  it('applies a later filter change via setFilter, not by recreating the observer', async () => {
    await mountApp('observer-change-app', PROBE_APP);
    const captured = (
      globalThis as {
        __capturedObserver?: () => InstanceType<
          typeof FakeNetworkRequestObserver
        >;
      }
    ).__capturedObserver;
    const setHosts = (globalThis as { __setHosts?: (next: string[]) => void })
      .__setHosts;
    const observer = captured?.();

    setHosts?.(['b']);
    await tick();

    expect(captured?.()).toBe(observer);
    expect(observer?.setFilter).toHaveBeenCalledWith({ hosts: ['b'] });
  });

  it('releases the observer on unmount', async () => {
    await mountApp('observer-unmount-app', PROBE_APP);
    const captured = (
      globalThis as {
        __capturedObserver?: () => InstanceType<
          typeof FakeNetworkRequestObserver
        >;
      }
    ).__capturedObserver;
    const observer = captured?.();

    unmount(ROOT_TAG);

    expect(observer?.release).toHaveBeenCalledTimes(1);
  });
});
