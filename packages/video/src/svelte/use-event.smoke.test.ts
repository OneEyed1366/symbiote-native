// Svelte `useEvent` and `useEventListener` through the real compiler over a fake emitter

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mount, unmount } from '@symbiote-native/svelte/native-view-bridge';
import { installRecordingFabric } from '@symbiote-native/test-utils';
import {
  createSvelteHarness,
  loadComponent,
} from './svelte-compile.test-helper';

if (globalThis.window === undefined)
  Object.assign(globalThis, { window: globalThis });
if (globalThis.navigator === undefined) {
  Object.assign(globalThis, { navigator: { product: 'ReactNative' } });
}

const ROOT_TAG = 91_971;
const fabric = installRecordingFabric();
const tick = (): Promise<void> =>
  new Promise(resolve => setTimeout(resolve, 0));

let harness = createSvelteHarness('use-event');

beforeEach(() => {
  fabric.reset();
  harness = createSvelteHarness('use-event');
});

afterEach(() => {
  unmount(ROOT_TAG);
  harness.cleanup();
});

function fakeEmitter() {
  const listeners: ((...args: never[]) => unknown)[] = [];
  const remove = vi.fn();
  const emitter = {
    addListener: (_name: string, listener: (...args: never[]) => unknown) => {
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

const PROBE_APP = `<script lang="ts">
   import { useEvent, useEventListener } from '@symbiote-native/svelte/runes/use-event';
   const emitter = globalThis.__emitter;
   const event = useEvent(() => emitter, () => 'statusChange', { status: 'idle' });
   let listener = $state(globalThis.__listener);
   useEventListener(() => emitter, () => 'statusChange', () => listener);
   Object.assign(globalThis, {
     __event: () => event.current,
     __setListener: (value) => { listener = value; },
   });
 </script>`;

async function mountProbe(
  name: string,
  emitter: object,
  listener: unknown,
): Promise<void> {
  Reflect.set(globalThis, '__emitter', emitter);
  Reflect.set(globalThis, '__listener', listener);
  const app = harness.compileSource(__dirname, name, PROBE_APP);
  mount(ROOT_TAG, await loadComponent(app));
  await tick();
  await tick();
}

function readGlobal(name: string): (...args: unknown[]) => unknown {
  const value: unknown = Reflect.get(globalThis, name);
  if (typeof value !== 'function') throw new Error(`${name} was not set`);
  return (...args) => value(...args);
}

describe('useEvent', () => {
  it('starts with the initial value and follows each event', async () => {
    const { emitter, emit } = fakeEmitter();
    await mountProbe('event-app', emitter, vi.fn());
    expect(readGlobal('__event')()).toEqual({ status: 'idle' });

    emit({ status: 'ready' });

    expect(readGlobal('__event')()).toEqual({ status: 'ready' });
  });
});

describe('useEventListener', () => {
  it('calls the latest listener without subscribing again', async () => {
    const { emitter, emit, listeners } = fakeEmitter();
    const first = vi.fn();
    const second = vi.fn();
    await mountProbe('listener-app', emitter, first);

    readGlobal('__setListener')(second);
    await tick();
    emit({ status: 'x' });

    expect(first).not.toHaveBeenCalled();
    expect(second).toHaveBeenCalledWith({ status: 'x' });
    // One subscription for `useEvent` and one for `useEventListener`
    expect(listeners).toHaveLength(2);
  });

  it('removes the subscriptions when the owner is destroyed', async () => {
    const { emitter, remove } = fakeEmitter();
    await mountProbe('remove-app', emitter, vi.fn());

    unmount(ROOT_TAG);
    await tick();

    expect(remove).toHaveBeenCalledTimes(2);
  });
});
