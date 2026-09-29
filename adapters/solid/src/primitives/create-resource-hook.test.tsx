// Every `useReleasingSharedObject`-style primitive (`useAudioPlayer`, `useImageManipulator`, ...)
// binds this to its own `createXController()` instead of repeating the memo/effect wiring

import { createSignal, type Accessor } from 'solid-js';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mount, unmount } from '@symbiote-native/solid';
import { installRecordingFabric } from '@symbiote-native/test-utils';
import { createResourceHook } from './create-resource-hook';

type IFakeResource = { key: string; dispose: ReturnType<typeof vi.fn> };

const create = vi.fn();
const dispose = vi.fn();

function createController(): {
  resolve: (key: string) => IFakeResource;
  flushDispose: () => void;
  dispose: () => void;
} {
  let current: { key: string; resource: IFakeResource } | null = null;
  let pending: IFakeResource | null = null;
  return {
    resolve: (key: string) => {
      if (current && current.key === key) return current.resource;
      if (current) pending = current.resource;
      const resource = create(key);
      current = { key, resource };
      return resource;
    },
    flushDispose: () => {
      if (pending) {
        dispose(pending);
        pending = null;
      }
    },
    dispose: () => {
      if (current) {
        dispose(current.resource);
        current = null;
      }
    },
  };
}

const useResource = createResourceHook(createController);

const ROOT_TAG = 90_203;
const fabric = installRecordingFabric();
const tick = (): Promise<void> =>
  new Promise(resolve => setTimeout(resolve, 0));

let captured: Accessor<IFakeResource> | undefined;
let setKey: ((key: string) => void) | undefined;

function Probe(props: { initial: string }): null {
  const [key, updateKey] = createSignal(props.initial);
  setKey = updateKey;
  captured = useResource(() => [key()]);
  return null;
}

function mountHarness(initial: string): void {
  mount(ROOT_TAG, () => <Probe initial={initial} />);
}

beforeEach(() => {
  fabric.reset();
  vi.clearAllMocks();
  captured = undefined;
  setKey = undefined;
  create.mockImplementation((k: string) => ({ key: k, dispose: vi.fn() }));
});

afterEach(() => {
  unmount(ROOT_TAG);
});

describe('createResourceHook (Positive: creates once, recreates on key change, disposes the stale one)', () => {
  it('creates a resource for the initial key', async () => {
    mountHarness('a');
    await tick();

    expect(create).toHaveBeenCalledWith('a');
    expect(captured?.().key).toBe('a');
  });

  it('returns the same resource while the key signal is unchanged', async () => {
    mountHarness('a');
    await tick();
    const first = captured?.();

    expect(captured?.()).toBe(first);
    expect(create).toHaveBeenCalledTimes(1);
  });

  it('recreates and disposes the stale resource when the key changes', async () => {
    mountHarness('a');
    await tick();
    const stale = captured?.();

    setKey?.('b');
    await tick();

    expect(captured?.()).not.toBe(stale);
    expect(dispose).toHaveBeenCalledWith(stale);
  });

  it('disposes the current resource on unmount', async () => {
    mountHarness('a');
    await tick();
    const current = captured?.();

    unmount(ROOT_TAG);

    expect(dispose).toHaveBeenCalledWith(current);
  });
});
