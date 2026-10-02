// Every `useReleasingSharedObject`-style hook (`useAudioPlayer`, `useImageManipulator`, ...)
// binds this factory to its own `createXController()`

import { useState } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mount, unmount } from '@symbiote-native/react';
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

const ROOT_TAG = 90_201;
const fabric = installRecordingFabric();
const tick = (): Promise<void> =>
  new Promise(resolve => setTimeout(resolve, 0));

let captured: IFakeResource | undefined;
let updateKey: ((key: string) => void) | undefined;

function Harness({ initial }: { initial: string }): null {
  const [key, setKey] = useState(initial);
  updateKey = setKey;
  captured = useResource(key);
  return null;
}

beforeEach(() => {
  fabric.reset();
  vi.clearAllMocks();
  captured = undefined;
  updateKey = undefined;
  create.mockImplementation((key: string) => ({ key, dispose: vi.fn() }));
});

afterEach(() => {
  unmount(ROOT_TAG);
});

describe('createResourceHook (Positive: creates once, recreates on key change, disposes the stale one)', () => {
  it('creates a resource for the initial key', async () => {
    mount(ROOT_TAG, <Harness initial="a" />);
    await tick();

    expect(create).toHaveBeenCalledWith('a');
    expect(captured?.key).toBe('a');
  });

  it('returns the same resource across re-renders with an unchanged key', async () => {
    mount(ROOT_TAG, <Harness initial="a" />);
    await tick();
    const first = captured;

    updateKey?.('a');
    await tick();

    expect(captured).toBe(first);
    expect(create).toHaveBeenCalledTimes(1);
  });

  it('recreates and disposes the stale resource when the key changes', async () => {
    mount(ROOT_TAG, <Harness initial="a" />);
    await tick();
    const stale = captured;

    updateKey?.('b');
    await vi.waitFor(() => expect(create).toHaveBeenCalledTimes(2));
    await tick();

    expect(captured).not.toBe(stale);
    expect(dispose).toHaveBeenCalledWith(stale);
  });

  it('disposes the current resource on unmount', async () => {
    mount(ROOT_TAG, <Harness initial="a" />);
    await tick();
    const current = captured;

    unmount(ROOT_TAG);

    expect(dispose).toHaveBeenCalledWith(current);
  });
});
