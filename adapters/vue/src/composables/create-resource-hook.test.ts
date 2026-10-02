// Every `useReleasingSharedObject`-style composable (`useAudioPlayer`, `useImageManipulator`, ...)
// binds this to its own `createXController()` instead of repeating the computed/watch wiring

import { defineComponent, h, ref, type VNode } from '@vue/runtime-core';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mount, unmount } from '@symbiote-native/vue';
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

const ROOT_TAG = 90_202;
const fabric = installRecordingFabric();
const tick = (): Promise<void> =>
  new Promise(resolve => setTimeout(resolve, 0));

let captured: ReturnType<typeof useResource> | undefined;
let key: ReturnType<typeof ref<string>>;

function mountHarness(initial: string): void {
  key = ref(initial);
  const Probe = defineComponent(() => {
    captured = useResource(() => [key.value]);
    return (): VNode => h('text', 'probe');
  });
  mount(ROOT_TAG, { render: (): VNode => h(Probe) });
}

beforeEach(() => {
  fabric.reset();
  vi.clearAllMocks();
  captured = undefined;
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
    expect(captured?.value.key).toBe('a');
  });

  it('returns the same resource while the key ref is unchanged', async () => {
    mountHarness('a');
    await tick();
    const first = captured?.value;

    expect(captured?.value).toBe(first);
    expect(create).toHaveBeenCalledTimes(1);
  });

  it('recreates and disposes the stale resource when the key changes', async () => {
    mountHarness('a');
    await tick();
    const stale = captured?.value;

    key.value = 'b';
    await tick();

    expect(captured?.value).not.toBe(stale);
    expect(dispose).toHaveBeenCalledWith(stale);
  });

  it('disposes the current resource on unmount', async () => {
    mountHarness('a');
    await tick();
    const current = captured?.value;

    unmount(ROOT_TAG);

    expect(dispose).toHaveBeenCalledWith(current);
  });
});
