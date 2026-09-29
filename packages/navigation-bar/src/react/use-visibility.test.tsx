import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mount, unmount } from '@symbiote-native/react';
import { installRecordingFabric } from '@symbiote-native/test-utils';
import type { INavigationBarVisibilityEvent } from '../core';

const { addVisibilityListener, getVisibilityAsync, remove } = vi.hoisted(
  () => ({
    addVisibilityListener: vi.fn(),
    getVisibilityAsync: vi.fn(async () => 'visible' as const),
    remove: vi.fn(),
  }),
);

vi.mock('../core', () => ({ addVisibilityListener, getVisibilityAsync }));

const { useVisibility } = await import('./use-visibility');

const ROOT_TAG = 979;
const fabric = installRecordingFabric();
const tick = (): Promise<void> =>
  new Promise(resolve => setTimeout(resolve, 0));

let capturedVisibility: string | null | undefined;
let capturedListener:
  ((event: INavigationBarVisibilityEvent) => void) | undefined;

function Probe(): null {
  capturedVisibility = useVisibility();
  return null;
}

beforeEach(() => {
  fabric.reset();
  vi.clearAllMocks();
  capturedVisibility = undefined;
  getVisibilityAsync.mockResolvedValue('visible');
  addVisibilityListener.mockImplementation(
    (listener: typeof capturedListener) => {
      capturedListener = listener;
      return { remove };
    },
  );
});

afterEach(() => {
  unmount(ROOT_TAG);
});

describe('useVisibility (Positive: resolves, tracks, and cleans up)', () => {
  it('starts null and resolves the initial visibility', async () => {
    mount(ROOT_TAG, <Probe />);
    expect(capturedVisibility).toBeNull();

    await tick();

    expect(capturedVisibility).toBe('visible');
  });

  it('updates when the listener fires', async () => {
    mount(ROOT_TAG, <Probe />);
    await tick();

    capturedListener?.({ visibility: 'hidden', rawVisibility: 0 });
    await tick();

    expect(capturedVisibility).toBe('hidden');
  });

  it('removes the listener on unmount', async () => {
    mount(ROOT_TAG, <Probe />);
    await tick();

    unmount(ROOT_TAG);

    expect(remove).toHaveBeenCalledTimes(1);
  });
});
