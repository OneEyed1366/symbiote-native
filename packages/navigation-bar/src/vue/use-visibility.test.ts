// Vue twin of the `../react` `useVisibility` test

import { defineComponent, h, type VNode } from '@vue/runtime-core';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mount, unmount } from '@symbiote-native/vue';
import { installRecordingFabric } from '@symbiote-native/test-utils';
import type { EventSubscription } from 'expo-modules-core';
import type {
  INavigationBarVisibility,
  INavigationBarVisibilityEvent,
} from '../core';

const { addVisibilityListener, getVisibilityAsync } = vi.hoisted(() => ({
  addVisibilityListener: vi.fn(),
  getVisibilityAsync: vi.fn(),
}));

vi.mock('../core', () => ({ addVisibilityListener, getVisibilityAsync }));

const { useVisibility } = await import('./use-visibility');

const ROOT_TAG = 981;
const fabric = installRecordingFabric();
const tick = (): Promise<void> =>
  new Promise(resolve => setTimeout(resolve, 0));

let capturedVisibility: INavigationBarVisibility | null | undefined;
let capturedListener:
  ((event: INavigationBarVisibilityEvent) => void) | undefined;
let removeListenerSpy: ReturnType<typeof vi.fn>;

function mountHarness(): void {
  const Harness = defineComponent(() => {
    const visibility = useVisibility();
    return (): VNode | null => {
      capturedVisibility = visibility.value;
      return null;
    };
  });
  mount(ROOT_TAG, { render: (): VNode => h(Harness) });
}

beforeEach(() => {
  fabric.reset();
  vi.clearAllMocks();
  capturedVisibility = undefined;
  removeListenerSpy = vi.fn();
  getVisibilityAsync.mockResolvedValue('visible');
  addVisibilityListener.mockImplementation(
    (listener: typeof capturedListener) => {
      capturedListener = listener;
      return { remove: removeListenerSpy } as EventSubscription;
    },
  );
});

afterEach(() => {
  unmount(ROOT_TAG);
});

describe('useVisibility (Positive: resolves, tracks, and cleans up)', () => {
  it('starts null and resolves the initial visibility', async () => {
    mountHarness();
    expect(capturedVisibility).toBeNull();

    await tick();

    expect(capturedVisibility).toBe('visible');
  });

  it('updates when the listener fires', async () => {
    mountHarness();
    await tick();

    capturedListener?.({ visibility: 'hidden', rawVisibility: 0 });
    await tick();

    expect(capturedVisibility).toBe('hidden');
  });

  it('removes the listener on unmount', async () => {
    mountHarness();
    await tick();

    unmount(ROOT_TAG);

    expect(removeListenerSpy).toHaveBeenCalledTimes(1);
  });
});
