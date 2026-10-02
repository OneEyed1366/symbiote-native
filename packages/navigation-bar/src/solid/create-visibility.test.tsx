// Solid twin of the `../react`/`../vue` `useVisibility` tests

import { createEffect } from 'solid-js';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mount, unmount } from '@symbiote-native/solid';
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

const { createVisibility } = await import('./create-visibility');

const ROOT_TAG = 983;
const fabric = installRecordingFabric();
const tick = (): Promise<void> =>
  new Promise(resolve => setTimeout(resolve, 0));

let capturedVisibility: INavigationBarVisibility | null | undefined;
let capturedListener:
  ((event: INavigationBarVisibilityEvent) => void) | undefined;
let removeListenerSpy: ReturnType<typeof vi.fn>;

function Probe(): null {
  const visibility = createVisibility();
  createEffect(() => {
    capturedVisibility = visibility();
  });
  return null;
}

function mountHarness(): void {
  mount(ROOT_TAG, () => <Probe />);
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

describe('createVisibility (Positive: resolves, tracks, and cleans up)', () => {
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
